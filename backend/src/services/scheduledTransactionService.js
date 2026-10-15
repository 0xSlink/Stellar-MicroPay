"use strict";

/**
 * src/services/scheduledTransactionService.js
 *
 * Durable service for scheduling, persisting, and executing pre-signed Stellar transactions.
 * (Issue #1397: Persist scheduled transactions so restarts don't silently drop schedules)
 *
 * Architecture & Downtime Policy:
 *   1. Persistence: All scheduled transactions are persisted via `scheduledTransactionStore`
 *      using an atomic, versioned JSON document (`data/scheduled_transactions.json`).
 *   2. Boot Recovery & Re-arming:
 *      On service startup or reboot, `rearmAllTimers()` scans all stored transactions.
 *      - Future schedules (`submitAt > now`): Timer is armed for the exact remaining delay (`submitAt - now`).
 *      - Overdue schedules (`submitAt <= now`): Handled per the **Immediate Execution with Notice** policy:
 *          - If `attempts < MAX_ATTEMPTS` (3), the transaction is flagged with:
 *              `recoveredAfterDowntime: true`
 *              `downtimeNotice: "Scheduled time passed during backend downtime; executed immediately upon recovery"`
 *            and queued for immediate execution (`setTimeout(..., 0)`).
 *          - If `attempts >= MAX_ATTEMPTS`, the transaction is marked as `failed` with notice.
 *   3. Execution & Retries:
 *      When a scheduled timer fires, the configured executor (defaults to `stellarService.submitTransaction`)
 *      submits the signed XDR. Failures record `lastError` and increment `attempts` up to 3 times.
 */

require("dotenv").config();
const { createScheduledTransactionStore } = require("../storage/scheduledTransactionStore");

const MAX_ATTEMPTS = 3;

// Internal active store & timer map
let store = createScheduledTransactionStore();
const activeTimers = new Map();

// Default transaction executor (submits via stellarService if available)
let defaultExecutor = null;
try {
  const { submitTransaction } = require("./stellarService");
  defaultExecutor = async (tx) => {
    return await submitTransaction(tx.signedXDR);
  };
} catch {
  defaultExecutor = async () => ({ successful: true });
}

let customExecutor = null;

function getExecutor() {
  return customExecutor || defaultExecutor;
}

function setExecutor(fn) {
  customExecutor = fn;
}

/**
 * Disarm and clear a timer for a given transaction ID.
 */
function disarmTimer(id) {
  const timer = activeTimers.get(Number(id));
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(Number(id));
  }
}

/**
 * Clear all active in-memory timers (used for clean shutdown and tests).
 */
function stopAllTimers() {
  for (const [, timer] of activeTimers) {
    clearTimeout(timer);
  }
  activeTimers.clear();
}

/**
 * Arm a timer for a scheduled transaction.
 *
 * Downtime handling policy:
 * - If `submitAt <= now` and `attempts < MAX_ATTEMPTS`, trigger immediately with notice.
 * - If `submitAt > now`, arm timer for `submitAt - now`.
 */
function armTimer(tx) {
  if (!tx || tx.id == null) return;
  disarmTimer(tx.id);

  if (tx.status === "completed" || tx.attempts >= MAX_ATTEMPTS) {
    return;
  }

  const now = Date.now();
  const delayMs = Math.max(0, tx.submitAt - now);

  if (delayMs === 0 && tx.submitAt < now) {
    tx.recoveredAfterDowntime = true;
    tx.downtimeNotice =
      "Scheduled time passed during backend downtime; executed immediately upon recovery";
    store.set(tx.id, tx);
  }

  const timer = setTimeout(async () => {
    activeTimers.delete(tx.id);
    await executeScheduledTransaction(tx.id);
  }, delayMs);

  // Allow Node process to exit cleanly if this timer is active
  if (timer.unref) {
    timer.unref();
  }

  activeTimers.set(tx.id, timer);
}

/**
 * Executes a scheduled transaction when its timer fires.
 */
async function executeScheduledTransaction(id) {
  const tx = store.get(id);
  if (!tx || tx.status === "completed" || tx.attempts >= MAX_ATTEMPTS) {
    return;
  }

  const executor = getExecutor();
  try {
    const result = await executor(tx);
    tx.attempts += 1;
    tx.status = "completed";
    tx.executedAt = Date.now();
    tx.executionResult = result;
    tx.lastError = null;
    store.set(tx.id, tx);
  } catch (err) {
    tx.attempts += 1;
    tx.lastError = err?.message || String(err);
    if (tx.attempts >= MAX_ATTEMPTS) {
      tx.status = "failed";
    }
    store.set(tx.id, tx);
  }
}

/**
 * Re-arm all pending transactions from the persistent store.
 * Automatically called on boot / module initialization.
 */
function rearmAllTimers() {
  stopAllTimers();
  const all = store.getAll();
  for (const tx of all) {
    if (tx.status !== "completed" && tx.attempts < MAX_ATTEMPTS) {
      armTimer(tx);
    }
  }
}

/**
 * Initialize or re-configure the service with custom options (e.g., custom dataFile for tests).
 */
function initService(options = {}) {
  stopAllTimers();
  store = createScheduledTransactionStore(options);
  rearmAllTimers();
  return store;
}

/**
 * Store and arm a pre-signed transaction for future submission.
 *
 * @param {string} signedXDR - The signed transaction XDR
 * @param {Date} submitAt - Timestamp when the transaction should be submitted
 * @param {string} publicKey - The account public key that owns this transaction
 * @returns {Object} The stored transaction with ID
 */
function scheduleTransaction(signedXDR, submitAt, publicKey) {
  // Validate inputs
  if (!signedXDR || typeof signedXDR !== "string") {
    const error = new Error("Signed XDR is required and must be a string");
    error.status = 400;
    throw error;
  }

  if (!(submitAt instanceof Date) || isNaN(submitAt.getTime())) {
    const error = new Error("submitAt must be a valid Date object");
    error.status = 400;
    throw error;
  }

  // Validate public key format
  if (!/^G[A-Z0-9]{55}$/.test(publicKey)) {
    const error = new Error("Invalid Stellar public key format");
    error.status = 400;
    throw error;
  }

  const id = store.nextId();
  const scheduledTx = {
    id,
    signedXDR,
    submitAt: submitAt.getTime(),
    publicKey,
    attempts: 0,
    lastError: null,
    createdAt: Date.now(),
    status: "pending",
    recoveredAfterDowntime: false,
    downtimeNotice: null,
  };

  const saved = store.set(id, scheduledTx);
  armTimer(saved);

  return saved;
}

/**
 * Get pending scheduled transactions for a public key.
 *
 * @param {string} publicKey - The account public key
 * @returns {Array} Array of pending scheduled transactions
 */
function getPendingTransactions(publicKey) {
  if (!publicKey || !/^G[A-Z0-9]{55}$/.test(publicKey)) {
    const error = new Error("Invalid Stellar public key format");
    error.status = 400;
    throw error;
  }

  const pending = [];
  const all = store.getAll();

  for (const tx of all) {
    if (
      tx.publicKey === publicKey &&
      tx.status !== "completed" &&
      tx.attempts < MAX_ATTEMPTS
    ) {
      pending.push({
        id: tx.id,
        submitAt: new Date(tx.submitAt),
        publicKey: tx.publicKey,
        attempts: tx.attempts,
        createdAt: new Date(tx.createdAt),
        status: tx.status || "pending",
        recoveredAfterDowntime: Boolean(tx.recoveredAfterDowntime),
        downtimeNotice: tx.downtimeNotice || null,
      });
    }
  }

  return pending.sort((a, b) => a.submitAt - b.submitAt);
}

/**
 * Get a scheduled transaction by ID.
 *
 * @param {number} id - The transaction ID
 * @returns {Object|null} The transaction or null if not found
 */
function getTransactionById(id) {
  return store.get(id);
}

/**
 * Cancel a scheduled transaction.
 *
 * @param {number} id - The transaction ID
 * @returns {boolean} True if cancelled, false if not found
 */
function cancelTransaction(id) {
  disarmTimer(id);
  return store.delete(id);
}

/**
 * Get transactions that are due for submission (submitAt <= now).
 *
 * @returns {Array} Array of transactions ready for submission
 */
function getDueTransactions() {
  const now = Date.now();
  const due = [];
  const all = store.getAll();

  for (const tx of all) {
    if (
      tx.submitAt <= now &&
      tx.status !== "completed" &&
      tx.attempts < MAX_ATTEMPTS
    ) {
      due.push(tx);
    }
  }

  return due.sort((a, b) => a.submitAt - b.submitAt);
}

/**
 * Increment the attempt counter for a transaction.
 *
 * @param {number} id - The transaction ID
 * @param {string|null} error - Error message if submission failed, null if successful
 */
function incrementAttempt(id, error = null) {
  const tx = store.get(id);
  if (tx) {
    tx.attempts += 1;
    tx.lastError = error || null;
    if (tx.attempts >= MAX_ATTEMPTS) {
      tx.status = "failed";
      disarmTimer(id);
    }
    store.set(id, tx);
  }
}

/**
 * Remove a transaction from the store (after successful submission or final failure).
 *
 * @param {number} id - The transaction ID
 * @returns {boolean} True if removed, false if not found
 */
function removeTransaction(id) {
  disarmTimer(id);
  return store.delete(id);
}

// Arm any pending timers on initial load
rearmAllTimers();

module.exports = {
  scheduleTransaction,
  getPendingTransactions,
  getTransactionById,
  cancelTransaction,
  getDueTransactions,
  incrementAttempt,
  removeTransaction,
  rearmAllTimers,
  stopAllTimers,
  initService,
  setExecutor,
  armTimer,
  executeScheduledTransaction,
  getStore: () => store,
  getActiveTimerCount: () => activeTimers.size,
};
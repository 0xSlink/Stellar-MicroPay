"use strict";

const fs = require("fs");
const path = require("path");
const scheduledTransactionService = require("../src/services/scheduledTransactionService");
const { createScheduledTransactionStore } = require("../src/storage/scheduledTransactionStore");

describe("Scheduled Transaction Persistence & Re-Arming (Issue #1397)", () => {
  const TEST_DATA_DIR = path.join(__dirname, "tmp_scheduled_store");
  const TEST_DATA_FILE = path.join(TEST_DATA_DIR, "test_scheduled.json");
  const VALID_PK = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const SAMPLE_XDR = "AAAAAGL2...testSignedXDR...";

  beforeEach(() => {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

    scheduledTransactionService.initService({ dataFile: TEST_DATA_FILE });
  });

  afterEach(() => {
    scheduledTransactionService.stopAllTimers();
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe("Durable Store & Versioning", () => {
    it("persists a newly scheduled transaction to a versioned JSON document", () => {
      const futureDate = new Date(Date.now() + 60000);
      const scheduled = scheduledTransactionService.scheduleTransaction(
        SAMPLE_XDR,
        futureDate,
        VALID_PK
      );

      expect(scheduled.id).toBe(1);
      expect(scheduled.publicKey).toBe(VALID_PK);

      // Verify file exists on disk
      expect(fs.existsSync(TEST_DATA_FILE)).toBe(true);

      const diskContent = JSON.parse(fs.readFileSync(TEST_DATA_FILE, "utf8"));
      expect(diskContent.version).toBe(1);
      expect(diskContent.lastId).toBe(1);
      expect(Array.isArray(diskContent.transactions)).toBe(true);
      expect(diskContent.transactions).toHaveLength(1);
      expect(diskContent.transactions[0].signedXDR).toBe(SAMPLE_XDR);
    });

    it("cancelling a transaction deletes it from disk and disarms its timer", () => {
      const futureDate = new Date(Date.now() + 60000);
      const scheduled = scheduledTransactionService.scheduleTransaction(
        SAMPLE_XDR,
        futureDate,
        VALID_PK
      );

      expect(scheduledTransactionService.getActiveTimerCount()).toBe(1);

      const cancelled = scheduledTransactionService.cancelTransaction(scheduled.id);
      expect(cancelled).toBe(true);
      expect(scheduledTransactionService.getActiveTimerCount()).toBe(0);

      const diskContent = JSON.parse(fs.readFileSync(TEST_DATA_FILE, "utf8"));
      expect(diskContent.transactions).toHaveLength(0);
    });
  });

  describe("Restart Simulation & Timer Re-Arming", () => {
    it("simulates a server restart: reloads pending schedules and re-arms timers", () => {
      const futureDate1 = new Date(Date.now() + 100000);
      const futureDate2 = new Date(Date.now() + 200000);

      scheduledTransactionService.scheduleTransaction(SAMPLE_XDR, futureDate1, VALID_PK);
      scheduledTransactionService.scheduleTransaction(SAMPLE_XDR, futureDate2, VALID_PK);

      expect(scheduledTransactionService.getActiveTimerCount()).toBe(2);

      // --- SIMULATE CRASH / RESTART ---
      // 1. Terminate all active in-memory timers
      scheduledTransactionService.stopAllTimers();
      expect(scheduledTransactionService.getActiveTimerCount()).toBe(0);

      // 2. Re-initialize service pointing to the same data file (boot sequence)
      scheduledTransactionService.initService({ dataFile: TEST_DATA_FILE });

      // 3. Verify schedules were preserved and re-armed
      expect(scheduledTransactionService.getActiveTimerCount()).toBe(2);

      const pending = scheduledTransactionService.getPendingTransactions(VALID_PK);
      expect(pending).toHaveLength(2);
      expect(pending[0].id).toBe(1);
      expect(pending[1].id).toBe(2);
    });
  });

  describe("Downtime Policy: Immediate Execution with Notice", () => {
    it("detects overdue schedules whose fire time passed during downtime, marks notice, and executes immediately", async () => {
      const executedCalls = [];
      scheduledTransactionService.setExecutor(async (tx) => {
        executedCalls.push(tx);
        return { hash: "dummy_tx_hash", successful: true };
      });

      // Schedule a transaction that was supposed to run 10 seconds ago
      const pastDate = new Date(Date.now() - 10000);
      const rawStore = createScheduledTransactionStore({ dataFile: TEST_DATA_FILE });
      const missedTx = {
        id: 1,
        signedXDR: SAMPLE_XDR,
        submitAt: pastDate.getTime(),
        publicKey: VALID_PK,
        attempts: 0,
        createdAt: pastDate.getTime() - 5000,
        status: "pending",
        recoveredAfterDowntime: false,
      };
      rawStore.set(1, missedTx);

      // Boot / rearm service
      scheduledTransactionService.initService({ dataFile: TEST_DATA_FILE });

      // Allow immediate timer callback to tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(executedCalls).toHaveLength(1);
      expect(executedCalls[0].id).toBe(1);

      // Check transaction updated on disk
      const updated = scheduledTransactionService.getTransactionById(1);
      expect(updated.status).toBe("completed");
      expect(updated.recoveredAfterDowntime).toBe(true);
      expect(updated.downtimeNotice).toMatch(/downtime/i);
    });

    it("marks transaction as failed if it already exceeded max retry attempts during downtime", async () => {
      const pastDate = new Date(Date.now() - 5000);
      const rawStore = createScheduledTransactionStore({ dataFile: TEST_DATA_FILE });
      rawStore.set(1, {
        id: 1,
        signedXDR: SAMPLE_XDR,
        submitAt: pastDate.getTime(),
        publicKey: VALID_PK,
        attempts: 3,
        createdAt: pastDate.getTime() - 10000,
        status: "pending",
      });

      scheduledTransactionService.initService({ dataFile: TEST_DATA_FILE });

      // Max attempts reached, should not be armed
      expect(scheduledTransactionService.getActiveTimerCount()).toBe(0);
      const pending = scheduledTransactionService.getPendingTransactions(VALID_PK);
      expect(pending).toHaveLength(0);
    });
  });
});

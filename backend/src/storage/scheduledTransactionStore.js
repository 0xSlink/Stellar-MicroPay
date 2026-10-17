"use strict";

/**
 * src/storage/scheduledTransactionStore.js
 *
 * Persistent storage for scheduled transactions (Issue #1397).
 *
 * Implementation: Atomic JSON file storage with in-memory caching.
 *   - Versioned envelope: { version: 1, lastId: N, transactions: [...] }
 *   - Atomic write pattern: write to .tmp -> fsync -> rename over destination.
 *   - In-memory Map cache provides O(1) synchronous lookups on the critical path.
 *   - Recovers state and reloads transactions after backend restarts.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_DATA_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "scheduled_transactions.json"
);

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Create a persistent scheduled transaction store backed by a versioned JSON file.
 *
 * @param {object} [options]
 * @param {string} [options.dataFile] Custom path to the store file
 */
function createScheduledTransactionStore(options = {}) {
  const dataFile =
    options.dataFile ||
    process.env.SCHEDULED_TX_DATA_FILE ||
    DEFAULT_DATA_FILE;

  const store = {
    dataFile,
    cache: new Map(),
    lastId: 0,
    version: 1,
  };

  function ensureDir() {
    const dir = path.dirname(store.dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  function loadFromDisk() {
    store.cache = new Map();
    store.lastId = 0;

    let raw;
    try {
      raw = fs.readFileSync(store.dataFile, "utf8");
    } catch (err) {
      if (err && err.code === "ENOENT") {
        return; // Fresh install — no data file yet
      }
      throw err;
    }

    const document = safeParseJson(raw);
    if (!document || typeof document !== "object") {
      return;
    }

    store.version = document.version || 1;
    store.lastId = Number(document.lastId || 0);

    const list = Array.isArray(document.transactions)
      ? document.transactions
      : Object.values(document.transactions || {});

    for (const tx of list) {
      if (tx && tx.id != null) {
        store.cache.set(Number(tx.id), {
          ...tx,
          id: Number(tx.id),
          submitAt: Number(tx.submitAt),
          createdAt: Number(tx.createdAt),
          attempts: Number(tx.attempts || 0),
        });
        if (Number(tx.id) > store.lastId) {
          store.lastId = Number(tx.id);
        }
      }
    }
  }

  function saveToDisk() {
    ensureDir();

    const document = {
      version: store.version,
      lastId: store.lastId,
      updatedAt: new Date().toISOString(),
      transactions: Array.from(store.cache.values()),
    };

    const payload = JSON.stringify(document, null, 2);
    const tmpFile = `${store.dataFile}.tmp.${process.pid}.${Date.now()}`;

    const fd = fs.openSync(tmpFile, "w");
    try {
      fs.writeFileSync(fd, payload, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tmpFile, store.dataFile);
  }

  function get(id) {
    return store.cache.get(Number(id)) || null;
  }

  function getAll() {
    return Array.from(store.cache.values());
  }

  function set(id, tx) {
    const numId = Number(id);
    store.cache.set(numId, { ...tx, id: numId });
    if (numId > store.lastId) {
      store.lastId = numId;
    }
    saveToDisk();
    return store.cache.get(numId);
  }

  function deleteTx(id) {
    const numId = Number(id);
    const existed = store.cache.delete(numId);
    if (existed) {
      saveToDisk();
    }
    return existed;
  }

  function nextId() {
    store.lastId += 1;
    return store.lastId;
  }

  function clear() {
    store.cache.clear();
    store.lastId = 0;
    try {
      if (fs.existsSync(store.dataFile)) {
        fs.unlinkSync(store.dataFile);
      }
    } catch {
      // ignore
    }
  }

  // Load any existing state from disk on initialization
  loadFromDisk();

  return {
    dataFile: store.dataFile,
    loadFromDisk,
    saveToDisk,
    get,
    getAll,
    set,
    delete: deleteTx,
    nextId,
    clear,
    getVersion: () => store.version,
    getLastId: () => store.lastId,
    count: () => store.cache.size,
  };
}

module.exports = {
  createScheduledTransactionStore,
  DEFAULT_DATA_FILE,
};

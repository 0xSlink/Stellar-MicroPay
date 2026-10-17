"use strict";

/**
 * src/storage/leaderboardOptOutStore.js
 *
 * Durable record of accounts that asked not to appear on the public tip
 * leaderboards (Issue #1511).
 *
 * Same approach as `usernameStore.js`: a JSON file is the source of truth and
 * an in-memory Set mirrors it for O(1) lookups on the leaderboard read path.
 * Unlike the username store, writes are synchronous (tmp file, fsync, rename)
 * and happen before the API responds, so an opt-out is on disk by the time
 * the user sees it confirmed. A crash mid-write cannot truncate the file.
 *
 * File shape: { "version": 1, "optedOut": { "<G...>": "<ISO timestamp>" } }
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_DATA_FILE = path.join(__dirname, "..", "..", "data", "leaderboard-opt-out.json");

function isValidPublicKey(publicKey) {
  return typeof publicKey === "string" && /^G[A-Z0-9]{55}$/.test(publicKey);
}

/**
 * @param {object} [options]
 * @param {string} [options.dataFile] Path to the JSON file.
 */
function createLeaderboardOptOutStore(options = {}) {
  const dataFile =
    options.dataFile || process.env.LEADERBOARD_OPTOUT_DATA_FILE || DEFAULT_DATA_FILE;
  /** @type {Map<string, string>} publicKey -> opted-out-at ISO timestamp */
  let cache = new Map();

  function load() {
    cache = new Map();
    let raw;
    try {
      raw = fs.readFileSync(dataFile, "utf8");
    } catch (err) {
      if (err && err.code === "ENOENT") return;
      throw err;
    }
    let document;
    try {
      document = JSON.parse(raw);
    } catch {
      // Refuse to wipe a file we cannot read. Failing closed would hide
      // everyone; failing open with an error logged and the file untouched
      // keeps the data recoverable.
      console.error(
        `[leaderboardOptOutStore] Could not parse ${dataFile}; leaving it untouched.`
      );
      return;
    }
    const entries = document && typeof document.optedOut === "object" ? document.optedOut : {};
    for (const [publicKey, at] of Object.entries(entries || {})) {
      if (isValidPublicKey(publicKey)) cache.set(publicKey, typeof at === "string" ? at : null);
    }
  }

  function persist() {
    const payload = JSON.stringify(
      { version: 1, optedOut: Object.fromEntries(cache.entries()) },
      null,
      2
    );
    const tmpFile = `${dataFile}.tmp`;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const fd = fs.openSync(tmpFile, "w");
    try {
      fs.writeFileSync(fd, payload, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpFile, dataFile);
  }

  load();

  return {
    dataFile,
    isOptedOut(publicKey) {
      return cache.has(publicKey);
    },
    /** When the account opted out, or null. */
    optedOutAt(publicKey) {
      return cache.get(publicKey) ?? null;
    },
    /**
     * Sets the opt-out flag and writes it to disk before returning. Rolls the
     * in-memory change back if the write fails, so memory never claims an
     * opt-out that would be lost on restart.
     */
    setOptOut(publicKey, optOut) {
      if (!isValidPublicKey(publicKey)) {
        const error = new Error("Invalid public key");
        error.status = 400;
        throw error;
      }
      const had = cache.has(publicKey);
      const previous = cache.get(publicKey);
      if (optOut) {
        if (!had) cache.set(publicKey, new Date().toISOString());
      } else {
        cache.delete(publicKey);
      }
      if (had === Boolean(optOut)) return;
      try {
        persist();
      } catch (err) {
        if (had) cache.set(publicKey, previous);
        else cache.delete(publicKey);
        throw err;
      }
    },
    size() {
      return cache.size;
    },
    /** Re-reads the file (tests use this to prove durability). */
    reload: load,
    _clearForTesting() {
      cache = new Map();
    },
  };
}

let defaultStore = null;

/** Lazily created process-wide store. */
function getLeaderboardOptOutStore() {
  if (!defaultStore) defaultStore = createLeaderboardOptOutStore();
  return defaultStore;
}

/** Replace the process-wide store (tests). */
function setLeaderboardOptOutStore(store) {
  defaultStore = store;
}

module.exports = {
  createLeaderboardOptOutStore,
  getLeaderboardOptOutStore,
  setLeaderboardOptOutStore,
};

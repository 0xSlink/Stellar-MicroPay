/**
 * __tests__/leaderboardOptOut.test.js
 * Leaderboard privacy opt-out (#1511): opted-out accounts are excluded from
 * the API responses themselves, the flag is per-account and authenticated,
 * and it survives a restart.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const {
  createLeaderboardOptOutStore,
  setLeaderboardOptOutStore,
} = require("../src/storage/leaderboardOptOutStore");
const tipsService = require("../src/services/tipsService");
const { JWT_SECRET, SIGN_OPTIONS } = require("../src/middleware/auth");
const app = require("../src/server");

const ALICE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const BOB = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CAROL = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

const tokenFor = (publicKey) => jwt.sign({ publicKey }, JWT_SECRET, SIGN_OPTIONS);

let dir;
let dataFile;
let store;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "optout-"));
  dataFile = path.join(dir, "leaderboard-opt-out.json");
  store = createLeaderboardOptOutStore({ dataFile });
  setLeaderboardOptOutStore(store);
  tipsService._clearForTesting();

  // Alice tips Bob and Carol; Carol tips Bob.
  tipsService.recordTip({ senderPublicKey: ALICE, creatorPublicKey: BOB, amount: "10" });
  tipsService.recordTip({ senderPublicKey: ALICE, creatorPublicKey: CAROL, amount: "5" });
  tipsService.recordTip({ senderPublicKey: CAROL, creatorPublicKey: BOB, amount: "2" });
});

afterEach(() => {
  setLeaderboardOptOutStore(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const keys = (entries, field = "publicKey") => entries.map((e) => e[field]);

describe("leaderboard opt-out store", () => {
  it("persists opt-outs to disk before returning and reloads them", () => {
    store.setOptOut(ALICE, true);
    expect(fs.existsSync(dataFile)).toBe(true);

    const reopened = createLeaderboardOptOutStore({ dataFile });
    expect(reopened.isOptedOut(ALICE)).toBe(true);
    expect(reopened.optedOutAt(ALICE)).toEqual(expect.any(String));

    reopened.setOptOut(ALICE, false);
    expect(createLeaderboardOptOutStore({ dataFile }).isOptedOut(ALICE)).toBe(false);
  });

  it("rejects invalid public keys", () => {
    expect(() => store.setOptOut("not-a-key", true)).toThrow("Invalid public key");
  });

  it("rolls back the in-memory flag when the write fails", () => {
    const spy = jest.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(() => store.setOptOut(ALICE, true)).toThrow("disk full");
    expect(store.isOptedOut(ALICE)).toBe(false);
    spy.mockRestore();
  });
});

describe("tipsService exclusion", () => {
  it("removes opted-out accounts from global rankings but keeps totals", () => {
    store.setOptOut(BOB, true);
    store.setOptOut(ALICE, true);

    const board = tipsService.getLeaderboard();
    expect(keys(board.recipients)).toEqual([CAROL]);
    expect(keys(board.senders)).toEqual([CAROL]);
    expect(board.totalTips).toBe(3);
    expect(board.totalXLM).toBe("17.0000000");

    const global = tipsService.getGlobalLeaderboard();
    expect(keys(global.topRecipients, "address")).toEqual([CAROL]);
    expect(keys(global.topSenders, "address")).toEqual([CAROL]);
  });

  it("removes opted-out tippers from a creator's top tippers", () => {
    store.setOptOut(ALICE, true);
    expect(tipsService.getTopTippers(BOB).map((t) => t.senderPublicKey)).toEqual([CAROL]);
  });
});

describe("opt-out API", () => {
  it("requires a JWT", async () => {
    await request(app).get("/api/tips/leaderboard/opt-out").expect(401);
    await request(app).put("/api/tips/leaderboard/opt-out").send({ optOut: true }).expect(401);
  });

  it("validates the body", async () => {
    const res = await request(app)
      .put("/api/tips/leaderboard/opt-out")
      .set("Authorization", `Bearer ${tokenFor(ALICE)}`)
      .send({ optOut: "yes" });
    expect(res.status).toBe(400);
  });

  it("excludes the account from the public leaderboard response and can be undone", async () => {
    const auth = { Authorization: `Bearer ${tokenFor(BOB)}` };

    let res = await request(app).get("/api/tips/leaderboard/opt-out").set(auth).expect(200);
    expect(res.body.data).toMatchObject({ publicKey: BOB, optedOut: false });

    res = await request(app).put("/api/tips/leaderboard/opt-out").set(auth).send({ optOut: true }).expect(200);
    expect(res.body.data).toMatchObject({ publicKey: BOB, optedOut: true });

    res = await request(app).get("/api/tips/leaderboard").expect(200);
    expect(keys(res.body.data.recipients)).not.toContain(BOB);
    expect(keys(res.body.data.topRecipients)).not.toContain(BOB);
    expect(keys(res.body.data.recipients)).toContain(CAROL);

    await request(app).put("/api/tips/leaderboard/opt-out").set(auth).send({ optOut: false }).expect(200);
    res = await request(app).get("/api/tips/leaderboard").expect(200);
    expect(keys(res.body.data.recipients)).toContain(BOB);
  });

  it("only ever changes the caller's own account", async () => {
    await request(app)
      .put("/api/tips/leaderboard/opt-out")
      .set("Authorization", `Bearer ${tokenFor(ALICE)}`)
      .send({ optOut: true, publicKey: BOB })
      .expect(200);
    expect(store.isOptedOut(ALICE)).toBe(true);
    expect(store.isOptedOut(BOB)).toBe(false);
  });
});

/**
 * __tests__/federation.test.js
 * Integration tests for federation endpoints per SEP-0002 (#1229).
 */

"use strict";

const request = require("supertest");
const usernameService = require("../src/services/usernameService");

// Mock usernameService to avoid disk/DB dependency per #1229 acceptance criteria
jest.mock("../src/services/usernameService");

const app = require("../src/server");

describe("Federation API Integration Tests (#1229)", () => {
  const testUsername = "alice";
  const testPublicKey = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

  beforeEach(() => {
    jest.clearAllMocks();

    usernameService.resolveUsername.mockImplementation((username) => {
      if (username === testUsername || username === "testuser") {
        return { username, publicKey: testPublicKey };
      }
      const err = new Error("Username not found");
      err.status = 404;
      throw err;
    });

    usernameService.getAllUsernames.mockImplementation(() => [
      { username: testUsername, publicKey: testPublicKey },
    ]);
  });

  describe("GET /.well-known/stellar.toml", () => {
    it("should return valid TOML with FEDERATION_SERVER", async () => {
      const response = await request(app)
        .get("/.well-known/stellar.toml")
        .expect(200)
        .expect("Content-Type", /application\/toml/);

      expect(response.text).toContain("[FEDERATION_SERVER]");
      expect(response.text).toContain("ACTIVE = true");
      expect(response.text).toContain("SERVER =");
    });
  });

  describe("GET /federation (SEP-0002 lookup)", () => {
    describe("type=name lookups", () => {
      it("should resolve a known username to a Stellar address", async () => {
        const stellarAddress = `${testUsername}*stellarmicropay.com`;

        const response = await request(app)
          .get("/federation")
          .query({ q: stellarAddress, type: "name" })
          .expect(200);

        expect(response.body).toHaveProperty("stellar_address", stellarAddress);
        expect(response.body).toHaveProperty("account_id", testPublicKey);
        expect(usernameService.resolveUsername).toHaveBeenCalledWith("alice");
      });

      it("should return 404 for an unknown username", async () => {
        const unknownAddress = "nonexistent*stellarmicropay.com";

        const response = await request(app)
          .get("/federation")
          .query({ q: unknownAddress, type: "name" })
          .expect(404);

        expect(response.body).toHaveProperty("error", "Username not found");
        expect(usernameService.resolveUsername).toHaveBeenCalledWith("nonexistent");
      });

      it("should return 400 when q parameter is missing", async () => {
        const response = await request(app)
          .get("/federation")
          .query({ type: "name" })
          .expect(400);

        expect(response.body).toHaveProperty("error", "Missing required parameters: q and type");
      });

      it("should return 400 for malformed federation address", async () => {
        const invalidAddress = "invalidaddresswithoutdomain";

        const response = await request(app)
          .get("/federation")
          .query({ q: invalidAddress, type: "name" })
          .expect(400);

        expect(response.body).toHaveProperty("error", "Invalid stellar address format");
      });
    });

    describe("type=id lookups", () => {
      it("should resolve a local account ID", async () => {
        const response = await request(app)
          .get("/federation")
          .query({ q: testPublicKey, type: "id" })
          .expect(200);

        expect(response.body).toHaveProperty("stellar_address", `${testUsername}*stellarmicropay.com`);
      });

      it("should return 404 for non-existent account ID", async () => {
        const unknownPublicKey = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

        const response = await request(app)
          .get("/federation")
          .query({ q: unknownPublicKey, type: "id" })
          .expect(404);

        expect(response.body).toHaveProperty("error", "Account ID not found");
      });
    });

    it("should return 400 for missing type parameter", async () => {
      const response = await request(app)
        .get("/federation")
        .query({ q: "alice*stellarmicropay.com" })
        .expect(400);

      expect(response.body).toHaveProperty("error", "Missing required parameters: q and type");
    });

    it("should return 400 for invalid type", async () => {
      const response = await request(app)
        .get("/federation")
        .query({ q: "alice*stellarmicropay.com", type: "invalid" })
        .expect(400);

      expect(response.body).toHaveProperty("error", "Invalid type parameter. Must be 'name' or 'id'");
    });
  });
});
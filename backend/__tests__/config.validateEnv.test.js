/**
 * __tests__/config.validateEnv.test.js
 * Unit tests for src/config/validateEnv.js (production secrets validation)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { validateEnv, collectErrors, loadSecrets, getSecret, readSecretFile } = require("../src/config/validateEnv");

describe("src/config/validateEnv", () => {
  let consoleErrorSpy;
  let tempDir;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-env-test-"));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    // Clean up temporary files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("readSecretFile", () => {
    it("reads a secret file and trims whitespace", () => {
      const secretFile = path.join(tempDir, "secret.txt");
      fs.writeFileSync(secretFile, "  mysecret  \n");

      const value = readSecretFile(secretFile);
      expect(value).toBe("mysecret");
    });

    it("returns null for non-existent files", () => {
      const value = readSecretFile("/nonexistent/path/secret.txt");
      expect(value).toBeNull();
    });

    it("returns null for empty files", () => {
      const secretFile = path.join(tempDir, "empty.txt");
      fs.writeFileSync(secretFile, "");

      const value = readSecretFile(secretFile);
      expect(value).toBeNull();
    });

    it("returns null for whitespace-only files", () => {
      const secretFile = path.join(tempDir, "whitespace.txt");
      fs.writeFileSync(secretFile, "   \n  \n");

      const value = readSecretFile(secretFile);
      expect(value).toBeNull();
    });
  });

  describe("getSecret", () => {
    it("returns plain variable when set", () => {
      const env = {
        JWT_SECRET: "plain-secret",
        JWT_SECRET_FILE: "/unused",
      };

      const value = getSecret("JWT_SECRET", env);
      expect(value).toBe("plain-secret");
    });

    it("returns file-based secret when plain is not set", () => {
      const secretFile = path.join(tempDir, "jwt.txt");
      fs.writeFileSync(secretFile, "file-secret");

      const env = {
        JWT_SECRET_FILE: secretFile,
      };

      const value = getSecret("JWT_SECRET", env);
      expect(value).toBe("file-secret");
    });

    it("prefers plain variable over file-based", () => {
      const secretFile = path.join(tempDir, "jwt.txt");
      fs.writeFileSync(secretFile, "file-secret");

      const env = {
        JWT_SECRET: "plain-secret",
        JWT_SECRET_FILE: secretFile,
      };

      const value = getSecret("JWT_SECRET", env);
      expect(value).toBe("plain-secret");
    });

    it("returns null when neither form is set", () => {
      const env = {};

      const value = getSecret("JWT_SECRET", env);
      expect(value).toBeNull();
    });

    it("ignores empty plain variable and checks file", () => {
      const secretFile = path.join(tempDir, "jwt.txt");
      fs.writeFileSync(secretFile, "file-secret");

      const env = {
        JWT_SECRET: "",
        JWT_SECRET_FILE: secretFile,
      };

      const value = getSecret("JWT_SECRET", env);
      expect(value).toBe("file-secret");
    });
  });

  describe("loadSecrets", () => {
    it("loads JWT_SECRET from JWT_SECRET_FILE", () => {
      const secretFile = path.join(tempDir, "jwt.txt");
      fs.writeFileSync(secretFile, "jwt-from-file");

      const env = {
        JWT_SECRET_FILE: secretFile,
      };

      loadSecrets(env);

      expect(env.JWT_SECRET).toBe("jwt-from-file");
    });

    it("loads SERVER_PRIVATE_KEY from SERVER_PRIVATE_KEY_FILE", () => {
      const secretFile = path.join(tempDir, "key.txt");
      fs.writeFileSync(secretFile, "SBEXAMPLEKEY123456789");

      const env = {
        SERVER_PRIVATE_KEY_FILE: secretFile,
      };

      loadSecrets(env);

      expect(env.SERVER_PRIVATE_KEY).toBe("SBEXAMPLEKEY123456789");
    });

    it("loads PAYMENT_SIGNING_SECRET from PAYMENT_SIGNING_SECRET_FILE", () => {
      const secretFile = path.join(tempDir, "payment.txt");
      fs.writeFileSync(secretFile, "payment-secret");

      const env = {
        PAYMENT_SIGNING_SECRET_FILE: secretFile,
      };

      loadSecrets(env);

      expect(env.PAYMENT_SIGNING_SECRET).toBe("payment-secret");
    });

    it("does not overwrite existing plain variables", () => {
      const secretFile = path.join(tempDir, "jwt.txt");
      fs.writeFileSync(secretFile, "jwt-from-file");

      const env = {
        JWT_SECRET: "plain-jwt",
        JWT_SECRET_FILE: secretFile,
      };

      loadSecrets(env);

      expect(env.JWT_SECRET).toBe("plain-jwt");
    });

    it("loads multiple secrets at once", () => {
      const jwtFile = path.join(tempDir, "jwt.txt");
      const keyFile = path.join(tempDir, "key.txt");
      const paymentFile = path.join(tempDir, "payment.txt");

      fs.writeFileSync(jwtFile, "jwt-secret");
      fs.writeFileSync(keyFile, "SBKEY123");
      fs.writeFileSync(paymentFile, "payment-secret");

      const env = {
        JWT_SECRET_FILE: jwtFile,
        SERVER_PRIVATE_KEY_FILE: keyFile,
        PAYMENT_SIGNING_SECRET_FILE: paymentFile,
      };

      loadSecrets(env);

      expect(env.JWT_SECRET).toBe("jwt-secret");
      expect(env.SERVER_PRIVATE_KEY).toBe("SBKEY123");
      expect(env.PAYMENT_SIGNING_SECRET).toBe("payment-secret");
    });
  });

  describe("collectErrors", () => {
    it("returns empty array in non-production", () => {
      const env = { NODE_ENV: "development" };
      const errors = collectErrors(env);
      expect(errors).toEqual([]);
    });

    it("reports missing JWT_SECRET in production", () => {
      const env = {
        NODE_ENV: "production",
        SERVER_PRIVATE_KEY: "SBKEY123",
        PAYMENT_SIGNING_SECRET: "payment-secret",
      };

      const errors = collectErrors(env);
      expect(errors).toContainEqual(expect.stringContaining("JWT_SECRET"));
    });

    it("reports missing SERVER_PRIVATE_KEY in production", () => {
      const env = {
        NODE_ENV: "production",
        JWT_SECRET: "jwt-secret",
        PAYMENT_SIGNING_SECRET: "payment-secret",
      };

      const errors = collectErrors(env);
      expect(errors).toContainEqual(expect.stringContaining("SERVER_PRIVATE_KEY"));
    });

    it("reports missing PAYMENT_SIGNING_SECRET in production", () => {
      const env = {
        NODE_ENV: "production",
        JWT_SECRET: "jwt-secret",
        SERVER_PRIVATE_KEY: "SBKEY123",
      };

      const errors = collectErrors(env);
      expect(errors).toContainEqual(expect.stringContaining("PAYMENT_SIGNING_SECRET"));
    });

    it("accepts all three secrets from plain variables", () => {
      const env = {
        NODE_ENV: "production",
        JWT_SECRET: "jwt-secret",
        SERVER_PRIVATE_KEY: "SBKEY123",
        PAYMENT_SIGNING_SECRET: "payment-secret",
      };

      const errors = collectErrors(env);
      expect(errors).toEqual([]);
    });

    it("accepts all three secrets from *_FILE variables", () => {
      const jwtFile = path.join(tempDir, "jwt.txt");
      const keyFile = path.join(tempDir, "key.txt");
      const paymentFile = path.join(tempDir, "payment.txt");

      fs.writeFileSync(jwtFile, "jwt-secret");
      fs.writeFileSync(keyFile, "SBKEY123");
      fs.writeFileSync(paymentFile, "payment-secret");

      const env = {
        NODE_ENV: "production",
        JWT_SECRET_FILE: jwtFile,
        SERVER_PRIVATE_KEY_FILE: keyFile,
        PAYMENT_SIGNING_SECRET_FILE: paymentFile,
      };

      const errors = collectErrors(env);
      expect(errors).toEqual([]);
    });

    it("prefers plain variables over file-based", () => {
      const secretFile = path.join(tempDir, "secret.txt");
      fs.writeFileSync(secretFile, "file-secret");

      const env = {
        NODE_ENV: "production",
        JWT_SECRET: "plain-jwt",
        SERVER_PRIVATE_KEY: "SBKEY123",
        PAYMENT_SIGNING_SECRET: "payment-secret",
        JWT_SECRET_FILE: secretFile, // This should be ignored
      };

      const errors = collectErrors(env);
      expect(errors).toEqual([]);
    });

    it("reports all missing secrets at once", () => {
      const env = { NODE_ENV: "production" };

      const errors = collectErrors(env);
      expect(errors).toHaveLength(3);
      expect(errors).toContainEqual(expect.stringContaining("JWT_SECRET"));
      expect(errors).toContainEqual(expect.stringContaining("SERVER_PRIVATE_KEY"));
      expect(errors).toContainEqual(expect.stringContaining("PAYMENT_SIGNING_SECRET"));
    });
  });

  describe("validateEnv", () => {
    let exitSpy;

    beforeEach(() => {
      exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    it("does not exit in non-production", () => {
      const env = { NODE_ENV: "development" };
      validateEnv(env);
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("calls loadSecrets before validation", () => {
      const secretFile = path.join(tempDir, "jwt.txt");
      fs.writeFileSync(secretFile, "jwt-secret");

      const env = {
        NODE_ENV: "production",
        JWT_SECRET_FILE: secretFile,
        SERVER_PRIVATE_KEY: "SBKEY123",
        PAYMENT_SIGNING_SECRET: "payment-secret",
      };

      validateEnv(env);

      // If loadSecrets wasn't called, this would exit with error
      expect(exitSpy).not.toHaveBeenCalled();
      expect(env.JWT_SECRET).toBe("jwt-secret");
    });

    it("exits with code 1 when secrets are missing", () => {
      const env = { NODE_ENV: "production" };
      validateEnv(env);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("logs errors when secrets are missing", () => {
      const env = { NODE_ENV: "production" };
      validateEnv(env);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorOutput = consoleErrorSpy.mock.calls.join("\n");
      expect(errorOutput).toContain("JWT_SECRET");
    });
  });
});

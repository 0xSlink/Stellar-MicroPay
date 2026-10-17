/**
 * src/config/validateEnv.js
 * Startup guard for environment variables that must not be left unset.
 *
 * Deliberately narrow: it only covers variables whose absence would silently
 * weaken security. General configuration (origins, network, URLs) is left to
 * the deploy tooling — failing startup over a cosmetic misconfiguration is a
 * good way to get a guard ignored entirely.
 *
 * Supports *_FILE variables (e.g. JWT_SECRET_FILE) for Docker secret mounting.
 * When both JWT_SECRET and JWT_SECRET_FILE are set, JWT_SECRET takes precedence.
 */

"use strict";

const fs = require("fs");

/**
 * Read a secret from a file path.
 * Trims whitespace and validates the file exists.
 *
 * @param {string} filePath - Path to the secret file
 * @returns {string|null} The secret value, or null if read fails
 * @private
 */
function readSecretFile(filePath) {
  try {
    const value = fs.readFileSync(filePath, "utf-8").trim();
    if (!value) return null;
    return value;
  } catch (err) {
    return null;
  }
}

/**
 * Get a secret value from env, preferring the plain var over the *_FILE var.
 * Plain variable takes precedence for backwards compatibility.
 *
 * @param {string} varName - Base variable name (e.g. 'JWT_SECRET')
 * @param {NodeJS.ProcessEnv} env - Environment object
 * @returns {string|null} The secret value, or null if neither form is set
 */
function getSecret(varName, env = process.env) {
  // Plain variable takes precedence
  const plainValue = env[varName]?.trim();
  if (plainValue) return plainValue;

  // Fall back to *_FILE
  const fileVar = `${varName}_FILE`;
  const filePath = env[fileVar];
  if (filePath) {
    const value = readSecretFile(filePath);
    if (value) return value;
  }

  return null;
}

/**
 * Collect configuration errors that should prevent startup.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string[]} human-readable, actionable messages; empty when valid
 */
function collectErrors(env = process.env) {
  const errors = [];

  // PAYMENT_SIGNING_SECRET keys the X-Timestamp / X-Signature check on
  // POST /api/payments/submit. The fallback in utils/requestSignature.js is a
  // published constant, so without this anyone could forge a signature that
  // verifies — and replay protection would be decorative. Refusing to start is
  // the only failure mode that actually prevents that.
  if (env.NODE_ENV === "production") {
    const paymentSecret = getSecret("PAYMENT_SIGNING_SECRET", env);
    if (!paymentSecret) {
      errors.push(
        "PAYMENT_SIGNING_SECRET is required in production — set PAYMENT_SIGNING_SECRET or " +
          "PAYMENT_SIGNING_SECRET_FILE. Without it, request signatures are verified against " +
          "a publicly-known fallback key. Generate with: openssl rand -hex 32",
      );
    }

    // JWT_SECRET is required to sign authentication tokens
    const jwtSecret = getSecret("JWT_SECRET", env);
    if (!jwtSecret) {
      errors.push(
        "JWT_SECRET is required in production — set JWT_SECRET or JWT_SECRET_FILE. " +
          "Used to sign authentication tokens. Generate with: openssl rand -base64 32",
      );
    }

    // SERVER_PRIVATE_KEY is the Stellar account private key for signing transactions
    const serverPrivateKey = getSecret("SERVER_PRIVATE_KEY", env);
    if (!serverPrivateKey) {
      errors.push(
        "SERVER_PRIVATE_KEY is required in production — set SERVER_PRIVATE_KEY or " +
          "SERVER_PRIVATE_KEY_FILE. The Stellar account private key used to sign payment " +
          "transactions. Must be a valid Stellar secret key (starts with S)",
      );
    }
  }

  return errors;
}

/**
 * Load secrets from env or *_FILE variables into process.env.
 * Must be called before any code tries to use the secrets.
 * Plain variables take precedence over *_FILE variables.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {void}
 */
function loadSecrets(env = process.env) {
  const secretVars = [
    "JWT_SECRET",
    "SERVER_PRIVATE_KEY",
    "PAYMENT_SIGNING_SECRET",
  ];

  for (const varName of secretVars) {
    const value = getSecret(varName, env);
    if (value && !env[varName]) {
      // Only set if not already present (plain var takes precedence)
      env[varName] = value;
    }
  }
}

/**
 * Log actionable errors and exit when validation fails.
 *
 * A no-op outside production so tests and local development are unaffected.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {void}
 */
function validateEnv(env = process.env) {
  // Load secrets from *_FILE variables first
  loadSecrets(env);

  const errors = collectErrors(env);
  if (errors.length === 0) return;

  console.error("\nEnvironment validation failed:\n");
  for (const message of errors) {
    console.error(`  - ${message}`);
  }
  console.error("");
  process.exit(1);
}

module.exports = {
  collectErrors,
  validateEnv,
  loadSecrets,
  getSecret,
  readSecretFile,
};

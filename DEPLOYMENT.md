# Production Deployment Guide

## Secrets Setup

The production compose file requires three secrets. Secrets can be provided in two ways:

1. **Plain environment variables** (simpler, secrets visible in docker inspect)
2. **Docker Secrets with \*\_FILE variables** (recommended, secrets hidden from environment)

For detailed information about all secret configuration options, see [ENV.md](ENV.md).

### Quick Start with Docker Secrets (Recommended)

Create secret files:

```bash
mkdir -p secrets
echo -n "$(openssl rand -base64 32)" > secrets/jwt_secret.txt
echo -n "SBXXXXXX..." > secrets/server_private_key.txt  # Your Stellar private key
echo -n "$(openssl rand -hex 32)" > secrets/payment_signing_secret.txt
```

Start compose:

```bash
docker compose -f docker-compose.prod.yml up -d
```

The backend automatically reads from `/run/secrets/` paths mounted by Docker.

### Alternative: Plain Environment Variables

If you prefer plain environment variables (not recommended for production):

```bash
export JWT_SECRET="$(openssl rand -base64 32)"
export SERVER_PRIVATE_KEY="SBXXXXXX..."
export PAYMENT_SIGNING_SECRET="$(openssl rand -hex 32)"

docker compose -f docker-compose.prod.yml up -d
```

Then update `docker-compose.prod.yml` to use plain variables instead of `*_FILE`.

## Detailed Setup

### 1. JWT_SECRET

Asymmetric key for signing authentication tokens.

**Generate:**

```bash
openssl rand -base64 32
```

### 2. SERVER_PRIVATE_KEY

Stellar account private key used to sign payment transactions.

**Requirements:**

- Must be a valid Stellar secret key (starts with `S`)
- Controls which Stellar account the backend uses for payments
- Never share or commit this key

### 3. PAYMENT_SIGNING_SECRET

Shared secret for verifying payment submission requests with X-Signature headers.

**Generate:**

```bash
openssl rand -hex 32
```

## Verification

Check that the backend is running:

```bash
curl http://localhost:4000/health
```

## Security Notes

- The recommended approach uses Docker Secrets so values never appear in `docker inspect` or process environment
- Secrets are only read at startup; restart the container to change them
- Never log or echo secret values
- Rotate secrets periodically
- Use a secrets manager (Vault, AWS Secrets Manager, etc.) in production clusters

For complete environment variable documentation, see [ENV.md](ENV.md).

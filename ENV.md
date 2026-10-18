# Environment Variables Reference

## Secrets Convention: \*\_FILE Variables

The backend supports both plain environment variables and Docker-style \*\_FILE variables for sensitive configuration. This allows secrets to be mounted as files (e.g. from Docker Secrets or Kubernetes mounted volumes) without appearing in the environment or process inspection.

### How It Works

For each secret variable, the backend checks:

1. **Plain variable first** (e.g. `JWT_SECRET`) — if set, this value is used
2. **File-based variable second** (e.g. `JWT_SECRET_FILE`) — if plain is not set, the backend reads the file path

**Precedence:** Plain variables take precedence over \*\_FILE variables for backwards compatibility.

### Production Secrets

Three secrets are required for production startup:

#### JWT_SECRET / JWT_SECRET_FILE

- **Purpose:** Sign authentication tokens
- **Generation:** `openssl rand -base64 32`
- **Plain variable:** `export JWT_SECRET="..."`
- **File variable:** `export JWT_SECRET_FILE="/run/secrets/jwt_secret"`

#### SERVER_PRIVATE_KEY / SERVER_PRIVATE_KEY_FILE

- **Purpose:** Stellar account private key for signing transactions
- **Requirements:** Must be a valid Stellar secret key (starts with `S`)
- **Plain variable:** `export SERVER_PRIVATE_KEY="SBXXXXXX..."`
- **File variable:** `export SERVER_PRIVATE_KEY_FILE="/run/secrets/server_private_key"`

#### PAYMENT_SIGNING_SECRET / PAYMENT_SIGNING_SECRET_FILE

- **Purpose:** Shared secret for verifying payment submission requests
- **Generation:** `openssl rand -hex 32`
- **Plain variable:** `export PAYMENT_SIGNING_SECRET="..."`
- **File variable:** `export PAYMENT_SIGNING_SECRET_FILE="/run/secrets/payment_signing_secret"`

### Docker Compose Example

Using Docker Secrets with \*\_FILE variables:

```yaml
services:
  backend:
    environment:
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
      - SERVER_PRIVATE_KEY_FILE=/run/secrets/server_private_key
      - PAYMENT_SIGNING_SECRET_FILE=/run/secrets/payment_signing_secret
    secrets:
      - jwt_secret
      - server_private_key
      - payment_signing_secret

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  server_private_key:
    file: ./secrets/server_private_key.txt
  payment_signing_secret:
    file: ./secrets/payment_signing_secret.txt
```

### Kubernetes Example

Using mounted secrets:

```yaml
env:
  - name: JWT_SECRET_FILE
    value: /var/run/secrets/jwt_secret
  - name: SERVER_PRIVATE_KEY_FILE
    value: /var/run/secrets/server_private_key
  - name: PAYMENT_SIGNING_SECRET_FILE
    value: /var/run/secrets/payment_signing_secret
volumeMounts:
  - name: jwt-secret
    mountPath: /var/run/secrets/jwt_secret
    subPath: jwt_secret
  - name: key-secret
    mountPath: /var/run/secrets/server_private_key
    subPath: server_private_key
  - name: payment-secret
    mountPath: /var/run/secrets/payment_signing_secret
    subPath: payment_signing_secret
```

### File Format

Secret files should contain:

- The secret value as plain text
- Optional trailing whitespace (automatically trimmed)
- No additional formatting or encoding

Example:

```bash
# Create jwt_secret.txt
echo -n "$(openssl rand -base64 32)" > secrets/jwt_secret.txt
```

### Error Messages

If secrets are missing at startup, you'll see clear errors:

```
Environment validation failed:

  - JWT_SECRET is required in production — set JWT_SECRET or JWT_SECRET_FILE. Used to sign authentication tokens. Generate with: openssl rand -base64 32
  - SERVER_PRIVATE_KEY is required in production — set SERVER_PRIVATE_KEY or SERVER_PRIVATE_KEY_FILE. The Stellar account private key used to sign payment transactions. Must be a valid Stellar secret key (starts with S)
  - PAYMENT_SIGNING_SECRET is required in production — set PAYMENT_SIGNING_SECRET or PAYMENT_SIGNING_SECRET_FILE. Generate with: openssl rand -hex 32
```

### Security Notes

- Never commit actual secret values to the repository
- Use `.gitignore` to exclude secret files
- Rotate secrets periodically
- In production clusters, use a secrets manager (HashiCorp Vault, AWS Secrets Manager, Kubernetes Secrets, etc.)
- The backend only reads secrets at startup; changing secret files requires a restart

## Web Push Notifications (PWA)

The backend can send Web Push notifications for incoming payments (see
`docs/pwa.md` → "Push Notifications" for the full architecture). The
following variables configure it:

### VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY

- **Purpose:** VAPID keypair identifying this push server to the browser's push service
- **Generation:** `npx web-push generate-vapid-keys` (returns a `publicKey` / `privateKey` pair)
- **Plain variables:** `export VAPID_PUBLIC_KEY="..."` / `export VAPID_PRIVATE_KEY="..."`
- **Notes:** The public key must match `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the
  frontend build (the browser refuses a `PushManager.subscribe()` call whose
  `applicationServerKey` doesn't match the sender). Without both keys the
  backend logs no error — sending becomes a no-op
  (`backend/src/services/pushService.js` → `isPushConfigured()`).

### VAPID_CONTACT

- **Purpose:** Contact URI sent to the push service in VAPID `mailto:`/`https:` claims
- **Default:** `mailto:admin@stellarmicropay.com`
- **Plain variable:** `export VAPID_CONTACT="mailto:you@example.com"`

### Frontend counterparts (frontend/.env.local)

- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`** — must equal `VAPID_PUBLIC_KEY`; used by
  `PushManager.subscribe()` on the Dashboard's "Enable payment notifications"
  toggle. When unset, the toggle still enables in-app notifications but never
  registers a server subscription.
- **`NEXT_PUBLIC_API_URL`** — base URL the browser uses to POST the
  subscription to `/api/push/subscribe` (defaults to the same origin).
- Both are documented with comments in `frontend/.env.example`.

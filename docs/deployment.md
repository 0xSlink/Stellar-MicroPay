# Production Deployment Guide

This document describes how to deploy the Stellar-MicroPay application in a production environment using Docker and Nginx.

## Compose matrix

The repo ships four Compose files. Pick one by what you are doing. All paths
are relative to the repo root.

| Compose file | Purpose | Services | Dockerfiles | Required env / secrets | Up command |
| --- | --- | --- | --- | --- | --- |
| `docker-compose.yml` | Local development with hot reload. Source is bind-mounted, so nodemon restarts the backend and Next.js HMR reloads the frontend. | `backend` (:4000), `frontend` (:3000), `redis` (:6379); `stellar` (:8000) only with `--profile localnet` | `backend/Dockerfile.dev`, `frontend/Dockerfile.dev`; `redis:7-alpine` and `stellar/quickstart:latest` images | None. A placeholder `JWT_SECRET` is set inline. Testnet Horizon is used unless you start `localnet`. | `docker compose up --build`. For a local Stellar network, also run `docker compose --profile localnet up stellar` or `make localnet-up`. |
| `docker-compose.test.yml` | Backend Jest suite against a mocked Horizon. CI runs this in the `integration-test` job. | `mock-horizon` (:8000), `backend-test` (one-shot, runs `npm test`) | `mock-horizon/Dockerfile`, `backend/Dockerfile.test` | None. `HORIZON_URL` points at `mock-horizon`. | `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from backend-test` |
| `docker-compose.staging.yml` | Staging on testnet, run from images that CI has already pushed. Nothing is built locally. | `nginx` (:80), `frontend` (static files only), `backend`, `redis` | None at runtime. It pulls `ghcr.io/chidubemkingsley/stellar-micropay-{frontend,backend}:staging`, which `deploy-staging.yml` builds from `frontend/Dockerfile.prod` and `backend/Dockerfile.prod`. | Files `secrets/jwt_secret.txt` and `secrets/server_private_key.txt` must exist. See the staging caveats below. | `docker compose -f docker-compose.staging.yml pull && docker compose -f docker-compose.staging.yml up -d` |
| `docker-compose.prod.yml` | Production on mainnet, built from source. nginx serves the static frontend and proxies `/api/` to the backend. | `nginx` (:80, :443), `frontend` (static files only), `backend`, `redis` | `frontend/Dockerfile.prod`, `backend/Dockerfile.prod`; `nginx:alpine` and `redis:7-alpine` images | Files `secrets/jwt_secret.txt`, `secrets/server_private_key.txt` and `secrets/payment_signing_secret.txt`. The backend reads them through `*_FILE` variables and refuses to start without them (`NODE_ENV=production`). See [DEPLOYMENT.md](../DEPLOYMENT.md) and [ENV.md](../ENV.md). | `docker compose -f docker-compose.prod.yml up --build -d`. **This does not currently start a working stack.** See the [known issues](#known-issues-verified-2026-10-17). |

Tear any stack down with the same `-f` flag plus `down -v` (for example
`docker compose -f docker-compose.test.yml down -v --remove-orphans`).

### Dockerfiles

| Dockerfile | Used by | Notes |
| --- | --- | --- |
| `backend/Dockerfile.dev` | `docker-compose.yml` | Installs deps with `npm ci`. Source is mounted at runtime and `npm run dev` runs under nodemon. |
| `backend/Dockerfile.test` | `docker-compose.test.yml` | Installs all deps, including dev deps, copies the source and runs `npm test`. |
| `backend/Dockerfile.prod` | `docker-compose.prod.yml`, `docker-publish.yml`, `deploy-staging.yml`, `make deploy` | Production deps only, with a curl `/health` check. |
| `backend/Dockerfile` | Nothing | Multi-stage `npm ci --omit=dev` image. No Compose file or workflow references it. |
| `frontend/Dockerfile.dev` | `docker-compose.yml` | `npm ci`, then `npm run dev`. Source is mounted at runtime. |
| `frontend/Dockerfile.prod` | `docker-compose.prod.yml`, `docker-publish.yml`, `deploy-staging.yml`, `make deploy` | Builds the static export (`out/`) and serves it from `nginx:alpine`. |
| `frontend/Dockerfile` | Nothing | Expects `.next/standalone`, but `next.config.mjs` sets `output: "export"`, so this image does not build as written. |
| `mock-horizon/Dockerfile` | `docker-compose.test.yml` | Small Express mock of the Horizon API. See [mock-horizon/README.md](../mock-horizon/README.md). |

### Creating the secret files (staging / prod)

`secrets/` is gitignored, so a fresh clone has none of these files.

```bash
echo -n "$(openssl rand -base64 32)" > secrets/jwt_secret.txt
echo -n "S..."                       > secrets/server_private_key.txt   # Stellar secret key
echo -n "$(openssl rand -hex 32)"    > secrets/payment_signing_secret.txt  # prod only
```

### Known issues (verified 2026-10-17)

These results come from a fresh clone of `main` at `b283281` with Docker
29.2.1 and Compose v5.0.2. All four files pass `docker compose -f <file>
config -q`. Compose only warns that the top-level `version:` key is obsolete.
Problems that stop the commands above from working:

**All variants**

1. **`npm ci` fails because the lockfiles are out of sync.**
   `backend/package-lock.json` is missing `bintrees@1.0.2`, which `prom-client`
   pulls in. `frontend/package-lock.json` is missing `@emnapi/runtime` and
   `@emnapi/core@1.11.3`. Because of this, `backend/Dockerfile.dev`,
   `backend/Dockerfile.test` and `frontend/Dockerfile.dev` fail at `RUN npm ci`.
   The `*.prod` Dockerfiles use `npm install`, so they are not affected.
   Workaround: run `npm install --package-lock-only` in `backend/` and
   `frontend/`.
2. **The backend crashes on boot.** `backend/src/server.js` declares
   `requestId` twice (an import on line 34 and a function on line 49), which
   is a `SyntaxError`. With that removed, the backend still fails on
   `verifyJWT is not defined` (`src/routes/accounts.js:57`),
   `cancel is not defined` (`src/controllers/turretsController.js`) and
   `contactsRoutes is not defined` (`src/server.js:143`). Until these are
   fixed, the backend container in `docker-compose.yml` stays unhealthy, so
   `frontend` never starts. In `docker-compose.test.yml`, 12 of 31 suites fail
   for the same reasons.

**`docker-compose.prod.yml`** (found by reading the files; not run, because
the backend cannot boot)

3. **nginx cannot reach the backend.** The `nginx` service declares no
   `networks:`, so it joins only the project `default` network. `frontend`
   is on `proxy`/`frontend` and `backend` is on `frontend`/`backend`. nginx
   resolves `proxy_pass http://backend:4000/` when it loads its config, so
   it exits with `host not found in upstream`. `docker-compose.staging.yml`
   has the same problem: nginx is on `proxy` only, and the backend is not.
4. **No TLS.** Port 443 is published, but `nginx/nginx.conf` only has a
   `listen 80` server block and no certificates are mounted.
5. **Frontend `environment:` values have no effect.** The frontend is a
   static export, so `NEXT_PUBLIC_*` values are baked in by `npm run build`.
   The values set on the running container are ignored, and the bundle falls
   back to the defaults in `next.config.mjs` (for example
   `NEXT_PUBLIC_API_URL=http://localhost:4000`).
6. **Rebuilt frontend files don't show up.** The `frontend_static` named
   volume is copied from the image only on first use, so after a rebuild nginx
   keeps serving the old files until you run `down -v`.

The earlier secrets problems are fixed. Missing secrets
([#1366](https://github.com/Emmy123222/Stellar-MicroPay/issues/1366)),
`PAYMENT_SIGNING_SECRET`
([#1368](https://github.com/Emmy123222/Stellar-MicroPay/issues/1368)) and
`*_FILE` support
([#1367](https://github.com/Emmy123222/Stellar-MicroPay/issues/1367)) were
all resolved in #1525.

**`docker-compose.staging.yml`** (found by reading the files; not run)

7. **Secrets are mounted but never read.** The backend mounts `jwt_secret`
   and `server_private_key` but sets no `JWT_SECRET_FILE` or
   `SERVER_PRIVATE_KEY_FILE`. It runs with `NODE_ENV=staging`, which skips
   the production secret check. As a result it falls back to the hardcoded
   test `JWT_SECRET` from `src/middleware/auth.js`, and no
   `PAYMENT_SIGNING_SECRET` is provided at all.
8. **The image names may not match.** The pulled images are under
   `ghcr.io/chidubemkingsley/…`, but `deploy-staging.yml` pushes to
   `ghcr.io/${{ github.repository_owner }}/…`.

## Prerequisites

- Docker and Docker Compose installed
- Domain name pointed to your server (optional, for production)
- Stellar network credentials (mainnet/testnet)

## Deployment Architecture

The deployment consists of three main containers:
1. **Frontend**: A Next.js application exported as static files, served via Nginx.
2. **Backend**: A Node.js API server.
3. **Nginx Reverse Proxy**: The main entry point that handles SSL (if configured), serves static files directly, and proxies API requests to the backend.

## Step-by-Step Deployment

1. **Clone the repository**:
   ```bash
   git clone https://github.com/devkayazumi/Stellar-MicroPay.git
   cd Stellar-MicroPay
   ```

2. **Configure Environment Variables**:
   Create `.env` files in `frontend/` and `backend/` based on the `.env.example` files provided.

3. **Build and Start Containers**:
   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```
   This does not currently produce a working stack. Read the
   [known issues](#known-issues-verified-2026-10-17) first.

4. **Verify Deployment**:
   - Frontend: `http://localhost`
   - Backend Health: `http://localhost/api/health` (proxied) or `http://localhost:4000/health` (internal)

## Configuration Details

### Nginx (`nginx/nginx.conf`)
- **Gzip Compression**: Enabled for text, css, and javascript.
- **Security Headers**: Includes X-Frame-Options, X-XSS-Protection, and Content-Security-Policy.
- **Reverse Proxy**: Proxies `/api/` to the backend service.

### Dockerfiles
- **Frontend**: Multi-stage build using `node:20-alpine` for building and `nginx:alpine` for serving.
- **Backend**: Uses `node:20-alpine` for a lightweight production image.

## Troubleshooting

- **Check Logs**:
  ```bash
  docker compose -f docker-compose.prod.yml logs -f
  ```
- **Health Checks**:
  Monitor container health using `docker ps`.

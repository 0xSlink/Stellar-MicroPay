# 🧪 mock-horizon

A minimal [Express](https://expressjs.com/) server that imitates the small part of the [Stellar Horizon API](https://developers.stellar.org/docs/data/apis/horizon) the backend uses. It lets integration tests run without the live testnet, so they're fast, deterministic and work offline.

It runs as the `mock-horizon` service in [`docker-compose.test.yml`](../docker-compose.test.yml). The source of truth is [`server.js`](server.js); if this README and the code disagree, the code is right, so please update this file.

---

## 🚀 Running it

### With the integration test stack (what CI does)

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from backend-test
docker compose -f docker-compose.test.yml down --volumes --remove-orphans
```

`backend-test` waits for the mock's `/health` healthcheck, then runs `npm test` with `HORIZON_URL=http://mock-horizon:8000`.

### On its own

```bash
# Docker
docker compose -f docker-compose.test.yml up --build mock-horizon   # → http://localhost:8000

# Or plain Node (20.19.5, see ../.nvmrc)
cd mock-horizon && npm install && npm start                          # → http://localhost:8000
PORT=8123 npm start                                                  # any other port
```

Quick check:

```bash
curl http://localhost:8000/health                       # {"status":"ok"}
curl http://localhost:8000/accounts/GABC                 # any ID works
```

---

## 📡 Implemented endpoints

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/` | Root document: `horizon_version: "mock-2.0.0"`, `core_version: "mock"`, testnet `network_passphrase` |
| `GET` | `/health` | `{"status":"ok"}`. Used by the compose healthcheck. **Not** a real Horizon route |
| `GET` | `/accounts/:accountId` | Account record (see [fixtures](#-fixtures)) |
| `GET` | `/accounts/:accountId/payments` | One-record page with a single native payment |
| `GET` | `/accounts/:accountId/transactions` | Empty page (`records: []`) |
| `POST` | `/transactions` | Always `200` with a fixed hash; echoes the form field `tx` back as `envelope_xdr` |

Every other path returns Express's default **HTML 404**, not a Horizon-style JSON problem document.

---

## 🗂 Fixtures

The mock has no state and no account list. **Every account ID is accepted** (it isn't validated, so `GABC` works too) and gets the same data:

| Field | Value |
| --- | --- |
| `sequence` | `"1234567890"` |
| `balances` | `[{ "asset_type": "native", "balance": "100.0000000" }]` |
| Payment `id` | `"mock-payment-1"` |
| Payment | `10.0000000` XLM `from` the requested account `to` `GBMOCK000RECEIVER000000000000000000000000000000000000000` |
| Payment `created_at` | Current time, so it changes on every request |
| Submitted tx `hash` | `mocktxhash0000000000000000000000000000000000000000000000000000` |
| Submitted tx `ledger` | `12345` |
| Network passphrase | `Test SDF Network ; September 2015` (testnet) |

The receiver address is a placeholder. It isn't a valid StrKey, so `StrKey.isValidEd25519PublicKey()` and `Keypair.fromPublicKey()` will reject it.

---

## 🔌 Pointing the app at it

### Backend

`stellarService.js`, `turretsService.js` and `GET /health/ready` read `HORIZON_URL`:

```bash
# backend/.env
HORIZON_URL=http://localhost:8000
```

Two caveats:

- **`http://` and the SDK.** `Horizon.Server` from `@stellar/stellar-sdk` refuses non-HTTPS URLs unless it gets `{ allowHttp: true }`, and the backend doesn't pass that today. Raw `fetch` callers, such as `/health/ready`, work against the mock. Code paths that go through `Horizon.Server` will throw `Cannot connect to insecure horizon server` until that option is added (or until the mock sits behind TLS).
- **`routes/network.ts`** reads `STELLAR_HORIZON_URL`, not `HORIZON_URL`, and calls `/ledgers`, which the mock doesn't implement.

### Frontend

The frontend **ignores** `NEXT_PUBLIC_HORIZON_URL` for its Horizon client. `getNetworkConfig()` in [`frontend/lib/stellar.ts`](../frontend/lib/stellar.ts) uses the built-in testnet/mainnet URLs unless the browser has a custom config saved. To use the mock, set one in the browser devtools console and reload:

```js
localStorage.setItem(
  "stellar-micropay:network",
  JSON.stringify({ network: "custom", horizonUrl: "http://localhost:8000" })
);
```

Undo it with `localStorage.removeItem("stellar-micropay:network")`. Expect gaps: the frontend calls endpoints the mock doesn't have (for example `/fee_stats`), and the `http://` caveat above applies to its `Horizon.Server` as well. The mock also sends no CORS headers, so browser `fetch` calls from `localhost:3000` will be blocked.

---

## ⚠️ Limitations vs. real Horizon

- **Few endpoints.** No `/ledgers`, `/fee_stats`, `/operations`, `/effects`, `/offers`, `/trades`, `/assets`, `/claimable_balances`, `/paths/*`, `/liquidity_pools`, `/transactions/:hash` or `/accounts/:id/operations`.
- **No query handling.** `cursor`, `limit`, `order` and `join` are ignored. `next`/`prev` links are empty, so pagination stops after one page.
- **No streaming.** `.stream()` / Server-Sent Events aren't supported.
- **No validation or errors.** Unknown accounts don't return `404`. Submissions are never decoded, verified or rejected, so `tx_bad_seq`, `op_underfunded` and other result codes can't be tested.
- **Partial records.** Responses carry only the fields shown above. Real records have more (`paging_token`, `transaction_hash`, `thresholds`, `flags`, `signers`, `subentry_count`, …), and SDK helpers that read them will see `undefined`.
- **No state.** Submitting a transaction doesn't change balances, sequence numbers or payment history.
- **Testnet only.** The passphrase is hard-coded to testnet.
- **No Soroban RPC.** Contract calls need a separate RPC endpoint; this mock only covers Horizon.

For anything listed here, mock the SDK or `fetch` inside the Jest test (see [`backend/__tests__/stellarService.test.js`](../backend/__tests__/stellarService.test.js)), or extend the mock.

---

## ➕ Extending the mock

1. Add a route to [`server.js`](server.js) that returns the same JSON shape as real Horizon. Copy a response from `https://horizon-testnet.stellar.org` and trim it down.
2. Keep fixtures deterministic. Avoid randomness, and avoid timestamps unless the test doesn't depend on them.
3. Update the [endpoint](#-implemented-endpoints) and [fixture](#-fixtures) tables above.
4. Run the stack (`docker compose -f docker-compose.test.yml up --build ...`) to confirm the `integration-test` CI job still passes.

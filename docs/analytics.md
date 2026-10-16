# Analytics Endpoints — Testing & Implementation Guide

## Overview

Three analytics endpoints are available for transaction volume insights:

✅ **GET /api/analytics/:publicKey/summary** — Transaction overview
✅ **GET /api/analytics/:publicKey/top-recipients** — Top 5 recipients by volume
✅ **GET /api/analytics/:publicKey/activity** — Transaction counts by day of week
An admin endpoint is also available:

✅ **DELETE /api/analytics/cache/:publicKey** — Force-invalidate cached analytics for an account (JWT + admin only)

All standard endpoints include:
- **Caching**: 5-minute TTL using an in-memory Map with LRU eviction (max 500 entries by default)
- **Error Handling**: Graceful handling of Horizon errors and invalid public keys
- **Rate Limiting**: Protected by `strictLimiter` middleware
- **Input Sanitization**: Public key validation via `validatePublicKey`

## Files Added/Modified

### New/Updated Files
- `backend/src/services/analyticsService.js` — Business logic, TTL cache, LRU bounding
- `backend/src/controllers/analyticsController.js` — Request handlers
- `backend/src/routes/analytics.js` — Route definitions and admin auth
- `backend/__tests__/analytics.test.js` — Comprehensive unit + integration tests
- `backend/src/server.js` — CORS includes DELETE for endpoint access
- `backend/src/swagger.js` — OpenAPI docs and bearer auth scheme
- `docs/analytics.md` — Usage documentation

## Caching Behavior

All endpoints use **5-minute TTL in-memory caching** to minimize Horizon API calls:

- **First request** → Fetches from Horizon, stores in cache
- **Subsequent requests** (within 5 min) → Returns cached data instantly
- **After 5 minutes** → Cache expires, fetches fresh data from Horizon
- **When cache exceeds max size** → Least-recently-used entries are evicted first
- **Admin invalidation** → `DELETE /api/analytics/cache/:publicKey` clears cached entries immediately

The cache is bounded with **LRU eviction**:

- **Max size**: 500 entries by default, configurable via `ANALYTICS_CACHE_MAX_SIZE`
- Every cache hit refreshes recency, so hot accounts stay cached while inactive ones are evicted
- Memory usage remains bounded for the lifetime of the process

### Admin Cache Invalidation

**Route**: `DELETE /api/analytics/cache/:publicKey`

Force-invalidates all cached analytics entries for an account so the next request fetches fresh data from Horizon. This is useful after an account receives new transactions that must be reflected immediately.

**Authentication**: Requires a valid SEP-0010 JWT (`Bearer` token from `POST /api/auth`). The JWT's `publicKey` must be listed in the `ADMIN_PUBLIC_KEYS` env var (comma-separated). If `ADMIN_PUBLIC_KEYS` is unset, all requests are rejected with `403`.

```bash
curl -X DELETE \
  -H "Authorization: Bearer $JWT" \
  http://localhost:4000/api/analytics/cache/YOUR_PUBLIC_KEY
```

**Response**:
```json
{
  "success": true,
  "data": {
    "publicKey": "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJLVXKJ46ZGFWTTNQNXNHTJXW",
    "invalidated": 3
  }
}
```

This provides:
- ✅ Reduced API load on Stellar Horizon
- ✅ Faster response times for repeated queries
- ✅ No external database required (simple in-memory Map)
- ✅ Bounded memory via LRU eviction
- ✅ On-demand fresh data via the admin invalidation endpoint

## Testing Guide

### Unit / Integration Tests

```bash
cd backend
npm test -- __tests__/analytics.test.js
```

Coverage includes:
- ✅ Summary statistics computation
- ✅ Empty payment history handling
- ✅ Cache functionality (5-minute TTL)
- ✅ Top recipients sorting
- ✅ Sent payments only filtering
- ✅ Top 5 limitation
- ✅ Activity by day for all 7 days
- ✅ Cache invalidation count
- ✅ LRU eviction beyond max size
- ✅ Admin invalidation endpoint auth and behavior

## Implementation Notes

- `backend/src/services/analyticsService.js` is the canonical cache owner.
- `backend/src/routes/analytics.js` enforces admin access before invalidation.
- `backend/src/server.js` allows the `DELETE` verb in CORS.
- `backend/src/swagger.js` documents the admin endpoint and `bearerAuth` security scheme.

## Leaderboard

The public leaderboard (`frontend/pages/leaderboard.tsx`) calls
`GET /api/tips/leaderboard`, served by `getLeaderboard()` in
`backend/src/services/tipsService.js`. It does not use `analyticsService.js`
and does not read Horizon or the Soroban contract directly.

### Data sources

| Metric | Source |
| --- | --- |
| Tips processed | Count of XLM tips recorded through `POST /api/tips` (the frontend posts each tip after the payment is submitted). Held in memory by `tipsService`, so it resets when the backend restarts. |
| Total XLM tipped | Sum of the `amount` field of those same recorded XLM tips. Non-XLM tips are ignored. |
| Top recipients | The 10 creator accounts with the highest recorded XLM received. |
| Top senders | The 10 sender accounts with the highest recorded XLM sent. |
| Federation name | Looked up from usernames registered in the app (`usernameService`), shown as `name*DOMAIN`. Accounts without a registered username show only the public key. |

The underlying payments are public on the Stellar ledger, but the ranking
itself is built from usage data the backend collects when the app records a
tip. Payments made outside the app never appear. The per-creator
`GET /api/tips/leaderboard/:creatorPublicKey` (top tippers for one creator)
uses the same recorded tips.

### Opting out

Signed-in users can hide themselves from rankings in **Settings > Leaderboard
privacy**. The setting is stored by the backend, not the browser:

- `GET /api/tips/leaderboard/opt-out` returns `{ optedOut }` for the
  authenticated account.
- `PUT /api/tips/leaderboard/opt-out` with `{ "optedOut": true | false }`
  updates it.

Both require a SEP-10 JWT (`Authorization: Bearer <token>`) and only ever
change the caller's own account. Opt-outs are written synchronously to
`backend/data/leaderboard-opt-out.json` (override with
`LEADERBOARD_OPTOUT_DATA_FILE`) using an atomic write, so they survive
restarts.

Opted-out accounts are removed server-side from the recipient and sender
rankings and from per-creator top tipper lists, so they are
never present in the API response. Their tips still count toward the aggregate
"Tips processed" and "Total XLM tipped" figures and toward the totals of the
creators they tipped, because removing them would misstate those creators'
earnings. Opting out does not hide anything on the public Stellar ledger.

Tests: `backend/__tests__/leaderboardOptOut.test.js` and
`frontend/__tests__/LeaderboardPrivacyToggle.test.tsx`.

# Stellar and Soroban Glossary

Terms you will run into while working on Stellar MicroPay, in alphabetical
order. Each entry says what the term means in this codebase and links to the
file that implements it or the spec it comes from. Paths are relative to the
repository root; `lib.rs` means `contracts/stellar-micropay-contract/src/lib.rs`.

If you add a feature that introduces a new term, add it here in the right
place.

---

### Basis points (bps)
One basis point is 1/100 of a percent (1 bps = 0.01%). The contract charges an
optional operator fee on every tip, stored as `FeeBps` and set with
`set_fee_bps`; it is capped at `MAX_FEE_BPS = 500` (5%) and divided by
`FEE_BPS_DENOMINATOR = 10_000`. See [`lib.rs`](contracts/stellar-micropay-contract/src/lib.rs).

### Federation (SEP-2)
Maps a readable address such as `alice*stellarmicropay.com` to a `G...` public
key. The backend answers federation lookups at `GET /federation?q=...&type=name`
using usernames registered in the app. See
[`backend/src/routes/federation.js`](backend/src/routes/federation.js) and the
[SEP-0002 spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0002.md).

### Freighter
The browser wallet extension the app connects to. It holds the user's keys and
signs transactions the frontend builds; the app never sees a secret key. See
[`frontend/lib/wallet.ts`](frontend/lib/wallet.ts) and the
[Freighter docs](https://developers.stellar.org/docs/tools/developer-tools/wallets/freighter).

### Horizon
Stellar's REST API for accounts, payments and transactions. The frontend and
backend read balances and payment history from it; its URL comes from
`NEXT_PUBLIC_HORIZON_URL` / `HORIZON_URL` or the network chosen in Settings.
See [`frontend/lib/stellar.ts`](frontend/lib/stellar.ts) and the
[Horizon reference](https://developers.stellar.org/docs/data/apis/horizon).

### Instance storage
Soroban storage that lives with the contract instance and shares its lifetime
(TTL). This contract keeps its admin, fee, frozen flag, tip totals, tip and
receipt records, streams and time-locked escrows in instance storage, and bumps
the instance TTL at the start of every entry point (`bump_instance`). See
[`lib.rs`](contracts/stellar-micropay-contract/src/lib.rs) and
[Soroban storage types](https://developers.stellar.org/docs/build/guides/storage/choosing-the-right-storage).

### Ledger (block)
A closed snapshot of network state, roughly every 5 seconds, identified by a
sequence number. Stream accrual is measured in ledgers (`start_ledger`,
`rate_per_ledger`). Not to be confused with the Ledger hardware wallet. See
[Stellar ledgers](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers).

### Ledger (hardware wallet)
The hardware device supported as an alternative signer over WebHID. See
[`frontend/lib/wallet.ts`](frontend/lib/wallet.ts) (`getLedgerPublicKey`,
`signTransactionWithLedger`) and [`docs/ledger.md`](docs/ledger.md).

### Memo
A short note attached to a Stellar transaction. Text memos are limited to 28
bytes of UTF-8, which the app checks with `memoTextByteLength`; memos are also
carried in SEP-7 links and tip records. See
[`frontend/lib/stellar.ts`](frontend/lib/stellar.ts) and
[Stellar memos](https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/memos).

### Milestone escrow
Funds a payer locks in the contract and a named approver releases milestone by
milestone. The payer can dispute and, once the dispute timeout (at most
`MAX_DISPUTE_TIMEOUT` ledgers) passes, reclaim the remainder. Records use
persistent storage. See `create_milestone_escrow`, `approve_milestone`,
`dispute_milestone` and `cancel_milestone_escrow` in
[`lib.rs`](contracts/stellar-micropay-contract/src/lib.rs) and the
[contract README](contracts/stellar-micropay-contract/README.md#milestone-escrow).

### Payment stream
A payer deposits funds into the contract and the recipient's claimable balance
grows every ledger at `rate_per_ledger` until the deposit runs out. The payer
can top up, pause, resume or close (refunding what has not accrued). See
`open_stream`, `claim_stream`, `top_up_stream` and `close_stream` in
[`lib.rs`](contracts/stellar-micropay-contract/src/lib.rs) and
[`frontend/pages/streams.tsx`](frontend/pages/streams.tsx).

### Persistent storage
Soroban storage for entries that each have their own TTL and can be restored
after they expire. This contract uses it for milestone escrows and extends the
TTL on every read and write (`load_escrow`, `save_escrow`). See
[`lib.rs`](contracts/stellar-micropay-contract/src/lib.rs).

### Rate per ledger
How many stroops a stream moves from payer to recipient each ledger.
Claimable is `min((current_ledger - start_ledger) * rate_per_ledger, deposited) - claimed`,
ignoring paused time. See `get_claimable` in
[`lib.rs`](contracts/stellar-micropay-contract/src/lib.rs).

### SEP-7 (payment URIs)
The `web+stellar:pay?...` and `web+stellar:tx?...` URI scheme for asking a
wallet to pay or sign. The app builds and parses these for payment requests,
QR codes and deep links. See
[`frontend/lib/sep0007.ts`](frontend/lib/sep0007.ts) (`buildSep0007Uri`,
`parseStellarURI`) and the
[SEP-0007 spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md).

### SEP-10 (web authentication)
Wallet-based login: the backend issues a challenge transaction signed by
`SERVER_PRIVATE_KEY`, the user signs it in their wallet, and the backend returns
a JWT signed with `JWT_SECRET`. Protected routes check it with `verifyJWT`. See
[`backend/src/routes/auth.js`](backend/src/routes/auth.js),
[`frontend/lib/wallet.ts`](frontend/lib/wallet.ts) (`performSEP0010Auth`) and
the [SEP-0010 spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md).

### Sequence number
A per-account counter; each transaction must use the next value, which prevents
replays and orders transactions. Building a transaction loads the account first
for this reason. See
[accounts](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts).

### Soroban
Stellar's smart contract platform. Contracts are written in Rust with
`soroban-sdk` and compiled to WASM. This repository has one contract, in
[`contracts/stellar-micropay-contract/`](contracts/stellar-micropay-contract/).
See the [Soroban docs](https://developers.stellar.org/docs/build/smart-contracts/overview).

### Soroban RPC
The JSON-RPC service used to simulate, submit and read contract calls
(`simulateTransaction`, `getLedgerEntries`, `getEvents`). The backend reads
contract events and streams through it (`SOROBAN_RPC_URL`). See
[`backend/src/services/eventStreamService.js`](backend/src/services/eventStreamService.js)
and the [RPC reference](https://developers.stellar.org/docs/data/apis/rpc).

### Spec (contract spec)
The interface description (functions, argument types, errors) embedded in the
compiled WASM as XDR. The Stellar CLI and SDKs read it to encode `invoke`
arguments and generate bindings. See
[contract spec](https://developers.stellar.org/docs/learn/fundamentals/contract-development/types/fully-typed-contracts).

### Stroop
The smallest unit of XLM: 1 XLM = 10,000,000 stroops. Contract amounts
(`deposited`, `claimed`, tip amounts) are `i128` stroops. See
[lumens](https://developers.stellar.org/docs/learn/fundamentals/lumens).

### Tip page
A creator's public page at `/tip/<username>` where anyone can send them a tip.
The page sends a Stellar payment and then reports it to the backend
(`POST /api/tips`), which feeds the leaderboard. The contract separately offers
`send_tip` for tips recorded on-chain with the operator fee. See
[`frontend/pages/tip/[username].tsx`](frontend/pages/tip/%5Busername%5D.tsx),
[`backend/src/services/tipsService.js`](backend/src/services/tipsService.js)
and [`docs/analytics.md`](docs/analytics.md#leaderboard).

### Trustline
An account's opt-in to hold a non-XLM asset; it reserves a little XLM. A
recipient needs a trustline before they can receive tokens such as USDC. See
[trustlines](https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts#trustlines).

### TTL and bump
Every Soroban storage entry has a time-to-live in ledgers. "Bumping" means
calling `extend_ttl(threshold, extend_to)`: if the remaining TTL is below
`threshold`, it is raised to `extend_to`. The contract uses
`INSTANCE_TTL_THRESHOLD`/`INSTANCE_TTL_BUMP` and
`ESCROW_TTL_THRESHOLD`/`ESCROW_TTL_BUMP`. See
[`lib.rs`](contracts/stellar-micropay-contract/src/lib.rs) and
[state archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival).

### Turrets
Stellar Turrets run small JavaScript `txFunctions` off-chain and co-sign
transactions when conditions are met. The app uses them for automated
strategies such as recurring payments and DCA, via a sidecar server. See
[`backend/src/services/turretsService.js`](backend/src/services/turretsService.js),
[`backend/src/turretsServer.js`](backend/src/turretsServer.js),
[`docs/turrets.md`](docs/turrets.md) and [tss.stellar.org](https://tss.stellar.org/).

### WASM
WebAssembly, the bytecode format Soroban runs. `stellar contract build` turns
the Rust contract into a `.wasm` file that is uploaded and deployed. See the
[contract README](contracts/stellar-micropay-contract/README.md#build).

### XDR
Stellar's binary encoding for transactions, ledger entries and contract
values, usually passed around as base64. Wallets receive transaction XDR to
sign (`signTransactionWithWallet` in
[`frontend/lib/wallet.ts`](frontend/lib/wallet.ts)). See
[XDR](https://developers.stellar.org/docs/learn/fundamentals/data-format/xdr).

### XLM (lumens)
Stellar's native asset, used for fees, account reserves and, by default, tips,
streams and escrows in this app. See
[lumens](https://developers.stellar.org/docs/learn/fundamentals/lumens).

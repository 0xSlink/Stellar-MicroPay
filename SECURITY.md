# Security Policy

## Supported versions

Security fixes land on `main` and ship in the next release. Older releases are
not patched, so please check that an issue still reproduces on the latest
`main` before reporting it.

| Version | Supported |
| --- | --- |
| Latest `main` / latest release | Yes |
| Previous release | No |
| Anything older | No |

## Threat model

Stellar MicroPay is a non-custodial app made of three parts with different
trust properties:

- **Frontend (`frontend/`) is the trust root for users.** Private keys never
  leave Freighter or a Ledger device, but the JavaScript we serve builds every
  transaction the wallet is asked to sign. A compromised bundle, dependency or
  hosting account could rewrite a destination address, amount or memo before
  the signing prompt, and most users would not notice. Supply-chain issues,
  XSS, and anything that lets an attacker change what the app asks a wallet to
  sign are treated as high severity.
- **Backend (`backend/`) holds no user funds, but holds secrets.** It keeps
  `JWT_SECRET` (signs session tokens; leaking it lets anyone impersonate any
  account in the API) and `SERVER_PRIVATE_KEY` (the server account used to sign
  SEP-10 challenges). It also stores user data such as usernames, contacts,
  webhooks and leaderboard preferences. Authentication bypass, secret
  disclosure, SSRF through webhooks and data leaks between accounts are in
  scope.
- **Contract (`contracts/stellar-micropay-contract/`) holds funds.** Streamed,
  escrowed and milestone deposits sit in the contract until they are claimed,
  released or refunded. Any way to move those funds without the right
  authorization, lock them permanently, or abuse admin functions (`upgrade`,
  `set_admin`, `freeze`) is critical.

Known accepted risks:

- Anyone who controls the admin key can upgrade the contract or freeze it. This
  is intentional for incident response; the admin key must be kept offline.
- Tip leaderboard data is recorded by the backend when the app reports a tip,
  and is not verified against the ledger.
- The app relies on the integrity of public Horizon and Soroban RPC endpoints
  for the data it displays.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Machine-readable contact details are published at
[`/.well-known/security.txt`](./frontend/public/.well-known/security.txt).

1. Preferred: GitHub private vulnerability reporting on this repository
   (**Security** > **Advisories** > **Report a vulnerability**), so only the
   maintainers can see the report.
2. If that button is not available, email **emmanuelogheneovo17@gmail.com**
   with the subject line `[SECURITY] Stellar MicroPay`.
3. Include the affected component (`frontend/`, `backend/`, or
   `contracts/stellar-micropay-contract/`), reproduction steps, and the impact
   you observed.

When reporting, please include:

1. A concise description of the vulnerability and its potential impact.
2. Steps to reproduce or a proof of concept (a minimal snippet is ideal).
3. The version or commit hash where you observed the issue.
4. Your suggested severity (Critical / High / Medium / Low).

We will acknowledge receipt within **48 hours** and aim to provide an initial
assessment within **5 business days**. Please give us a reasonable window to
ship a fix before disclosing anything publicly.

## Scope

In scope:

- `contracts/stellar-micropay-contract/`, the Soroban smart contract,
  including admin and upgrade paths
- The backend API (`backend/`), including SEP-10 auth, JWT handling,
  webhooks, federation and the Turrets sidecar
- The frontend (`frontend/`), including anything that changes what a wallet is
  asked to sign
- Build, CI and release configuration in this repository (`.github/`,
  Dockerfiles, deploy scripts)
- Dependency vulnerabilities that are reachable in this project

Out of scope:

- Stellar protocol, Stellar Core, Horizon or Soroban RPC issues. Report those
  to the [Stellar Bug Bounty](https://www.stellar.org/bug-bounty-program)
- Vulnerabilities in Freighter, Ledger firmware or other wallets
- Issues in third-party services we deploy to (Vercel, Docker Hub, GHCR)
- Attacks that need an already compromised user device or browser
- Testnet-only funds and the local development stack (`docker compose`,
  `make localnet-up`), including the placeholder dev `JWT_SECRET`
- Missing security headers or rate limits with no demonstrated impact,
  and social engineering of maintainers
- Theoretical vulnerabilities without a practical attack path

## Disclosure Policy

We follow **coordinated disclosure**:

1. Reporter notifies us privately.
2. We investigate and develop a fix, targeting a patch release within **14 days** for
   Critical/High issues and **30 days** for Medium/Low.
3. We publish a patched release and credit the reporter in the changelog (unless
   they prefer anonymity).
4. Reporter may publish their findings 7 days after the patch is released, or sooner
   by mutual agreement.

## Preferred Languages

Reports in **English** are preferred, though we will do our best with other languages.

## Recognition

We gratefully acknowledge security reporters in our
[CHANGELOG](./CHANGELOG.md) under the release that includes their fix.

## Automated vulnerability scanning

Dependency scanning runs automatically on every push and pull request, and no step is allowed to be skipped:

| Check | Command | Runs in | Fails on |
| --- | --- | --- | --- |
| Frontend audit | `npm audit --audit-level=high` | `.github/workflows/ci.yml` → `frontend` job | HIGH or CRITICAL |
| Backend audit | `npm audit --audit-level=high` | `.github/workflows/ci.yml` → `backend` job | HIGH or CRITICAL |
| Contract audit | `cargo audit` (via [`rustsec/audit-check`](https://github.com/rustsec/audit-check)) | `.github/workflows/ci.yml` → `contracts` job | any vulnerability advisory |

`cargo audit` has no severity threshold, so it is not scoped the way the npm checks are: it fails the build on any *vulnerability* advisory, whatever the severity. Advisories that only flag an unmaintained or informational crate — for example `RUSTSEC-2024-0436` for `paste`, pulled in transitively by the Soroban SDK's build dependencies — are printed as warnings and do not fail the build. The same three checks also run on a weekly schedule in [`.github/workflows/security-audit.yml`](.github/workflows/security-audit.yml) to catch advisories published after a dependency was last touched.

Static analysis runs alongside these: [CodeQL](.github/workflows/codeql.yml) for JavaScript/TypeScript and Rust, and [Gitleaks](.github/workflows/gitleaks.yml) for committed secrets.

Reproduce the audit locally before pushing:

```bash
cd frontend && npm ci && npm audit --audit-level=high
cd backend  && npm ci && npm audit --audit-level=high
cargo install cargo-audit        # first run only
cargo audit                      # from the repo root; reads the workspace Cargo.lock
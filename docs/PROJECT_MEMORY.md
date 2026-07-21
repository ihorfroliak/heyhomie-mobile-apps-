# PROJECT_MEMORY — start here

**First read for any new session.** Understand the project in minutes; open detail on demand.
CURRENT STATE FIRST, HISTORY ON DEMAND.

## 1. What it is
npm-workspaces monorepo — 3 Expo apps (`apps/{client,admin,worker}`) + pure-TS packages
(`packages/{domain,api,ui,design,analytics}`) + Fastify+Postgres `server/`. Cleaning
marketplace, Polish market. `main` branch, auto commit+push per successful Build.

## 2. Current state (trusted when gate/CI green)
- **Latest: Build 30** (SSE stream revocation). Full auth lifecycle + instant revocation shipped.
- **Baseline green:** `npm run check` = 796 gated assertions / 0 fail · `typecheck:server` 0 ·
  `verify:full` (gate + live + e2e + pg + ops) green · CI green. HEAD → `git log -1`.
- **Readiness ~pilot-ready** single-instance; remaining lifts are external infra or a
  contract-versioned scale track (see §6). Detail → [PRODUCTION_STATUS.md](PRODUCTION_STATUS.md).

## 3. Architecture map (one line)
UI → **`orderGateway`** (frozen contract) → Local adapter (offline) **or** Http adapter →
**`orderService`** (authoritative, tenant-enforced, repo-injected memory|pg). Auth is a
**single engine** `makeAuthService` (injected `AuthRepo`+`AuthCrypto`), orthogonal to the
contract. Diagram + file map → [PROJECT_STATE.md §2](PROJECT_STATE.md) / [INDEX.md](INDEX.md).

## 4. Frozen boundaries (do NOT change without explicit versioned-major authorization)
- `packages/api/orderContract.ts` (`OrderGateway`, `Order`, `OrderStatus`) — **frozen**.
- UI imports ONLY `orderGateway` (compile wall + `check-apps.mjs`), never the store.
- `tenantId`/`auth` are server-side only — never in the contract `Order` or UI.
- Migrations are **additive/idempotent/advisory-locked**; no breaking API changes.

## 5. Engineering standards (durable — full text in [PROJECT_STATE.md §3](PROJECT_STATE.md))
1 single auth engine · 2 capability tokens (opaque, sha256-stored, single-use) · 3 enumeration-safe
· 4 deny-by-default `ownerTarget` · 5 views omit secrets · 6 never touch OrderGateway from auth ·
7 **NotificationPort** (one delivery seam) · 8 **AuditPort** (one accountability seam) ·
9 **retention sweep** (`purgeExpired`) · 10 **RevocationIndex** (instant revocation; long-lived
connections re-check). Reuse these before inventing a new abstraction.

## 6. What's left (source of the next Build → [OPEN_ITEMS.md](OPEN_ITEMS.md))
- **In-repo, contract-safe:** repo hygiene (prune legacy `homieClient`/`accountingClient`/
  `marketingClient` seam); `login.failed` auditing; worker demo-tab migration.
- **External creds:** real `NotificationPort` provider (SMTP/SES) — seam done.
- **External infra:** managed host/TLS/pg; multi-instance shared `RevocationIndex`/rate-limit.
- **Deferred major-version (OrderGateway v2):** pagination + SSE-delta (the Scalability ~50 gap).
- **Accepted trade-offs (do NOT "fix" without reason):** listed in [OPEN_ITEMS.md](OPEN_ITEMS.md).

## 7. History (on demand only)
Slim index → [BUILD_HISTORY.md](BUILD_HISTORY.md). Full per-Build detail (shipped + defects) →
[archive/builds/BUILD_LEDGER_DETAIL.md](archive/builds/BUILD_LEDGER_DETAIL.md). **Do not
re-audit closed Builds** — trust the record when gate/typecheck/CI are green.

## 8. Reading order for a fresh session
1. this file → 2. [PROJECT_STATE.md](PROJECT_STATE.md) (architecture + standards) →
3. [OPEN_ITEMS.md](OPEN_ITEMS.md) (pick next Build) → 4. [PRODUCTION_STATUS.md](PRODUCTION_STATUS.md)
(readiness) → 5. only the 1–2 subsystem files/tests the task needs → 6. the archived Build
detail **only if** historical context is required. Don't re-scan the tree.

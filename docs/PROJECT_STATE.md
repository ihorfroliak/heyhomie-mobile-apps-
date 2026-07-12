# HeyHomie — Project State & Continuation Archive

Durable handoff. Read this first in any new session to continue development
without re-deriving context. Reflects the repository as-is (evidence, not plans).

Last updated: Build 16. Current commit `a777d78`, pushed to
https://github.com/ihorfroliak/heyhomie-mobile-apps- .

---

## NEXT SESSION BOOTSTRAP (zero chat history → productive immediately)

**Read order:** this file → [INDEX.md](INDEX.md) (file map) → [OPEN_ITEMS.md](OPEN_ITEMS.md)
(what's left) → [PRODUCTION_STATUS.md](PRODUCTION_STATUS.md) (readiness) →
[BUILD_HISTORY.md](BUILD_HISTORY.md) (why). Don't re-scan the tree; trust the maps.

- **Where:** `C:\Users\ihorf\Downloads\heyhomie-apps`. Commit `a777d78` on `main`, clean, pushed.
- **What it is:** npm-workspaces monorepo — 3 Expo apps + pure-TS packages + Fastify/Postgres `server/`. Cleaning marketplace, Polish market.
- **The spine:** UI → frozen `OrderGateway` contract → Local adapter (active, offline) OR Http adapter → authoritative `orderService` (CAS, tenant) → repo (memory | pg). See [INDEX.md §Architecture].
- **Readiness:** ~82% for a single-instance pilot. Remaining work is external infra + a contract-versioned pagination/delta for scale — NOT in-repo code blockers.

**Commands (validation order):**
1. `npm run check` — THE gate (tests + typecheck + anti-dep guard). Green = 628 assertions.
2. `npm run typecheck` (subset of #1), `npm run check:apps` (RN guard).
3. Single test: `npx -y tsx packages/api/orderService.test.ts`.
4. Infra tests (need Docker/Postgres, NOT in the gate): `npm run test:pg | test:ops | test:live | test:repro`.
5. Full stack: `docker compose up --build`.

**Recurring pitfalls:**
- Bash cwd resets each call → prepend `cd /c/Users/ihorf/Downloads/heyhomie-apps`.
- RN screens can't typecheck here (no native node_modules) → `check:apps` is their guard.
- Docker daemon (Docker Desktop) is intermittently down → pg/ops/docker tests may be blocked; pure logic still runs on the memory repo.
- Windows LF→CRLF git warnings are benign.
- **Execution finds bugs static review misses** — always run the real path (signals, concurrency, docker, live HTTP), never assume PASS.

**Things explicitly NOT to change (locked decisions):**
- The `OrderGateway` contract (`packages/api/orderContract.ts`) — frozen; any change = new build/version.
- UI must import ONLY `orderGateway`, never the store (compile wall + `check-apps.mjs` guard).
- `tenantId`/`auth` stay server-side — never in the contract `Order` or UI.
- Dockerfile CMD must be `node --import tsx` (node PID 1 for SIGTERM drain).
- `forceCloseConnections: true` + readiness-flip drain — the two together are load-bearing for graceful shutdown; don't touch one without the other ([INDEX] Build 14/16).
- Auto commit+push after every successful build is the user's standing instruction.

---

## 1. What this is

npm-workspaces monorepo. Three Expo/React-Native apps (`apps/{client,worker,admin}`)
+ pure-TS packages (`packages/{domain,api,ui,design,analytics}`) + a Fastify+Postgres
orders backend (`server/`).

- **Domain layer** (`packages/domain`, 32 modules): all cleaning-marketplace business
  rules — booking config, scheduling (reschedule/cancel-fee 24h/50%), payouts, tips,
  payment lifecycle, catalog/coverage, delivery, NIP/PL-phone validation, invoicing/JPK.
  Framework-free, heavily tested.
- **API layer** (`packages/api`): the OrderGateway contract + adapters + the mock/auth
  primitives. This is the seam between UI and backend.
- **UI**: RN screens. Talk ONLY to `orderGateway`. Never to the store (enforced).
- **server/**: authoritative orders backend (real, deployable; not run in-session yet).

## 2. Architecture (the spine — Builds 03A/04/05)

```
UI (apps/*)  ──imports only──►  orderGateway  (packages/api/orderContract.ts = frozen interface)
                                     │
                 ┌───────────────────┴───────────────────┐
        localOrderGateway                         httpOrderGateway
        (orderGateway.ts,                         (httpOrderGateway.ts,
         wraps private bookingStore,               over OrderBackendPort:
         AsyncStorage-durable)                      real httpOrderPort = fetch+SSE,
                                                     fake = fakeBackend.ts)
                                                          │
                                                    orderService.ts  (authoritative,
                                                    repo-injected, +AuthContext, tenant)
                                                     ┌────┴────┐
                                              memoryOrderRepo   pgOrderRepo (server/)
```

- **Contract frozen**: `packages/api/orderContract.ts` — `OrderGateway` (8 primitives:
  submitOrder/getOrder/listOrders/confirmOrder/completeOrder/cancelOrder/settleOrder/markPaid
  + init/subscribe/ordersSnapshot/leadsSnapshot/captureLead), `Order`, `OrderStatus`.
  **Never change without a new build.** No `tenantId`/`auth` in it (orthogonal).
- **Active binding**: `orderGateway = localOrderGateway` (in `orderGateway.ts`). Flip to
  `makeHttpOrderGateway(httpOrderPort({ baseUrl, getToken }))` when the server is deployed —
  one line, no UI change. NOT flipped yet (no live server = would break apps offline).
- **Anti-dependency enforced**: `bookingStore` is NOT exported from the `@heyhomie/api`
  barrel (compile wall) + `tools/check-apps.mjs` fails the build if any `apps/` file names a
  store symbol. UI is store-free (grep-verified).

## 3. Auth + tenancy (Build 05)

- `packages/api/auth.ts` — pure (no crypto → RN-safe): `AuthContext{userId,tenantId,role}`,
  `FORBIDDEN_TENANT_ACCESS`, `requireOwned` (deny-by-default).
- `orderService` methods all take `auth`; reads tenant-scoped, cross-tenant mutation →
  throws `FORBIDDEN_TENANT_ACCESS`. `ServerOrder.tenantId` is server-only; `toContractOrder`
  drops it (no leak to the contract `Order`).
- Server trust boundary: `server/src/auth.ts` — HMAC sign/verify (node:crypto, timing-safe),
  `authenticateRequest` preHandler (Bearer or dev `x-dev-*` headers when `AUTH_DEV_MODE=1`).
- DB: `orders.tenant_id` NOT NULL + indexed, pinned on update.

## 4. How to run

```bash
# tests + typecheck + app/anti-dep guard (the standard gate)
npm run check              # 31 files · 618 assertions · typecheck 0 · 56 app files 0 problems
npm test                   # auto-discovers every *.test.ts
npm run typecheck          # tsconfig.check.json (packages/{domain,api,analytics})
npm run check:apps         # brackets + forbidden glyphs + anti-store-import

# apps (Expo)
npm run client | worker | admin

# backend (needs Postgres)
docker run -d --name heyhomie-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
cp server/.env.example server/.env
npm run server             # :8090  /healthz → {"ok":true}   (see server/README.md)
```

## 5. Test coverage (what's proven)

- Domain: 32 modules, hundreds of assertions (scheduling clamp, cancellation, payouts,
  payment lifecycle, delivery, billing/NIP, coverage, tips, CRM, finance, JPK…).
- `packages/api/gateway.test.ts` — SAME order lifecycle green on BOTH adapters (local +
  http-over-fake), idempotency (confirm/cancel/settle ×2), change-feed, stable snapshot.
- `packages/api/orderService.test.ts` — tenant isolation (cross read undefined, cross
  mutate FORBIDDEN, shared-id isolated, no bleed, spy-repo proves every query tenant-scoped).
- `packages/api/bookingStore.test.ts` — persistence round-trip (survives reload).

## 6. CODE COMPLETE vs INFRASTRUCTURE PENDING

**Code complete (in repo, verifiable here):** domain, contract, both gateway adapters,
auth+tenant logic, the Fastify server source, the pure order service.

**Infrastructure pending (needs external, cannot run in-session — no node_modules/Docker/pg):**
- Deploy the server + provision Postgres + real `AUTH_SECRET`.
- A login endpoint that mints the signed token (issuer).
- Flip the gateway binding + point at `EXPO_PUBLIC_ORDERS_API_URL`.
- The live HMAC/HTTP/SSE path is unexercised (verified by inspection + the in-process fake).

## 7. Git

**Committed + pushed.** Builds 01–05 committed to `main` in 6 subsystem commits and
pushed to `origin` → https://github.com/ihorfroliak/heyhomie-mobile-apps- .
Remote `origin` set, `main` tracks `origin/main`. Backup exists. Commit/push future
work per the same convention (subsystem-scoped, `Co-Authored-By` trailer).

## 8. Production hardening (Builds 06–09 — DONE, code-level)

Frozen contract, no features. Delivered and test-proven:
Docker + compose + health probes + graceful shutdown · fail-fast config validation ·
canonical `AppError` model (no leak) · gateway resilience (timeout/retry/backoff/
jitter/budget/dedupe + self-healing SSE) · **optimistic concurrency (version CAS)**
+ idempotent mutations + terminal invariants + DB CHECK (100-parallel + property
tests) · security (token exp+skew, input validation, per-IP rate limit, redaction,
bodyLimit) · observability (Prometheus `/metrics`, correlation ids end-to-end,
structured logs, service+gateway telemetry) · Build 09 verification (stress 500
mutations/1000 reads, reconnect storm, listener-leak fixes, hygiene).
Docs: [engineering/](engineering/data_integrity.md) · [security/](security/security_model.md)
· [observability/](observability/observability.md).
**INFRA PENDING:** deploy + live Postgres/TLS/proxy, versioned migration runner on a
live DB, real token issuer, live e2e.

## 9. Working rules (how this repo is developed)

- Founder Mode: every change moves toward a real customer (order→pay→serve→payout→admin-sees).
  Evidence-only, no assumptions. Verify with `npm run check`. Don't commit/push without ask.
- The Bash tool's cwd resets between calls — prepend `cd /c/Users/ihorf/Downloads/heyhomie-apps`.
- RN screens can't be typechecked here (no node_modules) — `check:apps` is the guard.

# HeyHomie — Project State & Continuation Archive

Durable handoff. Read this first in any new session to continue development
without re-deriving context. Reflects the repository as-is (evidence, not plans).

Last updated: end of Build 05.

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
npm run check              # 23 files · 481 assertions · typecheck 0 · 56 app files 0 problems
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

**NOT committed.** 2 base commits, no remote, ~109 files uncommitted. ONE disk copy, no
backup. Commit + push before any `--dangerously-skip-permissions` / bypass work.

## 8. Build 06 plan (production hardening — NOT started)

Frozen contract, no features. Incremental + verifiable. Most needs the live server →
much will be CODE COMPLETE / INFRA PENDING. Steps:
Dockerfile + compose + healthchecks · env validation (fail-fast) · real versioned
migrations (+rollback, no runtime auto-mutate) · repo reliability (tx, optimistic
concurrency, retry, pool) · request correlation (requestId/traceId) · structured JSON
logs · Prometheus `/metrics` · canonical error model · `/health/live` + `/health/ready` ·
SSE reliability (heartbeat/reconnect/cleanup) · gateway resilience (retry/backoff/abort/
timeout/offline) · security hardening (rate-limit/helmet/CORS/body-limit/token-exp/replay) ·
production + e2e tests · deploy/rollback/backup/restore checklists · architecture +
performance audit · final production report.

## 9. Working rules (how this repo is developed)

- Founder Mode: every change moves toward a real customer (order→pay→serve→payout→admin-sees).
  Evidence-only, no assumptions. Verify with `npm run check`. Don't commit/push without ask.
- The Bash tool's cwd resets between calls — prepend `cd /c/Users/ihorf/Downloads/heyhomie-apps`.
- RN screens can't be typechecked here (no node_modules) — `check:apps` is the guard.

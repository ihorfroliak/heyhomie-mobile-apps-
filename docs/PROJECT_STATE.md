# HeyHomie — Project State & Continuation Archive

Durable handoff. Read this first in any new session to continue development
without re-deriving context. Reflects the repository as-is (evidence, not plans).

Latest build + commit: see [BUILD_HISTORY.md](BUILD_HISTORY.md) (top row) and
`git log`. Remote: https://github.com/ihorfroliak/heyhomie-mobile-apps- .

---

## NEXT SESSION BOOTSTRAP (zero chat history → productive immediately)

**Read order:** this file → [INDEX.md](INDEX.md) (file map) → [OPEN_ITEMS.md](OPEN_ITEMS.md)
(what's left) → [PRODUCTION_STATUS.md](PRODUCTION_STATUS.md) (readiness) →
[BUILD_HISTORY.md](BUILD_HISTORY.md) (why). Don't re-scan the tree; trust the maps.

- **Where:** `C:\Users\ihorf\Downloads\heyhomie-apps`, `main` (clean, pushed). Current commit → `git log -1`.
- **What it is:** npm-workspaces monorepo — 3 Expo apps + pure-TS packages + Fastify/Postgres `server/`. Cleaning marketplace, Polish market.
- **The spine:** UI → frozen `OrderGateway` contract → Local adapter (active, offline) OR Http adapter → authoritative `orderService` (CAS, tenant) → repo (memory | pg). See [INDEX.md §Architecture].
- **Readiness:** ~82% for a single-instance pilot. Remaining work is external infra + a contract-versioned pagination/delta for scale — NOT in-repo code blockers.

**Commands (validation order):**
1. `npm run check` — THE gate (tests + typecheck + anti-dep guard). Green = `N files · M assertions · 0 failed` (the command prints the current numbers).
2. `npm run typecheck` (subset of #1), `npm run check:apps` (RN guard).
3. Single test: `npx -y tsx packages/api/orderService.test.ts`.
4. Infra tests: `npm run test:live | test:e2e` (real Fastify, memory repo, no Docker) · `test:pg | test:ops | test:repro` (need Postgres).
5. `npm run verify:full` — the WHOLE pipeline (gate + `typecheck:server` + live + e2e + pg + ops); needs Postgres on `PG_URL`. Mirrors CI.
6. Full stack: `docker compose up --build`.

CI (Build 19) gates all of the above except repro/load/docker-build: a fast `checks`
job (gate + server typecheck + live) runs in parallel with a `postgres` service job
(pg + ops), both on locked `npm ci`.

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
- **Active binding**: `orderGateway` is **env-selected** (Build 20) — `EXPO_PUBLIC_ORDERS_API_URL`
  set → `httpOrderGateway` wired to the client `auth` facade (`getToken`/`authFetch`); unset →
  `localOrderGateway` (offline default). No UI change either way. Apps call `configureAuth(...)`
  + `auth.bootstrap()` before `orderGateway.init()` (`apps/{client,admin}/app/_layout.tsx`).
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
- **Credential issuer (Build 18, invites Build 23)**: `packages/api/authSession.ts` — pure
  `makeAuthService` (injected `AuthRepo`+`AuthCrypto`, mirrors `orderService`) → `/auth/{register,
  login,refresh,logout,invite,accept-invite}`. Email+password (scrypt), HMAC **access token** +
  opaque single-use-rotating **refresh token**. Server: `authCrypto.ts` + `pgAuthRepo.ts`;
  migrations v5 (`users`+`auth_sessions`) + v6 (`invitations`) + v7 (session metadata +
  `password_resets`) + v8 (`users.disabled_at`). **One tenant → many users**: `register` mints
  an `owner`; the owner `invite`s members (`admin`/`worker`); `accept` joins them. **Auth ops
  (Build 24):** invitation list/revoke, password reset (enumeration-safe, revokes all sessions),
  session mgmt (`revokedReason` distinguishes rotation from deliberate revoke). **Account
  lifecycle (Build 25):** owner `disableUser`/`enableUser`/`deleteUser` + `listMembers`
  (`/auth/users*`). Disabled → login/refresh/reset rejected + sessions revoked; deleted →
  sessions + pending invites revoked, row removed (cascades), email freed, tenant intact.
  Invariants: owner-only, not-self, not-last-owner, cross-tenant-forbidden. `Role` =
  `owner|admin|worker|member`. Contract + access-token format unchanged.

  **Auth project standards (reusable conventions, follow for any new auth surface):**
  1. **One engine** — all auth logic lives in the pure `makeAuthService` (injected `AuthRepo`
     + `AuthCrypto`); server wires `pgAuthRepo`+`authCrypto`, tests wire memory+fake. Never add
     a parallel auth path. 2. **Capability tokens** (refresh / invite / reset) — opaque random
     via `crypto.newRefresh()`, **sha256-stored**, single-use, expiring; the raw token leaves
     once. 3. **Enumeration-safe** — unknown-email and disabled paths return the SAME shape as
     wrong-password (generic 401 / null), with constant-work verification. 4. **Deny-by-default
     resolver** (`ownerTarget`) — missing / cross-tenant / self are rejected identically so
     existence never leaks. 5. **Views omit secrets** — `*View`/`*Summary` never carry hashes.
     6. **Never touch OrderGateway** — auth is orthogonal, injected at the transport/service.
     7. **Delivery via `NotificationPort` only** (Build 26) — capability tokens reach the outside
     world through exactly one seam (`sendInvitation`/`sendPasswordReset`), injected at the
     app/route layer (`AuthDeps.notifications`, default `nullNotificationPort`). The **service
     never delivers** — it mints tokens; the ROUTE hands them to the port. Delivery is
     **best-effort + isolated** (a send failure never fails the auth op nor changes an
     enumeration-safe response; no auto-retry — that's a provider concern). **Logging policy:**
     structured records only; the port RECEIVES the token but NEVER logs it; recipients are
     masked (`maskEmail`); token hashes / passwords / refresh tokens are never passed here or
     logged. A real provider (SMTP/SES/SendGrid) is just another `NotificationPort` impl.
     8. **Accountability via `AuditPort` only** (Build 27) — every privileged / account-lifecycle
     action (invite, revoke, join, disable, enable, delete, password-reset) MUST emit exactly one
     `AuditPort` event from the SERVICE (it authoritatively knows actor + target). Emitting is
     **best-effort + isolated** (a sink failure never fails/rolls-back the op — availability-first;
     a strict-compliance system would make it blocking, a documented, deliberate choice). **Invariant
     it protects:** answerability — "who did what, to whom, when" for a multi-user tenant. **Reuse
     when:** you add any owner/admin action that changes another user's state or access. **Never
     bypass by:** logging the action ad-hoc in a route, or putting a token/hash/password/email-in-clear
     into an event (events carry only type/tenant/actor-id/target-id/target-email/timestamp; the pg
     table has NO token/hash column — schema-enforced; the console sink masks the email). **Consequence
     of violating:** an un-auditable privileged path = a forensic blind spot + a compliance gap.
     Read via `GET /auth/audit` (owner/admin, tenant-scoped). A real SIEM/log-shipper is just another
     `AuditPort` impl.
     9. **Retention sweep for durable capability rows** (Build 28) — any table of *expiring* rows
     (sessions/invitations/password-resets; `auth_sessions` grows one row **per refresh**) MUST be
     purged by `AuthService.purgeExpired()`, scheduled from the bootstrap (`AUTH_PURGE_INTERVAL_SEC`,
     `unref`'d, cleared on shutdown). **Invariant it protects:** bounded storage — an unswept token
     table silently grows until it degrades the DB. **Safe to delete:** only rows where
     `expires_at < now` — a past-expiry token can never validate (expiry is checked BEFORE reuse), so
     the row is inert; **never delete live/unexpired rows** (would revoke real sessions). **Never
     bypass by:** ad-hoc `DELETE`s in a route, or purging by anything other than `expires_at`.
     **`audit_log` is EXEMPT** (accountability/compliance — separate, longer retention policy).
     Mirrors the in-memory sweep convention already in `idempotency.ts`/`rateLimiter.ts`, extended to
     durable rows. **Consequence of violating:** unbounded table growth (perf/disk) or, if you delete
     live rows, mass unintended logout.
     10. **Instant revocation via `RevocationIndex` only** (Build 29) — access validation is
     deliberately STATELESS (pure HMAC; the hot path does zero DB work — that's why reads measure
     ~1788 rps). Instant revocation therefore lives in ONE O(1) in-memory index, written by the auth
     ENGINE (disable/delete/reset/theft → every live session's `sid` exactly + a strictly-before-`iat`
     user entry; logout/session-revoke → that one `sid`) and read by the auth MIDDLEWARE per request.
     **WHY this shape:** a per-request DB lookup (token-version column) would gut the hot path;
     `sid`-exact revocation avoids the 1-second `iat` granularity ambiguity (same-second re-login after
     re-enable works). **WHEN TO REUSE:** any new "this principal must lose access NOW" feature —
     write to the index from the engine, never from a route. **WHEN NOT:** don't use it for ordinary
     expiry (TTL already handles that) and don't grow it into a general cache. **SECURITY INVARIANTS:**
     revoked tokens get the SAME generic 401 (no revocation oracle); entries self-expire after one
     access-TTL (the token is dead anyway) — bounded memory; boot MUST seed from durable state
     (`listRecentRevocations`) or a restart resurrects tokens for ≤1 TTL; single-instance like the
     rate limiter — multi-instance needs a shared store (same INFRA-PENDING item). **COMMON MISTAKES:**
     comparing `iat` with `<=` (kills same-second re-logins); forgetting to revoke sids BEFORE
     durably revoking sessions (the live set is needed); indexing rotation-revoked sessions (bloats
     the index — rotations die naturally). **CONSEQUENCE OF VIOLATING:** either a revocation gap
     (compromised/disabled principals keep access) or a broken login UX. **Long-lived connections
     (Build 30):** a connection authenticated ONCE (SSE `/orders/stream`) must RE-CHECK the index —
     the per-request middleware can't reach an open socket. `/orders/stream` stashes the token's
     `{sid,iat}` (`reqAuthToken`) and re-checks on each heartbeat (cadence `SSE_HEARTBEAT_SEC`,
     default 15s = max cut latency), ending the socket on revocation. **When you add any new
     long-lived/streamed endpoint, apply the same re-check** — do NOT assume connect-time auth is
     sufficient. Residual: the cut latency is one heartbeat (bounded, not instant).
- **Client auth (Build 20/21/22)**: `authClient.ts` (sync `getToken`, `authFetch` refresh-on-401,
  login/register/refresh/logout/bootstrap); **all three apps** (client/admin/worker) authenticate
  + gate to `/login` + consume `orderGateway`; tokens live in **expo-secure-store**. Apps never
  see role/tenant. Worker (Build 22) shows tenant jobs (Order model) + `completeOrder`, no price.
- DB: `orders.tenant_id` NOT NULL + indexed, pinned on update. `users` (email UNIQUE, scrypt)
  + `auth_sessions` (refresh_hash UNIQUE, expires_at, revoked_at) — Build 18.

## 4. How to run

```bash
# tests + typecheck + app/anti-dep guard (the standard gate)
npm run check              # tests + typecheck + app/anti-dep guard — prints the current file/assertion counts
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
- ~~A login endpoint that mints the signed token (issuer).~~ **DONE — Build 18** (`/auth/*`).
- ~~Flip the gateway binding.~~ **DONE — Build 20.** ~~Login UI + secure token storage.~~
  **DONE — Build 21**: client login/register + admin login screens, wired logout, a
  route gate in `_layout` (unauthenticated → `/login`), and **expo-secure-store**
  (encrypted tokens) behind the unchanged `SecureStore` interface. Worker app is still
  offline (not backend-wired) — future.
- The client↔server path (auth + HTTP + SSE + refresh + logout + fresh-start rejection)
  IS exercised end-to-end by `test:e2e` against a real Fastify server; `test:live`/
  `test:pg` cover server + persistence. Production DEPLOY (real host/pg/secret) still unrun.

## 7. Git

**Committed + pushed.** Builds 01–05 committed to `main` in 6 subsystem commits and
pushed to `origin` → https://github.com/ihorfroliak/heyhomie-mobile-apps- .
Remote `origin` set, `main` tracks `origin/main`. Backup exists. Commit/push future
work per the same convention (subsystem-scoped, `Co-Authored-By` trailer).

## 8. Production hardening — status

The full hardening story (Builds 06–17: config/health/shutdown, gateway resilience,
canonical errors, CAS data integrity, security, observability, docker/pg verification,
ops readiness, idempotent create, review-driven fixes) is chronicled in
[BUILD_HISTORY.md](BUILD_HISTORY.md). Current readiness + what's CODE COMPLETE vs
INFRASTRUCTURE PENDING → [PRODUCTION_STATUS.md](PRODUCTION_STATUS.md). Deep dives:
[engineering/](engineering/data_integrity.md) · [security/](security/security_model.md)
· [observability/](observability/observability.md).

## 9. Working rules (how this repo is developed)

- Founder Mode: every change moves toward a real customer (order→pay→serve→payout→admin-sees).
  Evidence-only, no assumptions. Verify with `npm run check`. Don't commit/push without ask.
- The Bash tool's cwd resets between calls — prepend `cd /c/Users/ihorf/Downloads/heyhomie-apps`.
- RN screens can't be typechecked here (no node_modules) — `check:apps` is the guard.

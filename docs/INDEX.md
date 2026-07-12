# HeyHomie — Master Index & Navigation

**Read this FIRST every session.** Durable source of truth (survives chat
compaction). Clickable map of the whole repo so code re-reading is cheap.
Pair with [PROJECT_STATE.md](PROJECT_STATE.md) (current state) + [server/README.md](../server/README.md).

Token protocol: read this + PROJECT_STATE before touching code. Don't re-scan the
tree. Trust the map; open only the 1–2 files a task needs.

---

## Quick nav
- **Next-session bootstrap / handoff** → [docs/PROJECT_STATE.md](PROJECT_STATE.md) (read first)
- Readiness + deploy verdict → [docs/PRODUCTION_STATUS.md](PRODUCTION_STATUS.md)
- What's left / trade-offs → [docs/OPEN_ITEMS.md](OPEN_ITEMS.md)
- Compact build ledger → [docs/BUILD_HISTORY.md](BUILD_HISTORY.md) (detailed log at the bottom of THIS file)
- Deep dives → [docs/engineering/](engineering/data_integrity.md) · [docs/security/](security/security_model.md) · [docs/observability/](observability/observability.md)
- Backend run + auth → [server/README.md](../server/README.md)
- Verify everything → `npm run check` (repo root)
- Remote → https://github.com/ihorfroliak/heyhomie-mobile-apps-

> Doc map: no separate PROJECT.md / KNOWLEDGE_BASE.md — this INDEX is the project map; the knowledge base is [engineering/](engineering/data_integrity.md) + [security/](security/security_model.md) + [observability/](observability/observability.md). Root `ARCHITECTURE.md`/`INTEGRATION.md` are pre-Build-04 legacy (bannered).

## Architecture (one line)
UI → **`orderGateway`** (frozen contract) → Local adapter (offline) **or** Http
adapter → **`orderService`** (authoritative, tenant-enforced) → repo (memory | Postgres).
Full diagram: [PROJECT_STATE.md §2](PROJECT_STATE.md).

---

## File map

### Contract & gateway (the spine — packages/api)
| File | Purpose |
|---|---|
| [orderContract.ts](../packages/api/orderContract.ts) | FROZEN `OrderGateway` interface + `Order`/`OrderStatus`. Never change w/o a new build. |
| [orderGateway.ts](../packages/api/orderGateway.ts) | Local adapter (wraps private store) + active `orderGateway` binding. |
| [httpOrderGateway.ts](../packages/api/httpOrderGateway.ts) | `makeHttpOrderGateway(port)` + real `httpOrderPort` (fetch+SSE, token, timeouts/retry/dedupe, self-healing stream). |
| [httpResilience.ts](../packages/api/httpResilience.ts) | Pure resilience: `withRetry`/`withTimeout`/`backoffDelay`/`RetryBudget`/`dedupe`/`HttpStatusError`. |
| [serverConfig.ts](../packages/api/serverConfig.ts) | Fail-fast env validation (`loadServerConfig`, `ConfigError`). |
| [errors.ts](../packages/api/errors.ts) | Canonical `AppError` hierarchy (internal/public code, status, retryable, `toResponse` — no leak). |
| [fakeBackend.ts](../packages/api/fakeBackend.ts) | In-process port over real `orderService` — lets contract test run http path w/o a server. |
| [orderService.ts](../packages/api/orderService.ts) | Authoritative engine: transitions + tenant enforcement + repo-injected (`memoryOrderRepo`). |
| [auth.ts](../packages/api/auth.ts) | Pure `AuthContext`, `FORBIDDEN_TENANT_ACCESS`, `requireOwned`. No crypto (RN-safe). |
| [bookingStore.ts](../packages/api/bookingStore.ts) | PRIVATE mock store (AsyncStorage-durable). NOT exported from barrel. Don't import in UI. |
| [index.ts](../packages/api/index.ts) | Barrel. Exports contract/gateway/auth/service/fake — NOT the store. |

### Backend (server/ — Fastify + Postgres)
| File | Purpose |
|---|---|
| [src/index.ts](../server/src/index.ts) | Bootstrap: pool, schema, service, auth hook, 403 map, `/dev/token`, listen. |
| [src/auth.ts](../server/src/auth.ts) | HMAC sign/verify (node:crypto, timing-safe) + `authenticateRequest` preHandler. |
| [src/routes.ts](../server/src/routes.ts) | REST ops + SSE `/orders/stream`, all pass `req.auth` to the service. |
| [src/pgRepo.ts](../server/src/pgRepo.ts) | Postgres `OrderRepo`, every query tenant-scoped, update pinned by tenant. |
| [src/db.ts](../server/src/db.ts) | Tuned pg Pool (max/timeouts/statement_timeout) + `initSchema`→migration runner. |
| [src/migrate.ts](../server/src/migrate.ts) | Versioned migrations: `schema_migrations` table + `pg_advisory_lock` (concurrent-safe, exactly-once). |
| [src/app.ts](../server/src/app.ts) | `buildApp` — repo-injected Fastify (hooks, auth, metrics, trustProxy). Same construction prod + tests use. |
| [src/metrics.ts](../server/src/metrics.ts) | Server metric set over the pure registry → `serviceTelemetry`. |
| [.env.example](../server/.env.example) | DATABASE_URL, PORT, AUTH_SECRET, AUTH_DEV_MODE. |

### Domain (packages/domain — pure business rules, 32 modules)
Key ones: [catalog.ts](../packages/domain/catalog.ts) (services+details) ·
[scheduling.ts](../packages/domain/scheduling.ts) (reschedule/cancel-fee) ·
[payment.ts](../packages/domain/payment.ts) (post-completion Stripe lifecycle) ·
[payouts.ts](../packages/domain/payouts.ts) · [tips.ts](../packages/domain/tips.ts) ·
[delivery.ts](../packages/domain/delivery.ts) · [billing.ts](../packages/domain/billing.ts) (NIP) ·
[identity.ts](../packages/domain/identity.ts) · [notifications.ts](../packages/domain/notifications.ts) ·
[invoicing.ts](../packages/domain/invoicing.ts)+[jpk.ts](../packages/domain/jpk.ts) · full list: `packages/domain/index.ts`.

### Apps (apps/* — Expo RN, gateway-only)
| File | Purpose |
|---|---|
| [client/app/book.tsx](../apps/client/app/book.tsx) | Booking flow (config, delivery, payment method, lead callback). |
| [client/app/(tabs)/activity.tsx](../apps/client/app/(tabs)/activity.tsx) | Orders list + live payment status via gateway snapshot. |
| [admin/app/pipeline.tsx](../apps/admin/app/pipeline.tsx) | Funnel + Live bookings + payment status + Mark-paid. |
| [admin/app/pay.tsx](../apps/admin/app/pay.tsx) | Payouts (rates by worker type, overrides, bonus). |
| `client/app/_layout.tsx`, `admin/app/_layout.tsx` | `orderGateway.init(kv)` at startup. |

### UI kit / design
[packages/ui/src](../packages/ui/src) (Card, MissionCard, Segmented, Button…) ·
[packages/design](../packages/design) (colors/spacing/typography tokens).

### Tooling
| File | Purpose |
|---|---|
| [tools/run-tests.mjs](../tools/run-tests.mjs) | Auto-discovers every `*.test.ts`. `npm test`. |
| [tools/check-apps.mjs](../tools/check-apps.mjs) | Bracket/glyph check + ANTI-STORE-IMPORT guard. `npm run check:apps`. |
| [tsconfig.check.json](../tsconfig.check.json) | Typecheck packages/{domain,api,analytics}. `npm run typecheck`. |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | CI: test + typecheck + check:apps. |

## Test map
- [packages/api/gateway.test.ts](../packages/api/gateway.test.ts) — lifecycle on BOTH adapters + idempotency + change-feed.
- [packages/api/orderService.test.ts](../packages/api/orderService.test.ts) — tenant isolation + auth propagation.
- [packages/api/bookingStore.test.ts](../packages/api/bookingStore.test.ts) — persistence round-trip.
- Domain: one `*.test.ts` per area under `packages/domain`.
- Current: **23 files · 481 assertions · 0 failed**.

---

## Build log (compact decisions — the "why")
- **Base (pre-Founder):** 3-app scaffold, domain, ERP/CRM/analytics/coverage/tips/growth/delivery/payment UI, GDPR. Commits `f2f1579`, `6e04a76`.
- **Build 01:** store persistence seam (`KeyValueStore`, survives reload per-app). Cross-app still needs backend.
- **Build 03A:** OrderGateway inversion. Store hidden from barrel + anti-dep guard. UI store-free. Fixed id-collision bug (`uid()`).
- **Build 04:** Http adapter + real Fastify/pg server. Proven drop-in via in-process fake (same lifecycle both adapters). Default binding stays Local (no live server = would regress).
- **Build 05:** Auth + tenant isolation, orthogonal (contract unchanged). Service+repo enforce; HMAC token boundary on server. tenantId never in contract Order.
- **Build 06 (in progress):** production hardening. Done: config fail-fast + health probes + graceful shutdown + Docker/compose; gateway resilience (timeouts/retry/backoff/jitter/budget/dedupe + self-healing SSE); canonical `AppError` (no leak); **data integrity + concurrency** — optimistic version CAS in repo, idempotent retry loop, terminal invariants + DB CHECK, 100-parallel + property tests (see [engineering/](engineering/data_integrity.md)); **security** — token expiry+skew, boundary input validation, per-IP rate limit, canonical 401s, health-probe auth-skip fix, log redaction, bodyLimit (see [security/](security/security_model.md)); **observability** — zero-dep Prometheus registry (`packages/api/metrics.ts`) + `/metrics`, correlation ids end-to-end (gateway header → genReqId → logs → error body), structured request/error/SSE/startup/shutdown logs, `ServiceTelemetry` (mutations + CAS conflicts), gateway telemetry (retry/timeout/sse_reconnect) (see [observability/](observability/observability.md)). Frozen contract, no features. **Build 09 verification:** stress (500 mutations + 1000 reads, 250k ops/s, 0 violations), terminal-state immutability, subscription-churn + SSE-reconnect-storm leak checks; fixed fakeBackend dangling service subscription; removed dead exports (`makeSharedFakeService`, `isSettled`). Remaining CODE: none known. **Build 10 (live validation):** server deps installed (`npm i --workspace @heyhomie/server`), `server/src/app.ts` extracted (buildApp, repo-injected — same construction prod boots), `server/test/live.test.ts` = REAL Fastify on a socket + real fetch/SSE gateways: 23/23 (multi-client sync, tenant isolation over HTTP, canonical errors, /metrics, graceful shutdown w/ open SSE 1ms, startup 21ms). **Real bugs found+fixed:** (1) workspace pkgs lacked `"type":"module"` → CJS lexer lost star re-exports (server couldn't import barrel); (2) Fastify transport 4xx (413) wrapped as 500 → `toCanonical` maps 4xx statusCode; (3) `forceCloseConnections: true` — graceful close would hang on never-idle SSE. `npm run test:live` + CI step added. **Build 11 (pg proof):** `server/test/pg.test.ts` (`npm run test:pg`) ran against a real Postgres 16 container — **16/16 green**: migration on empty db (38ms) + idempotent re-run, schema/index correct, version CAS + stale→ConflictError, duplicate-PK reject, tenant-scoped SQL, **DB CHECK rejects canceled+paid row**, 100-parallel settle→paid-once (v3, 122ms) + 100 cancel + mixed race + 50 parallel creates + failed-CAS-leaves-row-unchanged. **PgOrderRepo == MemoryOrderRepo behaviour: identical.** Phase 4 durability + Phase 6 HTTP-over-pg now GREEN too (**25/25** full run). **Build 11b (Docker, executed):** `docker build` PASS (104s); `docker compose up` → server+db **healthy** against containerized pg (startup 69–106ms, env=production, db:up); db-restart → server reconnects (readiness 200); server-restart → healthy ~5s, migrations re-run idempotent. **2 real deploy defects found+fixed under execution:** (1) compose `AUTH_DEV_MODE=1` default vs image `NODE_ENV=production` → fail-fast crash-loop → default now `0`; (2) Dockerfile HEALTHCHECK `localhost`→IPv6 `::1` refused (app binds IPv4) → false-unhealthy → now `127.0.0.1`. INFRA PENDING: TLS/proxy, token issuer, managed pg, Stripe/email creds. **Build 12 (hardening H1–H5, verified live):** H1 `trustProxy` (config `TRUST_PROXY`; pg.test proves rate-limit keys on X-Forwarded-For — same IP→429, distinct→no 429; direct unaffected); H2 pg Pool tuned (max 10, connectionTimeout 5s, idleTimeout 30s, **statement_timeout 10s** verified live); H3 container runs **non-root** (`USER node`, whoami=node); H4 **versioned migrations** (`migrate.ts`: schema_migrations + `pg_advisory_lock`, concurrent-start = one migrates/other waits — **found+fixed a real race**: `CREATE TABLE IF NOT EXISTS` outside the lock raced pg_type catalog → moved inside lock, 5/5 stable); H5 `npm ci` reproducible build — image **599MB→366MB** (~39%), build 25s. Rate-limit now config-driven (`RATE_CAPACITY`/`RATE_REFILL`). Verified: gate 618, pg.test **31/31 ×5**, live 23/23, compose healthy + restart. **Build 13 (load/perf/resilience, measured on real pg):** `server/test/load.ts` — mixed workload rps/percentiles at conc 10–500, per-op latency, EXPLAIN ANALYZE (all 3 key queries **INDEX scan**: get 0.018ms, list 1.9ms, CAS 0.04ms — `orders_tenant_created_idx` used), statement_timeout fires (57014), pool queues gracefully, 100 SSE clients, multi-instance REST visibility (shared pg). **Real defect found+fixed:** SSE handler error/disconnect post-headers → error handler double-writeHead → **process crash** (`ERR_HTTP_HEADERS_SENT`) under SSE load. Fix: `reply.hijack()` + guarded writes + error-handler `headersSent` guard + activeRequests skip for SSE. Re-verified no crash, live SSE 23/23. **Measured scalability walls (contract-level, not fixed):** unpaginated `GET /orders` (list p50 1151ms@conc50 vs DB 2ms — serializes whole tenant) + full-snapshot SSE (~7MB/client at 5.5k orders) → both need a contract-versioned pagination/delta change (future). **Build 14 (ops readiness, verified real docker+pg):** SIGTERM graceful (exit 0, shutdown_complete 3002ms), rolling deploy (readiness-flip → drain → close, in-flight lost=0, no dup, cross-instance consistent), backup/restore (650/640ms, counts+CHECK intact), 30s soak (no leak: rss Δ15MB noise, handles stable, pool≤10), structured logs w/ no secret leak, unclean SIGKILL recovery (~5s, migrations idempotent 4/4). **2 real ops defects found+fixed:** (1) graceful shutdown dropped in-flight (`forceCloseConnections:true`) OR hung on reconnecting SSE (off/'idle') → fixed with the k8s pattern: `beginShutdown()` flips `/health/ready`→503, drain window, then bounded close + SSE socket teardown hook; index.ts drains `SHUTDOWN_DRAIN_MS` (3s) before close; (2) `npx tsx` as PID 1 → SIGTERM killed the drain mid-way (exit 137) → CMD now `node --import tsx` (node is PID 1). `npm run test:ops`. **Build 15 (independent audit):** 3 defects found by fresh-eyes review, fixed + test-proven: (A) unmatched-route Prometheus label = raw URL → **cardinality/memory DoS** → label `'unmatched'` (live.test proves probes don't mint series); (B) `active_requests` drifted negative (401/404 on `/orders/stream*` hits onResponse w/o increment) → stamp-and-guard, gauge ≥0 verified live; (C) RateLimiter never evicted drained-abandoned buckets (refill only in `allow()`) → **unbounded Map under rotating IPs** → idle-only eviction (safe: idleEvictMs×refill ≥ capacity), 1500-IP eviction test. Gate 621, live 25/25. Recommendations (not defects): prune legacy Rails/Go seam (`packages/api/config.ts`, root `.env.example`), Idempotency-Key on create before real payments, SSE query-token log residual (documented). **Build 16 (validated external review, `server/test/repro.ts` reproduced each first):** fixed 6 confirmed defects + 2 stale comments — C1 SSE subscription/heartbeat/gauge leak on disconnect-during-initial-send (repro: gauge=40 leaked → reorder cleanup BEFORE `await send()` → 0); C2 `SHUTDOWN_DRAIN_MS` silently→0 on ''/'3s'/'-5' (→ strict-parsed in `loadServerConfig`, fail-fast on invalid, empty→default 3000); C3 double-SIGTERM re-entrancy → exit 1 (→ `shuttingDownStarted` guard); C4 clock-rollback subtracts tokens/spurious 429 (→ `Math.max(0, elapsed)`); C5 idle-evict grants full burst early when capacity>refill×idle (→ effective idle window = max(configured, time-to-refill-full), burst-safe); C7 O(n) sweep/request under flood (0.23ms→~0, throttled 1×/window). Gate 628 (+7 regression asserts in security/serverConfig tests), live 25/25. NOT fixed (verified, by design): C6 SSE fan-out = documented scale limit (no correctness impact); C8 toCanonical/fromUnknown divergence = latent (single caller); C9 SSE absent from http metrics = intentional (`sse_connections` gauge is the signal). **No known code/deploy blocker remains in-repo.**

## Hard rules (do not violate)
1. Never change `OrderGateway` contract without a new build.
2. UI imports ONLY `orderGateway` — never the store (guard enforces).
3. `tenantId`/`auth` stay server-side — never in the contract `Order` or UI.
4. Verify with `npm run check`. Don't commit/push without the user asking.
5. Bash cwd resets — prepend `cd /c/Users/ihorf/Downloads/heyhomie-apps`.
6. CODE COMPLETE vs INFRASTRUCTURE PENDING — always distinguish (no Docker/pg/node_modules in-session).

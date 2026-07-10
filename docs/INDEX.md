# HeyHomie — Master Index & Navigation

**Read this FIRST every session.** Durable source of truth (survives chat
compaction). Clickable map of the whole repo so code re-reading is cheap.
Pair with [PROJECT_STATE.md](PROJECT_STATE.md) (current state) + [server/README.md](../server/README.md).

Token protocol: read this + PROJECT_STATE before touching code. Don't re-scan the
tree. Trust the map; open only the 1–2 files a task needs.

---

## Quick nav
- State / handoff → [docs/PROJECT_STATE.md](PROJECT_STATE.md)
- Backend run + auth → [server/README.md](../server/README.md)
- Verify everything → `npm run check` (repo root)
- Remote → https://github.com/ihorfroliak/heyhomie-mobile-apps-

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
| [src/db.ts](../server/src/db.ts) | Pool + schema (orders table, tenant_id column+index). |
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
- **Build 06 (in progress):** production hardening. Done: config fail-fast + health probes + graceful shutdown + Docker/compose; gateway resilience (timeouts/retry/backoff/jitter/budget/dedupe + self-healing SSE); canonical `AppError` (no leak); **data integrity + concurrency** — optimistic version CAS in repo, idempotent retry loop, terminal invariants + DB CHECK, 100-parallel + property tests (see [engineering/](engineering/data_integrity.md)); **security** — token expiry+skew, boundary input validation, per-IP rate limit, canonical 401s, health-probe auth-skip fix, log redaction, bodyLimit (see [security/](security/security_model.md)); **observability** — zero-dep Prometheus registry (`packages/api/metrics.ts`) + `/metrics`, correlation ids end-to-end (gateway header → genReqId → logs → error body), structured request/error/SSE/startup/shutdown logs, `ServiceTelemetry` (mutations + CAS conflicts), gateway telemetry (retry/timeout/sse_reconnect) (see [observability/](observability/observability.md)). Frozen contract, no features. **Build 09 verification:** stress (500 mutations + 1000 reads, 250k ops/s, 0 violations), terminal-state immutability, subscription-churn + SSE-reconnect-storm leak checks; fixed fakeBackend dangling service subscription; removed dead exports (`makeSharedFakeService`, `isSettled`). Remaining CODE: none known. **Build 10 (live validation):** server deps installed (`npm i --workspace @heyhomie/server`), `server/src/app.ts` extracted (buildApp, repo-injected — same construction prod boots), `server/test/live.test.ts` = REAL Fastify on a socket + real fetch/SSE gateways: 23/23 (multi-client sync, tenant isolation over HTTP, canonical errors, /metrics, graceful shutdown w/ open SSE 1ms, startup 21ms). **Real bugs found+fixed:** (1) workspace pkgs lacked `"type":"module"` → CJS lexer lost star re-exports (server couldn't import barrel); (2) Fastify transport 4xx (413) wrapped as 500 → `toCanonical` maps 4xx statusCode; (3) `forceCloseConnections: true` — graceful close would hang on never-idle SSE. `npm run test:live` + CI step added. INFRA PENDING: Docker daemon (compose/pg phases), TLS/proxy, token issuer.

## Hard rules (do not violate)
1. Never change `OrderGateway` contract without a new build.
2. UI imports ONLY `orderGateway` — never the store (guard enforces).
3. `tenantId`/`auth` stay server-side — never in the contract `Order` or UI.
4. Verify with `npm run check`. Don't commit/push without the user asking.
5. Bash cwd resets — prepend `cd /c/Users/ihorf/Downloads/heyhomie-apps`.
6. CODE COMPLETE vs INFRASTRUCTURE PENDING — always distinguish (no Docker/pg/node_modules in-session).

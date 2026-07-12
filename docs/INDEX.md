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
- Build ledger (single source) → [docs/BUILD_HISTORY.md](BUILD_HISTORY.md)
- AI dev team / workflow → [docs/TEAM.md](TEAM.md) + [.claude/agents/](../.claude/agents/)
- Deep dives → [docs/engineering/](engineering/data_integrity.md) · [docs/security/](security/security_model.md) · [docs/observability/](observability/observability.md)
- Legal (pl/en) → [legal/](../legal/) (privacy, terms, non-circumvention)
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
- Current count: run `npm run check` (the gate prints `N files · M assertions · 0 failed`). Infra harnesses (`test:pg|ops|live|repro`) are separate and not in the gate.

---

## Build log
The full chronological ledger (every build, commit, defect found+fixed) lives in
**[BUILD_HISTORY.md](BUILD_HISTORY.md)** — the single source for build history.

At a glance: **Base** 3-app scaffold + domain + UI. **01** store persistence seam.
**03A** OrderGateway inversion (store hidden, anti-dep guard). **04** Http adapter +
Fastify/pg server. **05** auth + tenant isolation (orthogonal). **06** production
hardening — config/health/shutdown, gateway resilience, canonical errors, CAS data
integrity, security, observability (see [engineering/](engineering/data_integrity.md),
[security/](security/security_model.md), [observability/](observability/observability.md)).
**09–11** stress + real-pg + docker verification. **12** H1–H5 hardening (trustProxy,
tuned pool, non-root, versioned migrations, npm ci). **13** load/perf + SSE-crash fix.
**14** ops readiness (graceful shutdown, rolling deploy, backup/restore). **15–16**
independent-review defect fixes (metrics DoS, rate-limiter, SSE leak, shutdown parsing).
**17** idempotent create. Every "verified" build surfaced ≥1 real defect only reachable
by executing the real path — details + measured evidence in [BUILD_HISTORY.md](BUILD_HISTORY.md).

## Hard rules (do not violate)
1. Never change `OrderGateway` contract without a new build.
2. UI imports ONLY `orderGateway` — never the store (guard enforces).
3. `tenantId`/`auth` stay server-side — never in the contract `Order` or UI.
4. Verify with `npm run check`. Don't commit/push without the user asking.
5. Bash cwd resets — prepend `cd /c/Users/ihorf/Downloads/heyhomie-apps`.
6. CODE COMPLETE vs INFRASTRUCTURE PENDING — always distinguish (no Docker/pg/node_modules in-session).

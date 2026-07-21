# Production Status

Latest build → [BUILD_HISTORY.md](BUILD_HISTORY.md). Gate (`npm run check`): all files pass · 0 failed · typecheck 0 · app/anti-dep guard 0 problems (run it for the current counts).

## Readiness (evidence-based, not aspirational)
| Category | Score | Basis |
|---|---|---|
| Production | ~82 | full stack runs correctly on real docker+pg; external infra pending |
| Reliability | 89 | CAS exactly-once, restart recovery, SSE-leak + shutdown re-entrancy fixed |
| Correctness/Concurrency | 84 | 100-parallel exactly-once (real pg), property tests, terminal invariants + DB CHECK |
| Security | 93 | credential auth issuer (scrypt, access+refresh, single-use rotation w/ reuse-detection, enumeration-safe), per-user accounts + owner invites (Build 23), account lifecycle (Builds 24–25), privileged-action audit trail (Build 27), **instant access-token revocation** (`RevocationIndex` + `sid` claim + boot seeding — disable/delete/reset/logout kill live access NOW, not at expiry; device-isolated — Build 29), encrypted mobile token storage + route gate (Build 21), HMAC token exp+skew, tenant isolation (service+repo+CHECK; apps never see role/tenant), rate-limit hardened, redaction, no SQL/JSON injection (parameterized) |
| Observability | 84 | Prometheus `/metrics`, correlation ids end-to-end, structured logs, incident playbook, **privileged-action audit trail** (`AuditPort` → `audit_log`; who did what to whom — Build 27) |
| Operations | 86 | k8s graceful shutdown, rolling deploy, backup/restore, health probes — all measured; **auth-data retention sweep** (purges expired sessions/invites/resets so `auth_sessions` can't grow unbounded — Build 28) |
| Deployment | 85 | docker build + compose healthy + restart verified; non-root, reproducible build |
| Infrastructure | 78 | containerized stack proven; single-instance (multi-instance needs shared state) |
| Maintainability | 87 | clean layering, anti-dep guard, frozen contract, docs; server typecheck now clean + gated (Build 19) |
| Testability | 95 | 796 gated assertions + live/e2e/pg/ops/load/repro harnesses; CI runs the strongest suites — `test:pg`+`test:ops` (real pg), `test:live`, `test:e2e` (auth lifecycle + notification + audit + retention + instant revocation), `typecheck:server`; one-command `verify:full`. Mobile UI not machine-run (no Expo runtime) — auth + gateway logic proven via e2e + gate tests |
| Scalability | ~50 | DB indexed/efficient; SSE full-snapshot + unpaginated list are the ceilings |

## Performance baseline (Build 13, measured on real Postgres via `test:load`)
Mixed workload (70% read / 20% list / 10% create), 3000 req/stage:

| concurrency | rps | p50 | p95 | p99 | max (ms) | errors |
|---|---|---|---|---|---|---|
| 10 | 627 | 14 | 30 | 53 | 137 | 0 |
| 50 | 386 | 124 | 202 | 238 | 261 | 0 |
| 100 | 285 | 343 | 451 | 471 | 501 | 0 |
| 250 | 227 | 1066 | 1330 | 1394 | 1499 | 0 |
| 500 | 185 | 2666 | 2942 | 2997 | 3096 | 0 |

Per-op @conc 50: read **1788 rps** (p99 37ms) · create 1105 (p99 94) · settle 1058
(p99 72) · cancel 939 (p99 113) · **list 43 (p99 1651)** — the outlier (unpaginated
full-tenant serialization; DB itself is 2ms). EXPLAIN: all key queries **Index Scan**
(get 0.018ms, list 1.9ms via `orders_tenant_created_idx`, CAS 0.04ms). `statement_timeout`
fires (57014). Runtime: boot 21–61ms, graceful shutdown 1ms, image 366MB. SSE: 100
clients ≈7MB/client, broadcast ≈6.8s at 5.5k orders (the full-snapshot scale wall).
Bottlenecks = unpaginated list + full-snapshot SSE (both contract-versioned work — see [OPEN_ITEMS.md](OPEN_ITEMS.md)).

## CODE COMPLETE (verified in-repo)
Domain rules, OrderGateway contract + both adapters, authoritative `orderService` (CAS, tenant), auth+HMAC + **credential issuer** (`/auth/*`: scrypt, access+refresh, rotation/reuse-detection — Build 18), **client integration** (env-selected gateway + `authClient` — Build 20), **mobile auth UX** (login/register/logout + route gate + expo-secure-store — Build 21) across **all three apps** (worker on the gateway — Build 22), Fastify server (routes/SSE/metrics/migrations/graceful-shutdown), Docker image + compose. Proven on real Postgres 16 + real HTTP + real docker signals + a real end-to-end app journey (`test:e2e`).

## Notification delivery (Build 26)
Capability tokens (invite / password-reset) leave through one seam — `NotificationPort`
(`packages/api/notificationPort.ts`). `consoleNotificationPort` (token-free structured logs)
is wired in prod bootstrap today; swap in an SMTP/SES/SendGrid impl (same interface) for real
email. Delivery is best-effort + isolated; tokens/hashes are never logged.

## Instant access revocation (Build 29)
Access validation stays stateless (HMAC-only, zero DB on the hot path); a single O(1)
`RevocationIndex` (`packages/api/revocation.ts`) closes the ≤15-min post-revocation window:
disable/delete/reset/theft revoke every live session's `sid` (access tokens carry `sid`) +
a strictly-before-`iat` user entry; logout/session-revoke kill exactly one device. Boot
seeds the index from durable state (restart-safe). Same generic 401 (no revocation oracle).
Single-instance like the rate limiter. **Open SSE streams are also cut on revocation (Build 30):**
`/orders/stream` re-checks the index each heartbeat (`SSE_HEARTBEAT_SEC`, default 15s = max cut
latency). Residual: sid-less dev tokens have a ≤1s window; multi-instance needs a shared index.

## Retention / GC (Build 28)
`AuthService.purgeExpired()` hard-deletes auth rows past `expires_at` (sessions / invitations /
password-resets — `auth_sessions` grows one row per refresh). Scheduled from the bootstrap
(`AUTH_PURGE_INTERVAL_SEC`, default 1h; 0 = disabled). Safe (past-expiry tokens can't validate);
never touches live rows; `audit_log` is exempt (compliance). No migration, no contract change.

## Accountability / audit (Build 27)
Every privileged owner/account-lifecycle action emits an `AuditPort` event (`packages/api/auditPort.ts`)
persisted to `audit_log` (migration v9) by `pgAuditPort`; owner/admin read the tenant-scoped trail
via `GET /auth/audit`. Best-effort + isolated (never fails the auth op). Events carry NO secrets
(no token/hash/password column — schema-enforced). A SIEM/log-shipper is just another `AuditPort` impl.

## INFRASTRUCTURE PENDING (external — not repo defects)
- TLS / DNS / hosting; reverse proxy + `TRUST_PROXY=1` (real client IP); managed Postgres.
- Secrets manager (real `AUTH_SECRET`). Token **issuer is in-repo** (Build 18, `/auth/*`); external SMS/OAuth issuers optional later.
- Stripe + email provider credentials; monitoring stack scraping `/metrics`.
- k8s: `terminationGracePeriodSeconds` > `SHUTDOWN_DRAIN_MS`, preStop, readiness probe wired to `/health/ready`.
- Multi-instance: shared rate-limit store + Postgres `LISTEN/NOTIFY` for SSE fan-out.

## Deployment checklist
- [ ] `docker compose up --build` → healthy (verified locally; needs a host)
- [ ] real `AUTH_SECRET` (≥16), `NODE_ENV=production`, `AUTH_DEV_MODE=0`, valid `SHUTDOWN_DRAIN_MS`, `AUTH_ACCESS_TTL_SEC` < `AUTH_REFRESH_TTL_SEC`
- [ ] managed `DATABASE_URL`; migrations run automatically at boot (advisory-locked, idempotent)
- [ ] TLS/proxy + `TRUST_PROXY=1`; wire `/health/ready` probe
- [ ] secrets (`AUTH_SECRET`); Stripe/email creds; scrape `/metrics` (issuer `/auth/*` ships in-repo)

## Verdict
**Approved for a single-instance, reverse-proxied pilot** (real Postgres, real secret, TRUST_PROXY). **Not yet** for multi-instance horizontal scale (SSE fan-out, shared rate-limit) or large-tenant read fan-out (needs a contract-versioned pagination/delta — see [OPEN_ITEMS.md](OPEN_ITEMS.md)). No in-repo code or packaging blocker remains.

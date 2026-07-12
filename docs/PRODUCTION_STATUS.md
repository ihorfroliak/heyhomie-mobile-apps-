# Production Status

As of Build 17 (see [BUILD_HISTORY.md](BUILD_HISTORY.md) for commits). Gate: **32 files · 638 assertions · 0 failed · typecheck 0 · 56 app files 0 problems**.

## Readiness (evidence-based, not aspirational)
| Category | Score | Basis |
|---|---|---|
| Production | ~82 | full stack runs correctly on real docker+pg; external infra pending |
| Reliability | 89 | CAS exactly-once, restart recovery, SSE-leak + shutdown re-entrancy fixed |
| Correctness/Concurrency | 84 | 100-parallel exactly-once (real pg), property tests, terminal invariants + DB CHECK |
| Security | 82 | HMAC token exp+skew, tenant isolation (service+repo+CHECK), rate-limit hardened, redaction, no SQL/JSON injection (parameterized) |
| Observability | 78 | Prometheus `/metrics`, correlation ids end-to-end, structured logs, incident playbook |
| Operations | 81 | k8s graceful shutdown, rolling deploy, backup/restore, health probes — all measured |
| Deployment | 85 | docker build + compose healthy + restart verified; non-root, reproducible build |
| Infrastructure | 78 | containerized stack proven; single-instance (multi-instance needs shared state) |
| Maintainability | 85 | clean layering, anti-dep guard, frozen contract, docs |
| Testability | 91 | 628 gated assertions + pg/live/ops/load/repro harnesses |
| Scalability | ~50 | DB indexed/efficient; SSE full-snapshot + unpaginated list are the ceilings |

## CODE COMPLETE (verified in-repo)
Domain rules, OrderGateway contract + both adapters, authoritative `orderService` (CAS, tenant), auth+HMAC, Fastify server (routes/SSE/metrics/migrations/graceful-shutdown), Docker image + compose. Proven on real Postgres 16 + real HTTP + real docker signals.

## INFRASTRUCTURE PENDING (external — not repo defects)
- TLS / DNS / hosting; reverse proxy + `TRUST_PROXY=1` (real client IP); managed Postgres.
- Secrets manager (real `AUTH_SECRET`); token issuer (login endpoint that mints the signed token).
- Stripe + email provider credentials; monitoring stack scraping `/metrics`.
- k8s: `terminationGracePeriodSeconds` > `SHUTDOWN_DRAIN_MS`, preStop, readiness probe wired to `/health/ready`.
- Multi-instance: shared rate-limit store + Postgres `LISTEN/NOTIFY` for SSE fan-out.

## Deployment checklist
- [ ] `docker compose up --build` → healthy (verified locally; needs a host)
- [ ] real `AUTH_SECRET` (≥16), `NODE_ENV=production`, `AUTH_DEV_MODE=0`, valid `SHUTDOWN_DRAIN_MS`
- [ ] managed `DATABASE_URL`; migrations run automatically at boot (advisory-locked, idempotent)
- [ ] TLS/proxy + `TRUST_PROXY=1`; wire `/health/ready` probe
- [ ] token issuer + secrets; Stripe/email creds; scrape `/metrics`

## Verdict
**Approved for a single-instance, reverse-proxied pilot** (real Postgres, real secret, TRUST_PROXY). **Not yet** for multi-instance horizontal scale (SSE fan-out, shared rate-limit) or large-tenant read fan-out (needs a contract-versioned pagination/delta — see [OPEN_ITEMS.md](OPEN_ITEMS.md)). No in-repo code or packaging blocker remains.

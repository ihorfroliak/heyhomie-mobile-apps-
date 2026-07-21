# Build History — index

Slim chronological index of every Build (newest first). **Full per-Build detail**
(what shipped + every defect found/fixed) lives in
[archive/builds/BUILD_LEDGER_DETAIL.md](archive/builds/BUILD_LEDGER_DETAIL.md).
Durable standards → [PROJECT_STATE.md](PROJECT_STATE.md); open work → [OPEN_ITEMS.md](OPEN_ITEMS.md).

Recurring lesson across every Build: **execution finds bugs static review misses** —
every "verified" Build surfaced ≥1 real defect only reproducible by running.

| Build | Title | Commit | Key decision |
|---|---|---|---|
| 30 | SSE stream revocation | `4142a2a` | open `/orders/stream` re-checks `RevocationIndex` each heartbeat (extends std #10) |
| 29 | instant access-token revocation | `4bf1fbf` | O(1) in-memory `RevocationIndex` + `sid` claim + boot seeding (std #10) |
| 28 | auth data retention (GC) | `c7df15e` | `purgeExpired()` sweep — bounded auth tables (std #9) |
| 27 | audit trail | `2d3c2e7` | `AuditPort` accountability seam + migration v9 `audit_log` (std #8) |
| 26 | NotificationPort | `5f27736` | one delivery seam for invite/reset tokens (std #7) |
| 25 | account disable/enable/delete | `26826bf` | owner lifecycle + `ownerTarget` resolver; migration v8 |
| 24 | auth operations | `8928dfe` | invitation mgmt + password reset + session mgmt; migration v7 |
| 23 | member invites & per-user accounts | `8bda9be` | one tenant → many users; roles; migration v6 |
| 22 | worker backend integration | `2546230` | worker off mock onto `orderGateway` |
| 21 | mobile production readiness | `8152720` | auth UX + route gate + expo-secure-store |
| 20 | end-to-end integration (Local→HTTP) | `ff444c4` | env-selected gateway + `authClient`; `test:e2e` |
| 19 | CI & production hardening | `c0fb69c` | full CI pipeline (`checks` ‖ `postgres`) + `verify:full` |
| 18 | production auth foundation | `678321e` | `makeAuthService` issuer (scrypt + access/refresh); migration v5 |
| 17 | idempotent create | `6ba3432` | content-hash Idempotency-Key |
| 16 | validate external review | `a777d78` | reproduced 10 findings, fixed the real ones |
| 15 | independent audit | `d30556b` | metrics cardinality DoS · active_requests drift · limiter leak |
| 14 | ops readiness | `2c8359d` | k8s graceful shutdown (readiness-flip→drain) |
| 13 | load/perf | `821c9d2` | SSE crash under load fixed (`reply.hijack`) |
| 12 | hardening H1–H5 | `1cc0ccb` | trustProxy, tuned pg pool, non-root, versioned migrations |
| 11b | docker verified | `480cf45` | compose up + build on real pg |
| 11 | pg proof | `e45cf44` | real Postgres 16 (CAS, CHECK, 100-parallel, migrations) |
| 10 | live validation | `8e0686d` | real Fastify on socket |
| 09 | verification | `bf933ed` | stress/reconnect-storm/churn |
| 06 | hardening suite | `562b68f`… | observability · security · data-integrity CAS · errors · gateway resilience · infra |
| 03A–05 | the spine (pre-tag) | — | OrderGateway inversion (frozen contract) + Http/Fastify/pg + auth/tenant |
| 01 / base | scaffold | `6d5b26f`… | store seam · 3-app scaffold + domain + UI kit + GDPR |

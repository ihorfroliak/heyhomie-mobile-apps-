# Build History

Compact ledger of every build: what shipped + real defects found/fixed. Newest
first. This is the canonical history; [INDEX.md](INDEX.md) links here instead of
inlining it.

| Commit | Build | Shipped | Defects found+fixed (by execution) |
|---|---|---|---|
| _(this)_ | 17 — idempotent create | content-hash `Idempotency-Key` (port auto-sends) + server TTL dedup by (tenant,key) → no duplicate booking on retry/double-tap; no contract change | — (feature; gate 638, live 28/28) |
| `a777d78` | 16 — validate external review | Reproduced 10 review findings first (`test:repro`), fixed the real ones | C1 SSE disconnect-mid-send leak (cleanup before await); C2 SHUTDOWN_DRAIN_MS→0 (strict parse, fail-fast); C3 double-SIGTERM→exit1 (guard); C4 clock-rollback 429 (clamp); C5 idle-evict full-burst (effective idle window); C7 O(n) sweep/req (throttled). C6/C8/C9 verified by-design |
| `45428db` | deps hygiene | removed unused `@heyhomie/domain` from server; declared `@heyhomie/analytics` client dep (was hoisting-only) | — |
| `d30556b` | 15 — independent audit | fresh-eyes review | metrics label cardinality DoS (unmatched routes); active_requests negative drift (stamp+guard); rate-limiter drained-bucket leak (idle-only evict) |
| `2c8359d` | 14 — ops readiness | k8s graceful shutdown (readiness-flip→drain→bounded close + SSE teardown), rolling-deploy/soak/backup-restore harness | shutdown dropped in-flight OR hung on SSE → readiness-flip pattern; `npx tsx` PID-1 → SIGTERM killed drain (→ `node --import tsx`) |
| `821c9d2` | 13 — load/perf | load harness, EXPLAIN, failure injection | SSE crash under load (`reply.hijack` + guarded writes + headersSent guard) |
| `1cc0ccb` | 12 — hardening H1–H5 | trustProxy, tuned pg pool (statement_timeout), non-root container, versioned migrations, `npm ci` (image 599→366MB) | migration CREATE-TABLE race (moved inside advisory lock) |
| `480cf45` | 11b — docker verified | compose up + build PASS on real pg | compose `AUTH_DEV_MODE=1` vs prod image → crash-loop (→0); healthcheck `localhost`→IPv6 false-unhealthy (→127.0.0.1) |
| `e45cf44` | 11 — pg proof | real Postgres 16/16→25/25 (CAS, DB CHECK, 100-parallel, tenant SQL, migration idempotency) | — |
| `8e0686d` | 10 — live validation | real Fastify on socket, 23/23 | workspace pkgs missing `"type":"module"` (barrel import broke); transport-4xx→500 (`toCanonical`); SSE-safe shutdown |
| `bf933ed` | 09 — verification | stress/reconnect-storm/churn; removed dead exports | fakeBackend dangling service subscription |
| `562b68f` | 06 — observability | Prometheus `/metrics` (zero-dep), correlation ids, structured logs, telemetry | — |
| `66c1616` | 06 — security | token exp+skew, input validation, per-IP rate limit, canonical 401, redaction, bodyLimit | health-probe auth-skip |
| `0af95f9` | 06 — data integrity | optimistic version CAS + idempotent retry + terminal invariants + DB CHECK, 100-parallel/property tests | `dr-${Date.now()}` id collision (→ `uid()`) |
| `d6c6ee1` | 06 — errors | canonical `AppError` hierarchy, no raw leak | — |
| `bb3009f` | 06 — gateway reliability | timeouts, bounded retry+backoff+jitter+budget, dedupe, self-healing SSE | — |
| `9ca3f9a` | 06 — infra | fail-fast config, health probes, graceful shutdown, Docker+compose | — |
| — | 03A–05 (pre-tag) | OrderGateway inversion (frozen contract, store hidden, anti-dep guard); Http adapter + Fastify/pg server; auth + tenant isolation (orthogonal) | `dr-${Date.now()}` collision |
| — | 01 | store persistence seam (`KeyValueStore`) | — |
| `6d5b26f`… | base | 3-app scaffold, domain, mock api, UI kit, GDPR | — |

Pattern across all builds: **execution finds bugs static review misses** — every "verified" build surfaced ≥1 real defect only reproducible by running (signals, concurrency, docker, live HTTP). Full per-build detail in [INDEX.md](INDEX.md) build-log and the git commit bodies.

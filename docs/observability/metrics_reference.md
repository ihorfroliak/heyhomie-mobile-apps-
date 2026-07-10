# Metrics Reference

Source: `server/src/metrics.ts` (registry: `packages/api/metrics.ts`). Exposed at
`GET /metrics`, Prometheus text format, public (safe: no ids/PII/secrets).

| Metric | Type | Labels | Purpose | Expected | Alert hint |
|---|---|---|---|---|---|
| `http_requests_total` | counter | method, route, status | traffic + status mix | grows | 5xx ratio > 1% for 5m |
| `http_request_duration_seconds` | histogram | method, route | latency SLO | p99 < 0.5s | p99 > 1s for 5m |
| `active_requests` | gauge | — | in-flight load / stuck requests | ~0–20 | sustained growth = leak/stall |
| `order_mutations_total` | counter | op, applied | business ops (create/confirm/cancel/complete/settle/markPaid); `applied="false"` = idempotent no-op | grows with usage | settle applied=true stalls at 0 while creates grow → settlement broken |
| `repository_conflicts_total` | counter | — | optimistic-CAS retries (contention) | near 0 | spike = hot-row contention |
| `errors_total` | counter | code, status, retryable | canonical error mix | low | any INTERNAL_ERROR |
| `auth_failures_total` | counter | — | 401s (bad/expired tokens, probes) | low noise | spike = attack or broken client clock |
| `tenant_forbidden_total` | counter | — | cross-tenant denials | ~0 | ANY sustained growth = probing/bug |
| `sse_connections_active` | gauge | — | open change-feed connections | ≈ active app sessions | 0 while users active = stream broken |

Gateway-side events (`retry`/`timeout`/`sse_reconnect`) surface through
`httpOrderPort onTelemetry` — wire to a client metrics sink when apps ship; on the
server they're visible indirectly via repeated correlationIds + 5xx counts.

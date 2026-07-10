# Incident Response — 03:00 playbook

No debugger. Logs + metrics + health only.

## 1. Is it alive?
```
GET /health/live    → down? process crashed → check last shutdown/startup logs, restart
GET /health/ready   → {db:"down"}? → Postgres is the incident (connectivity/creds/disk)
```

## 2. What's failing?
```
GET /metrics
  errors_total{code=...}        which canonical error dominates
  http_requests_total{status}   5xx ratio
  auth_failures_total           spike → clock skew (token exp) or attack
  tenant_forbidden_total        >0 sustained → probing or client bug — check logs per tenant
  repository_conflicts_total    spike → hot-row contention (expected small)
  sse_connections_active        0 with active users → stream broken (proxy buffering?)
  active_requests               climbing, not returning → stalled dependency
```

## 3. Which request?
User report / client error body → `requestId` → grep logs `reqId == <id>` → the
full story (all retries share the id): route, tenant, duration, errorCode, err.

## 4. Which order?
`request_completed` for the mutation route + `order_mutations_total{op,applied}`.
`applied="false"` storms = clients retrying an already-terminal order (benign).

## 5. Common signatures
| Symptom | Likely cause | Check |
|---|---|---|
| 401 spike, `token expired` | client clock / TTL too short | auth_failures_total + errorCode UNAUTHENTICATED |
| 429s | rate limit hit (attack or hot client) | errors_total{code=RATE_LIMITED} per time |
| 503 SERVICE_UNAVAILABLE | db down mid-request | /health/ready |
| CONFLICT storms | pathological contention on one order | repository_conflicts_total + reqId trace |
| orders created but never paid | settlement not firing | order_mutations_total{op="settle",applied="true"} flat |

## 6. Escalation data to attach
correlationId(s), time window, `/metrics` snapshot, `request_error` lines, startup
version/gitCommit from `startup_complete`.

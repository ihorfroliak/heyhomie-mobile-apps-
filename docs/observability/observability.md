# Observability

Goal: a stranger diagnoses a 03:00 incident with logs + metrics + correlation ids
only — no debugger. No OpenTelemetry/Grafana/Jaeger (Build 06 constraint): pino
structured logs + a zero-dep Prometheus registry.

## What exists

| Signal | Where | Notes |
|---|---|---|
| Structured JSON logs | Fastify/pino, `server/src/index.ts` | every request → `request_completed` line: correlationId, tenantId, route, method, statusCode, duration_ms; errors → `request_error` with errorCode/retryable; SSE connect/disconnect lines |
| Correlation ids | gateway → server → logs → response | see [correlation_flow.md](correlation_flow.md) |
| Metrics | `GET /metrics` (Prometheus text) | see [metrics_reference.md](metrics_reference.md) |
| Mutation telemetry | `orderService` `ServiceTelemetry` → counters | op, applied vs no-op, CAS conflict retries, tenant |
| Gateway telemetry | `httpOrderPort onTelemetry` | retry / timeout / sse_reconnect events |
| Startup diagnostics | `startup_complete` log (once) | version, git commit, env, port, db status, devMode, bootDuration_ms — no secrets |
| Shutdown diagnostics | `shutdown_started` / `shutdown_complete` | duration measured |
| Health | `/health/live`, `/health/ready` (+`/healthz`) | public, never rate-limited, safe info only |

## Redaction / safety
`authorization`, `x-dev-*` headers redacted; canonical errors hide cause/stack;
/metrics carries counts+latencies only (no ids, no PII). Residual: SSE token in
query string may reach access logs (bounded by 15-min TTL — documented in
security docs).

## The 03:00 answers
What/when/who: `request_error` log → errorCode + correlationId + tenantId + time.
Which request: grep the correlationId (all retries of one call share it).
Which order/transition: `order_mutations_total{op,applied}` + service logs.
Which dependency: `/health/ready` (db), `errors_total{code}` (SERVICE_UNAVAILABLE…).
How long: duration_ms in logs, `http_request_duration_seconds` histogram.
Incident playbook: [incident_response.md](incident_response.md).

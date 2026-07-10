# Logging Reference

Pino JSON via Fastify. Every line: `time`, `level`, `reqId` (= correlationId).
Redacted always: `authorization`, `x-dev-user`, `x-dev-tenant`. Never logged:
tokens, secrets, payment details.

| Event (`msg`) | When | Fields |
|---|---|---|
| `request_completed` | every response | correlationId, tenantId, route, method, statusCode, duration_ms |
| `request_error` | any thrown error | + err, errorCode, statusCode, retryable |
| `sse_connected` / `sse_disconnected` | change-feed open/close | correlationId, tenantId |
| `startup_complete` | once at boot | version, gitCommit, environment, port, db, devMode, bootDuration_ms |
| `shutdown_started` / `shutdown_complete` | SIGTERM/SIGINT | signal / shutdownDuration_ms |

Pre-logger exception: config validation failure prints to stderr (`[config] …`)
because the app/logger doesn't exist yet — intentional.

Known non-log `console.log`: `packages/api/notifyClient.ts` consoleSender — the
MOCK notification transport (replaced by a real email/SMS provider at deploy).
Not a server logging path.

Query recipes:
- one request end-to-end: filter `reqId == <correlationId>`
- one tenant's failures: `tenantId == X && msg == "request_error"`
- slow requests: `duration_ms > 1000`

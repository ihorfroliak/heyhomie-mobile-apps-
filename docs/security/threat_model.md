# Threat Model

Assets: order data, tenant isolation, `AUTH_SECRET`. Adversary: any external
client; assume 100 hostile parallel requests. STRIDE-lite over the real surface:

| Threat | Vector | Prob | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| Spoofing | forged/tampered token | med | high | HMAC + timing-safe verify | ✅ |
| Spoofing | header spoof `x-dev-*` | low | high | gated by `AUTH_DEV_MODE`, prod fail-fast | ✅ |
| Tampering | mutate another tenant's order | med | high | service tenant enforcement + version CAS | ✅ |
| Repudiation | — | — | — | request logs w/ requestId/tenantId (redacted) | ✅ (logs) |
| Info disclosure | error leaks stack/SQL/PII | med | high | canonical `AppError.toResponse` | ✅ |
| Info disclosure | token in logs | med | med | logger redaction | ✅ (query-token residual) |
| DoS | flood mutations / SSE / auth | high | med | per-IP rate limit + bodyLimit | ✅ (single-instance) |
| DoS | oversized/malformed body | med | med | `bodyLimit 64KB` + input validation | ✅ |
| Elevation | anon → protected op | med | high | auth preHandler on all routes | ✅ |
| Replay | resend captured request | med | low | short TTL + idempotent mutations | ✅ bounded (see [security_decisions](security_decisions.md)) |
| Lost update | concurrent writes | high | high | optimistic version CAS | ✅ (Build 06 data-integrity) |

**External blockers (INFRA PENDING):** TLS/HTTPS (transport), `trustProxy` for real
client IPs, shared-store rate limiting for multi-instance, secret manager for `AUTH_SECRET`.

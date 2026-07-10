# Security Model

Defense-in-depth over the existing (no-new-infra) architecture. Layers, outermost first:

```
client (hostile)
  │  TLS ....................................... INFRA PENDING (hosting)
  ▼
Fastify edge
  ├─ onRequest: per-IP rate limiter → 429 ......... in-memory (single-instance)
  ├─ bodyLimit 64KB → 413 ......................... DoS guard
  ├─ preHandler: authenticateRequest .............. HMAC verify + claim/expiry check → 401
  ▼
routes
  ├─ validateSubmitOrderInput → 400 ............... hostile body rejected
  ▼
orderService (authoritative)
  ├─ requireOwned / tenant-scoped repo → 403 ...... authorization + tenant isolation
  ├─ optimistic version CAS ....................... integrity under concurrency
  ▼
Postgres
  └─ tenant_id + version + CHECK constraints ...... invariants in the DB
  ▲
error path: every throw → canonical AppError.toResponse (no cause/stack/SQL/PII leak)
logs: requestId + tenantId, Authorization redacted
```

**Single source of truth for each security decision:** authentication in
`server/src/auth.ts` (+ pure `validateClaims`), authorization + tenancy in
`orderService`, error shaping in `errors.ts`. No decision is duplicated.

Docs: [trust_boundaries](trust_boundaries.md) · [threat_model](threat_model.md) ·
[authentication](authentication.md) · [authorization](authorization.md) ·
[security_decisions](security_decisions.md).

**Verification:** `security.test.ts` (24), `orderService.test.ts` (tenant, 16),
`errors.test.ts` (22), `concurrency.test.ts` (integrity). `npm run check` → 588
assertions green. Server HMAC/hook wiring is CODE COMPLETE; live TLS/proxy/secret-
manager = INFRASTRUCTURE PENDING.

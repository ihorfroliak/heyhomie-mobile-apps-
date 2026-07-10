# Trust Boundaries

Every external request is hostile until authenticated + validated. Boundaries and
where untrusted input is checked:

| Boundary | Untrusted input | Validation point | Failure mode | Residual risk |
|---|---|---|---|---|
| HTTP edge | body, headers, query, path | Fastify (`bodyLimit 64KB`), rate limiter (per-IP) | 413 / 429 | per-instance limiter (multi-instance needs shared store — INFRA PENDING) |
| Auth | `Authorization: Bearer`, `?token=` (SSE) | `verifyAuthToken` → HMAC + `validateClaims` (exp/skew) | 401 generic | SSE token in query may hit access logs — bounded by 15-min TTL |
| Authorization / tenancy | `tenantId` inside signed token | `orderService` (repo-scoped + `requireOwned`) | 403 / not-found | none known |
| Input | create body | `validateSubmitOrderInput` | 400 canonical | unknown fields dropped (not rejected) — acceptable |
| Repository | order id, version | tenant-scoped SQL + version CAS | ConflictError / empty | none known |
| Config / env | `AUTH_SECRET`, `DATABASE_URL`, `PORT` | `loadServerConfig` fail-fast | process won't boot | — |
| Error surface | any thrown error | canonical `AppError.toResponse` | no cause/stack/SQL leak | — |

**Trusted only:** server memory (secret, verified AuthContext). **Never trusted:**
anything a client can set — headers, body, query, token contents before HMAC check.

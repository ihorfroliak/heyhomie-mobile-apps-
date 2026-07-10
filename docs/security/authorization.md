# Authorization

**One authoritative place:** `orderService`. Every method takes an `AuthContext`;
reads are tenant-scoped at the repo, mutations are deny-by-default (`requireOwned`).
No endpoint, gateway or UI makes an authorization decision.

**Answers to the audit questions (evidence in tests):**

- *Can tenant A access tenant B?* No — repo `get/list/update` all filter by
  `tenant_id`; cross-tenant read → `undefined`, cross-tenant mutate → `FORBIDDEN_TENANT_ACCESS` (403). Proven: `orderService.test.ts`.
- *Can authorization leak resource existence?* No — a cross-tenant / missing id yields
  the SAME `403` for mutations (deny-by-default, no "exists but not yours" vs "not found" distinction).
- *Can anonymous reach protected code?* No — the `authenticateRequest` preHandler runs
  before every non-public route; missing/invalid token → 401 before the handler.
- *Alternate routes?* All order routes are registered under the same auth hook; SSE
  `/orders/stream` authenticates via `?token=` through the same verifier.
- *Role model:* `admin` | `member` only. (No role-gated order op today — tenancy is the
  boundary that matters; role is carried for future use, not a bypass.)

**Residual:** `req.ip` for rate limiting assumes a trusted proxy header config in
production (`trustProxy`) — INFRA PENDING.

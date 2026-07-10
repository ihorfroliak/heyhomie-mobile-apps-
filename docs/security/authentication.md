# Authentication

**Scheme:** opaque bearer token = `base64url(claims) . HMAC-SHA256(body, AUTH_SECRET)`.
Not JWT (no `alg` field → no algorithm-confusion / `alg:none` attack surface).

**Verification order (`server/src/auth.ts` → `packages/api` `validateClaims`):**
1. Split on first `.`; recompute HMAC; `crypto.timingSafeEqual` (constant-time — no signature timing oracle).
2. Parse claims; `validateClaims`: shape (userId/tenantId non-empty, role ∈ {admin,member}), `iat`/`exp` numbers, `exp > iat`.
3. Expiry with clock-skew tolerance (default 60s): reject expired AND future-dated.
4. ANY failure → `null` → generic **401** (reason never leaks).

**No auth decision depends on client-controlled data** except the token, and the
token is only trusted AFTER the HMAC check.

**Dev fallback:** `x-dev-*` headers + `/dev/token` only when `AUTH_DEV_MODE=1`;
`loadServerConfig` **hard-fails** if that flag is set with `NODE_ENV=production`.

| Threat | Root cause | Mitigation | Residual | Verification |
|---|---|---|---|---|
| Stolen token = permanent access | no expiry (was) | `iat`/`exp`, 15-min TTL, skew check | replay ≤ TTL (see [security_decisions](security_decisions.md)) | `security.test.ts` expired/future/skew |
| Forged token | — | HMAC signature, timing-safe compare | secret must stay server-side | test: tampered payload → null |
| Dev bypass in prod | dev headers | config fail-fast on prod+devMode | — | `serverConfig.test.ts` |

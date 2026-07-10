# Security Decisions

Deliberate choices + why (no security theater).

## Replay protection = TTL + idempotency (NOT a nonce cache)

- A bearer token over TLS is replayable by design within its validity. We bound the
  window with a **15-min TTL** (`DEFAULT_TTL_SEC`), and every state-changing operation
  is **idempotent** (confirm/cancel/settle/markPaid — Build 06 data-integrity), so a
  replayed mutation produces **no duplicate side-effect** (a replayed settle on a paid
  order is a no-op).
- We deliberately did **not** add a `jti` nonce cache: in-memory it's per-instance
  (trivially bypassed with >1 instance) and a shared store is out of the no-Redis
  constraint → it would be theater. TTL + idempotency is the honest, sufficient control.
- **Residual:** replay within the TTL window can re-read data (bounded by TLS + TTL).
  Full nonce/one-time-use needs a shared store — INFRA PENDING, documented.

## Rate limiting = in-memory per-IP token bucket

- Deterministic (capacity 120, refill 20/s), graceful (429, no crash), sheds
  unauthenticated floods before auth work. **Single-instance** — multi-instance fair
  limiting needs a shared store (INFRA PENDING). `req.ip` needs `trustProxy` in prod.

## Not JWT

- Custom HMAC envelope avoids the JWT `alg` foot-guns; no library, no `alg:none`.

## Dev bypass

- `x-dev-*` + `/dev/token` exist for local smoke tests, hard-disabled in production by
  `loadServerConfig` (fail-fast). Not a prod code path.

## Secret handling

- `AUTH_SECRET` only in server memory + config; redacted from logs; never in responses,
  metrics or errors. Real secret manager = INFRA PENDING.

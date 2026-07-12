# Open Items

Single source for "what's left" (latest build → [BUILD_HISTORY.md](BUILD_HISTORY.md)).
Grouped by whether it's a future code change, an intentional trade-off, or external infra.

## Future code work (needs a new build; contract-versioned where noted)
1. **Pagination on `GET /orders` + SSE delta frames** — the measured scale ceiling
   (Build 13: list p50 1151ms @conc50 vs 2ms DB; SSE ~7MB/client at 5.5k orders).
   Both change the `Order[]`-snapshot contract → require an `OrderGateway` version bump.
2. ~~**Idempotency-Key on `create`**~~ — **DONE (Build 17).** Port auto-derives a
   content-hash `Idempotency-Key`; server dedups create by `(tenantId, key)` in a
   10-min TTL store → identical retry/double-tap returns the same order. Additive,
   no contract change. (`packages/api/idempotency.ts`, `server/src/routes.ts`.)
3. **Auth: additional issuers + lifecycle** (foundation shipped Build 18 —
   email+password, access+refresh, rotation/reuse-detection). Future: SMS-OTP /
   OAuth issuers (behind the same token-mint seam), **member invites** (non-admin
   users within a tenant — self-register only creates a tenant-owning admin today),
   password reset, and a periodic GC for expired/revoked `auth_sessions` rows
   (kept for reuse-detection; unbounded without a sweep).
4. **Real payment/notification transport** — `notifyClient` is a console mock; Stripe
   + Fakturownia + email/SMS adapters are seams (`accountingClient`/`marketingClient`
   are mock/legacy). Wire when credentials exist.
5. **Prune legacy seam** — `packages/api/{config,homieClient,accountingClient,marketingClient}.ts`
   + root `.env.example` reference the pre-Build-04 Rails/Go backends. Inert but stale;
   delete when confirmed unused by any screen.
6. **Fold `toCanonical` into `errors.ts`** — the 4xx-transport→canonical mapping lives
   in `server/src/app.ts`; `fromUnknown` (shared) still wraps a 4xx throwable as 500.
   Latent (single caller today) — fix when a 2nd boundary calls `fromUnknown`.

## Intentional trade-offs (verified, NOT defects — do not "fix" without a reason)
- **SSE fan-out** (N `list()` per mutation): documented scalability limit, no
  correctness impact — frames are whole, ordering staleness bounded. (review C6)
- **SSE absent from `http_requests_total`**: by design — hijacked replies bypass
  `onResponse`; `sse_connections` gauge is the correct signal. (review C9)
- **Local adapter is the active binding** (`orderGateway = localOrderGateway`): apps
  run offline; flip to `httpOrderGateway` only when a server is deployed.
- **Full-snapshot SSE / single-instance rate-limit**: correct at pilot scale;
  horizontal scale needs `LISTEN/NOTIFY` + shared limiter store.
- **`tsx` runtime in the image** (no precompile): 61ms boot — fine for MVP.

## External infrastructure (see [PRODUCTION_STATUS.md](PRODUCTION_STATUS.md))
TLS/DNS/host · managed Postgres · secrets manager · Stripe/email creds · monitoring ·
k8s probe/preStop wiring · shared state for multi-instance. (Token **issuer** now
in-repo — Build 18; a real `AUTH_SECRET` from the secrets manager is still external.)

## Known build-gate gaps (repo hygiene)
- **`server/` is not in the typecheck gate.** `tsc -p server/tsconfig.json` has 3
  pre-existing errors in the `mutate` helper (`routes.ts`) — a route-generic typing
  issue, not a runtime defect (tsx strips types; behaviour proven by `test:live`/`test:pg`).
  Add `server/` typecheck + `test:pg`/`test:live` to CI, then fix the 3 errors.

## Legacy docs to reconcile (repo hygiene)
Root `ARCHITECTURE.md` + `INTEGRATION.md` describe the pre-Build-04 external
Rails/Go backend vision (superseded by the own `server/`) and now carry a
"superseded → see docs/INDEX.md" banner. `ACCOUNTING.md`, `MARKETING.md`,
`SECURITY.md` also predate Build 04 but cover domain/policy notes still partly
valid — review and delete/rewrite when convenient.

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
3. **Auth: additional issuers + lifecycle** (foundation Build 18, client wiring
   Build 20, mobile UX + encrypted storage Build 21, worker backend integration
   Build 22 — all three apps now authenticate + consume the gateway). Future:
   SMS-OTP / OAuth issuers; **member invites** (self-register only makes a
   tenant-owning admin, so worker/admin log in as the tenant account today — invites
   give per-person accounts); password reset; periodic GC for expired/revoked
   `auth_sessions` rows; a reactive auth-state store if screens ever need to observe
   login/logout live (today the gates navigate imperatively, mirroring the consent gate).
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
- **Gateway binding is env-selected** (Build 20): `EXPO_PUBLIC_ORDERS_API_URL` set →
  `httpOrderGateway`; unset → Local (offline default). Both proven; the default stays
  Local so apps run offline until a server is deployed.
- **Full-snapshot SSE / single-instance rate-limit**: correct at pilot scale;
  horizontal scale needs `LISTEN/NOTIFY` + shared limiter store.
- **`tsx` runtime in the image** (no precompile): 61ms boot — fine for MVP.
- **Worker demo dashboard** (Build 22): the jobs flow (`(tabs)/missions` + `job/[id]`)
  is live on the gateway; the secondary dashboard tabs (`index`/`earnings`/`schedule`
  + the old `mission/[id]`) still render demo `Mission` data. Migrate to gateway/domain
  data when those views become production surfaces — not a defect (informational tiles).
- **httpOrderGateway in-memory cache survives logout** until app restart or the next
  SSE snapshot (Build 21 security review). NOT rendered on the auth screens and NOT a
  cross-tenant leak (a same-device re-login gets a fresh tenant snapshot; a tokenless
  reconnect just 401s). Clearing it would need an OrderGateway method (frozen) → left
  as-is; recommend a full reload on logout if ever surfaced.

## External infrastructure (see [PRODUCTION_STATUS.md](PRODUCTION_STATUS.md))
TLS/DNS/host · managed Postgres · secrets manager · Stripe/email creds · monitoring ·
k8s probe/preStop wiring · shared state for multi-instance. (Token **issuer** now
in-repo — Build 18; a real `AUTH_SECRET` from the secrets manager is still external.)

## Build gate / CI (closed Build 19)
CI runs the full pipeline: `checks` job (gate + `typecheck:server` + `test:live`)
+ a `postgres` service job (`test:pg` + `test:ops`) on real pg 16, via locked
`npm ci`. `server/` typecheck is clean and gated (the 3 `mutate` route-generic
errors are fixed). `npm run verify:full` runs the whole pipeline locally (needs
Postgres on `PG_URL`). Not yet gated: `test:repro` (evidence tool), `load.ts`
(perf tool), and Docker image build (needs a runner with Docker).

## Legacy docs to reconcile (repo hygiene)
Root `ARCHITECTURE.md` + `INTEGRATION.md` describe the pre-Build-04 external
Rails/Go backend vision (superseded by the own `server/`) and now carry a
"superseded → see docs/INDEX.md" banner. `ACCOUNTING.md`, `MARKETING.md`,
`SECURITY.md` also predate Build 04 but cover domain/policy notes still partly
valid — review and delete/rewrite when convenient.

# Data Integrity — guarantees & evidence

Single authoritative writer, optimistic concurrency, DB-enforced invariants.
Everything here is backed by executable tests (`npm run check`).

## Guarantees

1. **Exactly one writer** for order state: `orderService`. UI cannot bypass it
   (barrel hides the store; `tools/check-apps.mjs` fails the build on a store import).
2. **No lost updates** — version CAS in `OrderRepo.update` ([race_conditions](race_conditions.md) RC-1).
3. **Idempotent mutations** — confirm/cancel/complete/settle/markPaid are safe to
   run any number of times ([concurrency_model](concurrency_model.md)).
4. **Tenant isolation** — every read/write scoped by `tenant_id`; cross-tenant read
   → not found, cross-tenant write → `FORBIDDEN_TENANT_ACCESS` (`orderService.test.ts`).
5. **Invariants enforced by the authoritative layer AND the DB** where money is
   involved ([state_invariants](state_invariants.md)); `orders_paid_not_canceled` CHECK.
6. **Constraints:** PK `orders.id`, `tenant_id NOT NULL` + index, `version NOT NULL`,
   `status` enum, the paid/canceled CHECK.

## Migration safety

Schema changes are additive + idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX
IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT`). See
`server/src/db.ts`. **Remaining risk (INFRA PENDING):** these run at boot via
`initSchema`; a proper versioned migration runner (up/down, applied-tracking) is the
next hardening step but requires a live DB to validate — deferred, documented.

## Evidence (tests)

- `concurrency.test.ts` — 100-parallel confirm/cancel/settle/markPaid, mixed race,
  terminal invariants, 200×10 property sweep (0 violations).
- `orderService.test.ts` — tenant isolation + auth propagation.
- `gateway.test.ts` — lifecycle idempotency on both adapters.

## Remaining external blockers

Live Postgres to exercise the pg CAS + CHECK under real parallelism (memory repo
models it here); versioned migration tooling. No further CODE blocker on integrity.

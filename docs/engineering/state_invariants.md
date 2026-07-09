# State Invariants

Enforced in the authoritative `orderService` transitions AND (where it matters for
money) by a DB CHECK — never only in the UI. All covered by
`packages/api/concurrency.test.ts`.

| # | Invariant | Enforcement |
|---|---|---|
| I1 | An order is never both `canceled` and `paid` | `cancelT` no-ops on a paid order; money transitions no-op on canceled; DB `CHECK orders_paid_not_canceled` |
| I2 | A paid payment ⟺ `paid` status | only `settle`/`markPaid` set both together |
| I3 | A paid order cannot be canceled (no un-pay; refund is a separate, unmodeled flow) | `cancelT` guard + I1's CHECK |
| I4 | A canceled order cannot become paid | `settleT`/`markPaidT`/`completeT` guard `status==='canceled' → no-op` |
| I5 | `complete` only from `awaiting_completion` | `completeT` guard |
| I6 | `version` is monotonic (strictly increases on each write) | CAS bumps `version = expected + 1` |
| I7 | An order id is globally unique; invisible/immutable to other tenants | PK + tenant-scoped repo (see [locking_strategy](locking_strategy.md)) |

**Not modeled here (would be new features, out of scope):** refunds, partial
payments, check-in/incident timelines, event↔booking referential chains. When
added, extend this table + the property test.

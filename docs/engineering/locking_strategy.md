# Locking Strategy

**Optimistic, not pessimistic.** Orders are low-contention per row; optimistic
concurrency avoids holding DB locks across the request and has no deadlock surface.

| Mechanism | Where | Why |
|---|---|---|
| Version compare-and-swap | `OrderRepo.update(next, expectedVersion)` — pg `UPDATE … WHERE version=$expected`, memory version check | Prevent lost updates; serialize competing writers on one order. |
| Bounded retry loop | `orderService.mutate` (`MAX_CAS_RETRIES=100`) | Resolve conflicts by re-read + re-apply; idempotent transitions converge. |
| Unique PK (`orders.id`) | Postgres primary key + memory `insert` guard | No duplicate order rows; `insert` on existing id → `ConflictError`. |
| Tenant scoping | every `get/update/list` carries `tenant_id` | Isolation is also part of the CAS `WHERE` — a write can't cross tenants. |
| CHECK constraint | `orders_paid_not_canceled` | DB rejects the illegal terminal state even if app code regresses. |

**No `FOR UPDATE` / `SKIP LOCKED`.** Not needed: there is no work-queue / outbox /
claim pattern in this repo. If one is added later (e.g. a settlement worker),
`SELECT … FOR UPDATE SKIP LOCKED` is the pattern to introduce then — not before.

**Deadlocks:** none possible — single-row CAS, no multi-row lock ordering.

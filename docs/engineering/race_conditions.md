# Race Conditions — findings & fixes

Scope: the authoritative write path (`orderService` → `OrderRepo`). Evidence-based
— only races reproducible in THIS repo. (No outbox / webhook worker / payout table
/ notification worker exist here; those examples in the brief are N/A.)

## RC-1 — Lost update on concurrent order mutation (FIXED)

- **Root cause:** `orderService` did read-modify-write (`get → transition → put`)
  with a last-writer-wins `put`. Two parallel mutations on one order (e.g. two
  `settle`, or `settle` racing `cancel`) both read the same state and both wrote →
  one update lost, or a double state transition (logical double-charge).
- **Why dangerous:** double payment capture, canceled-and-paid orders, inconsistent
  status. **Probability:** HIGH under real load (double-tap, client retries, admin +
  auto-settle at once). **Impact:** money + data corruption.
- **Fix (root cause):** optimistic concurrency. `ServerOrder.version` + repo
  `update(next, expectedVersion)` compare-and-swap (memory: version check; Postgres:
  `UPDATE … WHERE version = $expected RETURNING *`, 0 rows → `ConflictError`). The
  service retries on conflict; because transitions are idempotent, a loser re-reads
  the winner's state and becomes a no-op → **exactly-once effect**.
- **Verification:** `packages/api/concurrency.test.ts` — 100 parallel settle →
  exactly one write (version bumps once), 100 cancel → one, mixed cancel/settle ×50
  never yields canceled+paid, property sweep 200×10 random ops → 0 invariant breaks.
- **Regression risk:** LOW — contract unchanged, gateway + tenant tests green.

## Non-issues (audited, no race)

- **SSE reconnect** — client stream is full-snapshot + idempotent; reconnect just
  re-fetches current state. Heartbeat/reconnect covered by `httpPort.test.ts`.
- **Startup/shutdown** — single process; graceful shutdown drains then `pool.end()`.
- **Dedupe** — client coalesces concurrent same-key calls (`httpResilience.dedupe`).

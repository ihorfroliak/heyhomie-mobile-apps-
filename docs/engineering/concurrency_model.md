# Concurrency Model

**Assume every endpoint gets 100 parallel requests.** Correctness comes from one
rule: **all order state changes go through `orderService.mutate`**, an optimistic
read-modify-write loop over a compare-and-swap repo.

```
mutate(id, auth, transition):
  loop (≤100):
    cur  = requireOwned(repo.get(id, tenant))     # tenant-scoped read + deny cross-tenant
    next = transition(cur, now)                    # PURE — invariants live here
    if next === cur: return cur                    # idempotent no-op → no write
    try: return repo.update(next, cur.version)     # CAS: write iff still at cur.version
    catch ConflictError: continue                  # lost the race → re-read + re-apply
```

**Why it's correct under load:** exactly one writer wins each version; every loser
re-reads the winner's state, and since transitions are idempotent (a paid order's
`settle` is a no-op, a canceled order's `markPaid` is a no-op) it converges to
exactly-once effect. Proven: 100× settle → one charge; mixed cancel/settle → paid
XOR canceled, never both; 200×10 random sequences → 0 invariant violations.

**Idempotency classification**

| Command | Idempotent? | Notes |
|---|---|---|
| create | NO | new id each call; the HTTP gateway never auto-retries it |
| confirm | YES | ensures `confirmed`; re-run is a no-op |
| cancel | YES | terminal flag; no-op if already canceled or paid |
| complete | YES | only fires from `awaiting_completion`, then no-op |
| settle | YES | `due`→charge once; `paid`→no-op |
| markPaid | YES | `paid`→no-op |

**Client side:** `httpResilience.dedupe` coalesces concurrent same-key calls;
retries only hit idempotent ops; the SSE feed is full-snapshot (reconnect-safe).

Single process today; horizontal scale needs Postgres `LISTEN/NOTIFY` to fan the
change feed across instances (the CAS correctness already holds across instances).

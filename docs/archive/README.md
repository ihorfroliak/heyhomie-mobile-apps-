# docs/archive — historical engineering record

Persistent history, **kept out of active context**. Nothing here is deleted — it is
the full detail behind the concise active docs. Active development reads
[../PROJECT_MEMORY.md](../PROJECT_MEMORY.md) → [../PROJECT_STATE.md](../PROJECT_STATE.md)
→ [../OPEN_ITEMS.md](../OPEN_ITEMS.md); it consults this archive **only on demand** when
historical context for a specific past Build is needed.

## Structure
- `builds/BUILD_LEDGER_DETAIL.md` — the full per-Build engineering ledger (what shipped
  + every real defect found/fixed by execution, per Build). The active
  [../BUILD_HISTORY.md](../BUILD_HISTORY.md) is a slim index that links here.

## Rules (archival convention)
- **Preserve, don't delete.** History is append-only evidence.
- **Durable engineering standards live in [../PROJECT_STATE.md](../PROJECT_STATE.md)**, not
  here. This archive holds Build-specific narrative + defect records only.
- **Currently-open work lives in [../OPEN_ITEMS.md](../OPEN_ITEMS.md)**, not here. A closed
  issue stays here purely as historical evidence.
- Archive the **engineering record, not the chat log.** Test counts, decisions, hashes,
  regressions, trade-offs — yes. Conversation transcript — no.

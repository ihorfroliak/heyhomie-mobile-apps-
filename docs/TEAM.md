# AI Development Team

The permanent multi-agent workflow for heyhomie-apps. Definitions in
[.claude/agents/](../.claude/agents/). Design goal: **maximum confidence, minimum
tokens** — so 12 conventional roles are collapsed into **5 agents** (fewer agents =
fewer cold-start context reads = fewer tokens). Every agent reads `docs/INDEX.md`
first instead of re-scanning the tree.

## The 5 agents (and how the 12 requested roles map on)
| Agent | Absorbs | One-line responsibility |
|---|---|---|
| **architect** | Principal Architect | Plan + guard the frozen OrderGateway contract & layering. Read-only. |
| **engineer** | Backend + Frontend + Database (impl) | Smallest correct diff; reproduce bugs first. |
| **verifier** | Performance + Security + QA + Reliability + DB-integrity | Measured evidence + gated regression + real-infra harnesses. |
| **reviewer** | Code Reviewer + Technical-Debt Auditor | Independent pre-merge review (correctness + reuse/simplify/altitude). Read-only. |
| **scribe** | Documentation + Release | Sync docs, commit+push, deploy verification. |

Why collapsed: one frozen contract + one Fastify server + pure-TS packages + solo
cadence. Separate FE/BE/DB engineers would each re-derive the same context for a
change that touches one seam. Perf/security/QA/reliability share one muscle —
"run the real path, measure" (the `test:pg|ops|live|repro` harnesses) — so they are
one Verifier. Debt-audit is a review angle, not a separate pass.

## Execution order
```
architect ─► engineer ─► verifier ─► reviewer ─► scribe
 (plan)      (diff)      (evidence)   (independent)  (commit+push)
```
- **architect** runs first for multi-file / contract-adjacent / feature work; SKIP for typos, one-liners, docs.
- **reviewer** and **engineer** must be distinct instances (independence).
- **scribe** runs only on a green gate + no open CONFIRMED finding.

## Parallelizable stages (within an agent, not across the pipeline)
- reviewer: finder angles + verifiers run in parallel (the `/code-review` skill already does this).
- verifier: independent checks (security / perf / DB) can fan out to parallel subagents ONLY when the diff genuinely spans them; otherwise run inline (cheaper).
Do NOT parallelize the pipeline stages themselves — each consumes the previous stage's output.

## Merge strategy
Single `main`, no feature branches (solo repo). The "merge gate" is `npm run check`
(all files pass · 0 failed · typecheck 0) + a clean reviewer verdict. The scribe is
the only agent that commits/pushes. One change = one commit.

## Conflict resolution
- Engineer vs reviewer on a finding → reproduce it; a CONFIRMED correctness finding wins (must be fixed before scribe).
- Any proposal touching `orderContract.ts` → architect arbitrates; contract stability wins unless the user declares a new build/version.
- Verifier vs engineer on "is it a defect" → measured evidence decides; no evidence → not a defect (don't optimize speculation).

## Escalation rules (STOP → back to architect or user)
- A required OrderGateway contract change.
- A defect that cannot be reproduced (mark NOT REPRODUCIBLE, don't guess-fix).
- Gate red after a fix attempt, or an infra prerequisite masquerading as an app defect.
- Docker/Postgres unavailable for a change that needs live proof → mark INFRASTRUCTURE PENDING, don't fake PASS.

## Smallest workflows (pick the least that gives confidence)
| Change type | Pipeline |
|---|---|
| Typo / comment / doc | scribe only |
| One-file pure-logic fix (bug) | engineer (reproduce+fix+gate) → reviewer → scribe |
| Feature / multi-file / refactor | architect → engineer → verifier → reviewer → scribe |
| Server lifecycle / SSE / migration | architect → engineer → verifier (**test:pg/ops/live**) → reviewer → scribe |
| Perf concern | verifier (measure) → only if bottleneck: engineer → verifier → reviewer → scribe |

Default token discipline: skip architect when scope is obvious; skip verifier's infra
harness when the gate provably covers the diff; never spawn an agent whose role the
change doesn't touch.

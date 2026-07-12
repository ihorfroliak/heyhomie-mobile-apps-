# HeyHomie apps

Digital platform for a professional cleaning company — an npm-workspaces monorepo:
**three Expo/React-Native apps** (client, worker, admin) + **pure-TS packages** +
a **Fastify + PostgreSQL orders backend** (`server/`). Polish market (pl/en/uk).

> **📖 Canonical documentation entry point → [docs/INDEX.md](docs/INDEX.md).**
> It is the always-current map (file-by-file purpose, links to every doc, build
> ledger). Start there. AI sessions: see [CLAUDE.md](CLAUDE.md), which also routes
> to `docs/INDEX.md`.

## Architecture in one line
UI → **frozen `OrderGateway` contract** → Local adapter (offline) **or** Http
adapter → authoritative **`orderService`** (optimistic-CAS, tenant-enforced) →
repo (memory | Postgres). The contract is the only stable API surface; swapping
backends is a one-line binding change with no UI edits. Full detail:
[docs/INDEX.md](docs/INDEX.md) · [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md).

## Apps & packages
| Path | What |
|---|---|
| `apps/client` · `apps/worker` · `apps/admin` | Customer / cleaner / operator apps (Expo — iOS, Android, web) |
| `packages/domain` | Framework-free business rules (scheduling, payments, payouts, tips, validation) |
| `packages/api` | The OrderGateway contract + adapters + auth / rate-limit / errors / idempotency |
| `packages/ui` · `packages/design` · `packages/analytics` | Shared components · design tokens · tracker |
| `server/` | Fastify + Postgres backend implementing the OrderGateway HTTP contract |

## Quick start
```bash
npm run check          # THE gate: tests + typecheck + app/anti-dep guard (run before every commit)
npm run client | worker | admin        # run an Expo app
npm run server                         # backend (needs Postgres) — see server/README.md
docker compose up --build              # full stack (server + Postgres)

# infra-dependent tests (need Docker/Postgres; NOT in the gate):
npm run test:pg | test:ops | test:live | test:repro
```

## Where to go next
- Current status / next-session bootstrap → [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md)
- Readiness + deploy verdict → [docs/PRODUCTION_STATUS.md](docs/PRODUCTION_STATUS.md)
- What's left / trade-offs → [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md)
- Build ledger → [docs/BUILD_HISTORY.md](docs/BUILD_HISTORY.md)
- Team / workflow → [docs/TEAM.md](docs/TEAM.md)

_Legacy root docs (`ARCHITECTURE.md`, `INTEGRATION.md`, `ACCOUNTING.md`,
`MARKETING.md`, `SECURITY.md`) predate the current backend and are kept for
history only — each carries a LEGACY banner. The live docs are under `docs/`._

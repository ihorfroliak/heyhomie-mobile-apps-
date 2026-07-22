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

## Try it on your phone (5 min, no App Store)
1. Install **Expo Go** (App Store / Google Play).
2. `npm run client` (or `worker` / `admin`) → scan the QR with your phone.
3. The app opens live. With no backend it runs **offline on in-app demo data** —
   enough to click through the UI. For real data, point it at a running server:
   set `EXPO_PUBLIC_ORDERS_API_URL=http://<your-host>:8090` before starting.

## Seed test data (see real orders/accounts instead of demo mocks)
```bash
docker compose up -d db                 # or any Postgres 16 on PG_URL
PG_URL=postgres://postgres:postgres@localhost:5434/heyhomie npm run seed   # add --fresh to reset
```
Creates one business tenant + 3 logins (`owner@` / `admin@` / `worker@heyhomie.test`,
password `Password123!`) and a spread of orders (confirmed / paid / canceled).
Re-running appends more; `--fresh` wipes first. Then point the apps at the server
(`EXPO_PUBLIC_ORDERS_API_URL`) and log in with those accounts.

## Publish to the App Store / Google Play (EAS)
Each app has an `eas.json` (dev / preview / production profiles) and a `bundleIdentifier`
+ `package` (`pl.heyhomie.{client,admin,worker}`). To build & submit:
```bash
npm i -g eas-cli
eas login                                  # free Expo account
cd apps/client && eas init                 # links the app, writes extra.eas.projectId
eas build --platform all --profile production      # cloud-builds .ipa + .aab
eas submit --platform ios                  # → App Store Connect
eas submit --platform android              # → Google Play
```
Repeat per app (`apps/admin`, `apps/worker`). Set the backend URL for the build with
`eas secret:create --name EXPO_PUBLIC_ORDERS_API_URL --value https://api.heyhomie.pl`
(the profiles already read it). **Still needed (external, not code):** Apple Developer
account ($99/yr) + Google Play account ($25 once); app **icons & splash** (add
`assets/` + `expo.icon`/`expo.splash`); store screenshots; a **privacy policy** URL.

## Current state (2026-07) — honest snapshot
| Surface | Built | Live-backend wired | Notes |
|---|---|---|---|
| **Backend** (`server/`) | ✅ | ✅ | Fastify + pg; auth full lifecycle, orders, SSE. **796 gated tests + CI green.** |
| **Web** (`heyhomie-client`, separate repo) | ✅ | ✅ | SEO landing (JSON-LD, city/district internal linking). |
| **Client app** | ✅ | ✅ core loop | booking → activity + auth on the real server. |
| **Worker app** | ✅ | ⚠ partial | jobs + auth live; today/earnings/schedule still demo data. |
| **Admin app** (25 screens) | ✅ | ⚠ partial | members/invites/login live; the ops suite (finance/pipeline/…) still demo. |

**What's done in code but needs external accounts/keys (not wired yet):** hosting +
domain + TLS · **Stripe** payments · **email/SMS** delivery (the `NotificationPort`
seam is ready — a provider impl + creds is all that's left) · App Store / Google
Play publishing (needs `eas.json` + developer accounts). See
[docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md) and [docs/PRODUCTION_STATUS.md](docs/PRODUCTION_STATUS.md).

## Where to go next
- Current status / next-session bootstrap → [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md)
- Readiness + deploy verdict → [docs/PRODUCTION_STATUS.md](docs/PRODUCTION_STATUS.md)
- What's left / trade-offs → [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md)
- Build ledger → [docs/BUILD_HISTORY.md](docs/BUILD_HISTORY.md)
- Team / workflow → [docs/TEAM.md](docs/TEAM.md)

_Legacy root docs (`ARCHITECTURE.md`, `INTEGRATION.md`, `ACCOUNTING.md`,
`MARKETING.md`, `SECURITY.md`) predate the current backend and are kept for
history only — each carries a LEGACY banner. The live docs are under `docs/`._

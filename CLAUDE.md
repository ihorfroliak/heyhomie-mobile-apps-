# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md) first** — the compact entry point (current state, frozen boundaries, standards index, what's left, reading order). Then [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) (architecture + engineering standards) and [docs/INDEX.md](docs/INDEX.md) (file-by-file map). This file is the short orientation.

**Project memory rules** (the repo docs ARE the persistent memory):
- PROJECT_MEMORY → PROJECT_STATE → OPEN_ITEMS are the first sources of truth. OPEN_ITEMS drives the next Build.
- Completed Build history is archived in [docs/archive/](docs/archive/README.md) — **do NOT re-audit closed Builds** when gate/typecheck/CI are green; trust the record. Full-project audits only when memory is stale/contradictory or a major architectural change is proposed; otherwise do targeted audits.
- New durable engineering standards go in PROJECT_STATE (numbered); Build-specific detail goes in the archive; update OPEN_ITEMS/PRODUCTION_STATUS only where current state actually changed.
- Don't chase artificial "100%" scores. Frozen contract areas (OrderGateway/orderContract) need explicit versioned-major authorization before any change. Always separate current state from historical evidence.

## What this is
npm-workspaces monorepo. Three Expo/React-Native apps (`apps/{client,worker,admin}`) + pure-TS packages (`packages/{domain,api,ui,design,analytics}`) + a Fastify+Postgres orders backend (`server/`). Domain of a cleaning marketplace (bookings/missions/payments/payouts), Polish market (pl/en/uk).

## Commands
```bash
npm run check          # THE gate: tests + typecheck + app/anti-dep guard. Run before every commit.
npm test               # auto-discovers & runs every packages/**/*.test.ts (custom tsx runner)
npm run typecheck      # tsc --noEmit over packages/{domain,api,analytics} (tsconfig.check.json)
npm run check:apps     # bracket/glyph sanity + ANTI-STORE-IMPORT guard for apps/ (RN can't typecheck here)

# single test — run the file directly (tests are standalone tsx scripts, not a framework):
npx -y tsx packages/api/orderService.test.ts

# Expo apps
npm run client | worker | admin

# backend (needs Postgres) + full stack
npm run server                          # :8090  (see server/README.md)
docker compose up --build               # server + postgres, healthy

# infra-dependent tests — NOT in `npm run check` (need Docker/Postgres); run manually:
npm run test:live      # boots real Fastify on a socket, real fetch/SSE
npm run test:pg        # real Postgres: CAS, constraints, migrations, concurrency  (PG_URL, default :5434)
npm run test:ops       # rolling deploy + graceful shutdown + soak
```

## Architecture — the one thing to understand: the OrderGateway inversion
All order state flows through a **frozen contract**, `packages/api/orderContract.ts` (`OrderGateway` — 8 primitives + `subscribe`/snapshots). Everything hangs off this:

- **UI imports ONLY `orderGateway`** — never the store. Enforced two ways: the store (`packages/api/bookingStore.ts`) is NOT exported from the `@heyhomie/api` barrel (compile wall), and `tools/check-apps.mjs` fails the build if any `apps/` file names a store symbol.
- Two adapters satisfy the contract identically: **`localOrderGateway`** (offline, wraps the private store; the ACTIVE binding) and **`httpOrderGateway`** (fetch+SSE → the real server). Swapping backends = one line in `orderGateway.ts`; no UI change. `fakeBackend.ts` runs the http adapter over the real `orderService` in-process so the contract test proves both adapters without a live server.
- **`orderService.ts`** is the authoritative engine, **repo-injected** (`memoryOrderRepo` for tests, `pgOrderRepo` for the server) — same transitions everywhere. Money-status comes from `packages/domain/payment.ts` so adapters can't diverge.
- **Auth + tenancy are orthogonal** (`auth.ts`): the service enforces tenant isolation (reads scoped, cross-tenant mutation → `FORBIDDEN_TENANT_ACCESS`); `tenantId`/`auth` are server-side only and NEVER appear in the contract `Order` or the UI.
- **Optimistic concurrency**: `ServerOrder.version` + repo compare-and-swap; the service retries on conflict → exactly-once under parallel load. Terminal invariants live in the pure transitions + a DB CHECK.
- **Server** (`server/src/app.ts` = `buildApp`, repo-injected — the same construction prod boots and tests exercise): canonical errors (`errors.ts`, no leak), HMAC auth, per-IP rate limit, Prometheus `/metrics`, correlation ids, versioned migrations (`migrate.ts`, advisory-locked), k8s graceful shutdown (readiness flip → drain → bounded close).

## Non-obvious rules & gotchas
- **Never change the `OrderGateway` contract without a new build/version** — the whole codebase depends on its stability.
- **Verify with `npm run check`** after any change; it's the single source of truth for "green".
- Packages are **ESM** (`"type": "module"`); the server imports the barrel — keep it importable (no CJS-only patterns).
- RN screens can't be typechecked here (no native `node_modules`); `check:apps` is their guard.
- **Bash cwd resets between calls** — prepend `cd /c/Users/ihorf/Projects/heyhomie-mobile`.
- Distinguish **CODE COMPLETE vs INFRASTRUCTURE PENDING** — much of the server can only be exercised with Docker/Postgres (`test:pg`/`test:ops`/compose), which aren't in the default gate.
- Dockerfile CMD is `node --import tsx` (node must be PID 1 for SIGTERM to drain, not `npx tsx`).
- Windows LF→CRLF git warnings are benign.

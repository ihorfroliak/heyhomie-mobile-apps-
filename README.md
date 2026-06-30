# HeyHomie apps

Cross-platform app ecosystem for HeyHomie — the "uberized" home-cleaning service.
One monorepo, three apps, shared logic. Built with **React Native + Expo** so each
app ships to **iOS, Android and web** from a single codebase, and reuses the domain
logic from the existing React/Next web client.

## Apps

| App | Audience | Purpose |
|-----|----------|---------|
| `apps/client` | Customers | Book missions, manage recurring services, track, rate |
| `apps/worker` | Homies (cleaners) | Accept missions, navigate, start/finish, photos, earnings |
| `apps/admin` | Operators | Metrics, assignment, verification, payouts, quality |

## Shared packages

| Package | Contents |
|---------|----------|
| `packages/domain` | Framework-agnostic domain: cleaning checklist + add-ons (`cleaning.ts`), orders / services / missions + status rules (`missions.ts`). pl/en/uk, ready for new countries. |
| `packages/design` | Design tokens — brand colors, spacing, radii, typography (`tokens.ts`). |
| `packages/api` | API client + types + a mock layer so the apps run before the backend is wired. |
| `packages/ui` | Shared RN components (buttons, cards, chips, status badges). |

## Backend

The apps talk to the existing **Go API** (homie missions: assign/begin/complete,
schedule, payouts) and **Rails API** (orders, users, payments). During early
development `packages/api` serves mock data so all three apps are runnable
offline; swap the base URL to hit staging when ready.

## Status

Scaffolding in progress. Domain + design tokens first (no backend needed), then
shared UI + navigation, then screens per app. See the chat thread for the full
visual mockups (34 screens across the three apps).

## Getting started (once scaffolded)

```bash
npm install
npm run client   # expo start for the client app
npm run worker
npm run admin
```

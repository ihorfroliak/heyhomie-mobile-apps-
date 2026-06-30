# Architecture — heyhomie-apps

A React Native + Expo monorepo: three apps (client, worker, admin) on a shared,
tested core. Designed to plug into the existing HeyHomie Rails + Go backends
(see `INTEGRATION.md`).

## Package graph

```
apps/client ─┐
apps/worker ─┼─► @heyhomie/ui ──► @heyhomie/design (tokens)
apps/admin  ─┘        │
                      ├──► @heyhomie/domain  (rules, types, i18n, selectors)
                      └──► @heyhomie/api     (mock + real Go client) ──► domain
```

- `@heyhomie/domain` — framework-agnostic: cleaning checklist + add-ons, time
  calculator, mission/order/service types, status rules, i18n, view-selectors.
  **Has no React/RN dependency** → unit-tested with plain `tsx`.
- `@heyhomie/api` — mock data + business logic (status transitions, availability,
  reschedule/reassign) AND the real Go HTTP client (`homieClient.ts`). Same
  function shapes so mock→live is a swap.
- `@heyhomie/design` — brand tokens (colors, spacing, radii, typography).
- `@heyhomie/ui` — shared RN components + the locale context.

## Screen map

| App | Screens |
|-----|---------|
| **client** | Home · Activity (Orders/Services) · Profile (lang switch) · Mission detail · Book (calculator + add-ons) · Rate (stars + photos) |
| **worker** | Today · Missions (accept) · Schedule · Earnings · Profile · Mission (check-in/out) · Verification |
| **admin** | Dashboard · Missions (filter) · Homies · Payouts · Mission (assign) · Verification · Quality |

Navigation: Expo Router. `app/(tabs)/` = tab bar; `app/<route>.tsx` = stack screens.

## Data flow

```
Screen ──reads──► @heyhomie/domain selectors/formatters
       ──calls──► @heyhomie/api (mock today; createHomieClient when live)
       ──renders─► @heyhomie/ui components (themed by @heyhomie/design)
```

Locale flows through `LocaleProvider` (in each app's `app/_layout.tsx`); screens
call `useLocale()`; strings resolve via domain `tr()`.

## Key rules enforced in code

- **Order vs Service vs Mission** are distinct types (`missions.ts`).
- **Mission time** = bathrooms·60 + kitchens·60 + rooms·30 + corridor 30, min 3h;
  add-ons add time; travel buffer separate (`cleaning.ts`).
- **Staffing**: general = 2 homies unless ≤60 m² or recurring (`workersFor`).
- **Freeze**: only `searching_homie` is editable; UI disables edits after
  `homie_found` (`isMissionEditable`) — matches the Rails↔Go sync.
- **Worker flow**: accept → begin (check-in) → complete (check-out) (`workerAction`,
  `transitionMission`).

## Tests

Pure logic is fully tested (no device needed):

```bash
npm test
# packages/api/logic.test.ts      (30)  status, availability, reschedule, reassign
# packages/api/http.test.ts       (10)  HTTP client, auth header, endpoints
# packages/domain/i18n.test.ts    (9)   labels, duration/money formatting
# packages/domain/selectors.test.ts (14) split, timeline, workerAction, adminStats
# => 63 passing
```

Type-check: `npx -p typescript tsc --noEmit` over `packages/domain` + `packages/api`.

> RN screens are validated on a device/emulator via Expo — they are not run in CI
> here. The logic they depend on is covered by the tests above.

## Run (on a dev machine)

```bash
npm install
npm run client   # expo start (Home → Book → Mission → Rate …)
npm run worker
npm run admin
```

## Going live

Replace the mock import with the real client (see `INTEGRATION.md`):

```ts
import { createHomieClient, API_PRESETS } from '@heyhomie/api';
const homie = createHomieClient({ baseUrl: API_PRESETS.dev.goBaseUrl, token });
```

Endpoints already mirror `homie-api/routes/api_homie.go`.

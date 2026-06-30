# @heyhomie/api

Data + business-logic layer. Provides a **mock** implementation (so the apps run
offline) and the **real Go API client** with identical function shapes, so going
live is a swap, not a rewrite.

## Modules

| File | Purpose |
|------|---------|
| `mock.ts` | Sample homies + logic: `isHomieAvailable`, `nextAvailableDate`, `suggestHomies`, `transitionMission` (assign/begin/complete/cancel with guards + check-in/out), `rescheduleMission`, `reassignHomie` |
| `demo.ts` | Sample missions / available missions / services for the screens |
| `config.ts` | Backend base URLs (`API_PRESETS.local` / `.dev`) + Go path prefixes |
| `http.ts` | Typed fetch wrapper (`createHttp`, `ApiError`, `buildUrl`), injectable `fetchImpl` for tests |
| `homieClient.ts` | Real worker endpoints, mirroring `homie-api/routes/api_homie.go` |

## Live wiring

```ts
import { createHomieClient, API_PRESETS } from '@heyhomie/api';
const homie = createHomieClient({ baseUrl: API_PRESETS.dev.goBaseUrl, token });
const missions = await homie.listMyMissions();
```

## Test

```bash
npx -y tsx logic.test.ts   # 30 tests — logic
npx -y tsx http.test.ts    # 10 tests — HTTP client / endpoints
```

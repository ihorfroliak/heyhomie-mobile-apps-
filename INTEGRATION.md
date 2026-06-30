# Integrating heyhomie-apps into the HeyHomie ecosystem

These mobile apps are **not standalone** — they are part of the existing HeyHomie
system and talk to the **same Rails + Go backends** already used by the web client,
the Nuxt admin and the employee app. This document explains how they plug in.

## 1. One ecosystem (git submodule)

`heyhomie-apps` becomes another submodule of the existing orchestrator
`docker-heyhomie-core-services`, alongside `heyhomie-api`, `heyhomie-client`,
`homie-api`, `heyhomie-admin`, `heyhomie-employee`, etc.

```bash
# inside docker-heyhomie-core-services
git submodule add <gitea-url>/heyhomie-apps.git heyhomie-apps
```

No new backend service is required — the apps are clients of the existing APIs.

## 2. Which app talks to which backend

| App | Backend | Prefix | Existing counterpart |
|-----|---------|--------|----------------------|
| `apps/client` | Rails API | `api/v1/*` | heyhomie-client (Next) |
| `apps/worker` | Go API | `/api/homie/*` | heyhomie-employee |
| `apps/admin`  | Go API + Rails | `/api/admin/*` | heyhomie-admin (Nuxt) |

Endpoints in `packages/api/homieClient.ts` mirror `homie-api/routes/api_homie.go`
exactly. Base URLs live in `packages/api/config.ts` (from `homie-api/docs/version.ini`):

- local: Go `http://127.0.0.1:8080`, Rails `http://127.0.0.1:3001`
- dev: `https://heyhomie-api.dev.stuzer.link`

## 3. Mock → real (no screen changes)

During early dev the apps use `packages/api/mock.ts` (offline data + logic, fully
tested). To go live, point the screens at the real client:

```ts
import { createHomieClient, API_PRESETS } from '@heyhomie/api';
const homie = createHomieClient({ baseUrl: API_PRESETS.dev.goBaseUrl, token });
const missions = await homie.listMyMissions();
```

The function names match the mock, so wiring is a swap, not a rewrite.

## 4. Auth

Same as the existing apps: phone **OTP** (Twilio) → the Go API returns a **Bearer
token**, sent back in the `Authorization` header (raw token, 30-day auto-prolong).
Store it securely (expo-secure-store) and pass it as `token` to the client.

## 5. Shared rules already honored

The domain (`packages/domain`) was built to match the backend, so nothing diverges:

- Mission statuses = Go API (`searching_homie → homie_found → in_progress → done`).
- Freeze rule: attributes lock after `homie_found` (Rails↔Go sync) — `isMissionEditable`.
- Order vs recurring Service; mission min 3h + travel buffer; payouts on the 1st & 15th.

## 6. Types from Swagger (optional, recommended)

`homie-api` generates OpenAPI specs via `make docs` (not committed). After running it,
generate exact DTOs:

```bash
npx openapi-typescript homie-api/docs/swagger/homie.json -o packages/api/generated/homie.d.ts
```

Then replace the generic `<T>` returns in `homieClient.ts` with the generated types.

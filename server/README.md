# @heyhomie/server — orders backend (Build 04)

Minimal Fastify + Postgres service. Authoritative source of truth for orders.
Implements the OrderGateway HTTP contract; `httpOrderGateway` in `@heyhomie/api`
is the client.

## Run

```bash
# 1. Postgres (any 14+). Example with docker:
docker run -d --name heyhomie-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16

# 2. Install + start (from repo root, workspaces linked):
cp server/.env.example server/.env
npm --workspace @heyhomie/server run start   # or: cd server && npm run start
# GET http://localhost:8090/healthz  → {"ok":true}
```

### Local port conflicts
If host ports 5432 (Postgres) or 8090 (server) are already taken (e.g. another
project's DB), override only the **host-side** publish — do NOT change container
networking. The server reaches the DB over the compose network name `db:5432`
regardless of the host mapping, so remapping the host port is safe:

```yaml
# compose override (throwaway, e.g. compose.override.yml) — host ports only:
services:
  db:     { ports: !override ["5436:5432"] }   # DB reachable on host :5436
  server: { ports: !override ["8095:8090"] }   # server reachable on host :8095
```
```bash
docker compose -f docker-compose.yml -f compose.override.yml up -d --build
```
`DATABASE_URL` stays `postgres://…@db:5432/…` (internal) — unchanged.

## Endpoints (contract)

| Method | Path | Op |
|---|---|---|
| POST | `/orders` | create |
| GET | `/orders` | list |
| GET | `/orders/:id` | fetch |
| POST | `/orders/:id/confirm` | confirm (idempotent) |
| POST | `/orders/:id/cancel` | cancel (idempotent) |
| POST | `/orders/:id/complete` | mission done → payment due |
| POST | `/orders/:id/settle` | settle payment (idempotent) |
| POST | `/orders/:id/mark-paid` | admin manual mark-paid |
| GET | `/orders/stream` | SSE change feed (full-snapshot frames) |

## Wire the apps to it

One line in `packages/api/orderGateway.ts`:

```ts
import { makeHttpOrderGateway, httpOrderPort } from './httpOrderGateway';
export const orderGateway = makeHttpOrderGateway(httpOrderPort({ baseUrl: process.env.EXPO_PUBLIC_ORDERS_API_URL! }));
```

No UI changes. The contract test (`packages/api/gateway.test.ts`) already proves
the Http adapter satisfies the same lifecycle as Local via the in-process fake.

## Auth + tenancy (Build 05)

- Every request needs a bearer token: `Authorization: Bearer <token>`. Tokens are
  HMAC-signed with `AUTH_SECRET` (server-verified — spoofing without the signature
  is rejected). SSE passes the token as `?token=` (headers not settable on EventSource).
- Dev fallback (`AUTH_DEV_MODE=1`): `x-dev-tenant` / `x-dev-user` / `x-dev-role`
  headers, and `GET /dev/token?tenant=&user=&role=` to mint a signed token.
- Tenant isolation is enforced in the **service + repo**, never the UI: reads are
  scoped by `tenant_id`; cross-tenant/missing mutations → `403 FORBIDDEN_TENANT_ACCESS`.
  `orders.tenant_id` is indexed and pinned on update (a row can't change tenant).

```bash
# smoke test with the dev token
TOK=$(curl -s "localhost:8090/dev/token?tenant=t1&user=u1&role=admin" | jq -r .token)
curl -s -XPOST localhost:8090/orders -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' -d '{"contact":{"phone":"600100200"},"cityId":"krakow","serviceId":"standard_cleaning"}'
curl -s localhost:8090/orders -H "authorization: Bearer $TOK"   # only t1's orders
```

## Wire the apps (auth-carrying gateway)

```ts
export const orderGateway = makeHttpOrderGateway(httpOrderPort({
  baseUrl: process.env.EXPO_PUBLIC_ORDERS_API_URL!,
  getToken: () => session.token,   // opaque token from your auth; UI never sees a tenant
}));
```

## Scope / limits (honest)

- Single domain: `orders`. No OAuth, no JWT refresh, no DB sessions, no Stripe SDK,
  no queues, no rate limiting (out of Build 05 scope).
- SSE is single-instance; horizontal scale needs Postgres `LISTEN/NOTIFY`.
- Order money-status logic is the shared domain payment lifecycle — Local and
  Http adapters cannot diverge.

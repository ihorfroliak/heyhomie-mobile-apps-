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

## Auth + tenancy (Build 05, issuer added Build 18)

- Every request needs a bearer token: `Authorization: Bearer <token>`. Tokens are
  HMAC-signed with `AUTH_SECRET` (server-verified — spoofing without the signature
  is rejected). SSE passes the token as `?token=` (headers not settable on EventSource).
- **Login (Build 18)** — the real credential issuer (`/auth/*`, public + rate-limited):

  | Method | Path | Body | Returns |
  |---|---|---|---|
  | POST | `/auth/register` | `{email,password}` | `201 {accessToken,refreshToken,expiresIn}` — provisions a business (new tenant + admin) |
  | POST | `/auth/login` | `{email,password}` | `200 {accessToken,refreshToken,expiresIn}` |
  | POST | `/auth/refresh` | `{refreshToken}` | `200 {…}` — rotates (single-use; reuse → whole family revoked) |
  | POST | `/auth/logout` | `{refreshToken}` | `204` — revokes the session |
  | POST | `/auth/invite` | `{email,role}` **(auth: owner)** | `201 {id,inviteToken,email,role,expiresIn}` — one-time member invite (Build 23) |
  | POST | `/auth/accept-invite` | `{inviteToken,password}` | `200 {…}` — join the tenant + set password once → logged in |
  | GET | `/auth/invitations` | **(auth: owner/admin)** | `{invitations:[…]}` — email/role/status/expiry (never token hashes) — Build 24 |
  | POST | `/auth/invitations/:id/revoke` | **(auth: owner)** | `204` — revoke a pending invite (not an accepted one; cross-tenant → 403) |
  | POST | `/auth/password-reset/request` | `{email}` | `200 {}` — identical whether the email exists; token delivered via NotificationPort (dev-echoed only) |
  | POST | `/auth/password-reset/confirm` | `{resetToken,password}` | `204` — set new password + revoke ALL sessions (fresh login) |
  | GET | `/auth/sessions` | **(auth)** | `{sessions:[…]}` — own live sessions (id/createdAt/lastUsedAt/deviceLabel; no refresh tokens) |
  | DELETE | `/auth/sessions/:id` | **(auth)** | `204` — revoke one of your OWN sessions (others' → 403) |
  | GET | `/auth/users` | **(auth: owner/admin)** | `{users:[…]}` — member roster (id/email/role/status; no hashes) — Build 25 |
  | POST | `/auth/users/:id/disable` | **(auth: owner)** | `204` — disable a member (revokes all their sessions; login/refresh/reset blocked) |
  | POST | `/auth/users/:id/enable` | **(auth: owner)** | `204` — re-enable a disabled member |
  | DELETE | `/auth/users/:id` | **(auth: owner)** | `204` — delete a member (not self / last owner; revokes sessions+invites; cross-tenant → 403) |

  Passwords are scrypt-hashed (per-user salt). The **access token** is the same
  short-lived HMAC token as before (`AUTH_ACCESS_TTL_SEC`, default 15 min); the
  **refresh token** is opaque, stored sha256-hashed, long-lived (`AUTH_REFRESH_TTL_SEC`,
  default 30 d) and revocable. The response never echoes `tenantId` (stays server-side).
- Dev fallback (`AUTH_DEV_MODE=1`): `x-dev-tenant` / `x-dev-user` / `x-dev-role`
  headers, and `GET /dev/token?tenant=&user=&role=` to mint a signed token (local only).
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

## Notification delivery (Build 26)

Invite + password-reset tokens leave through one seam — `NotificationPort`
(`sendInvitation`/`sendPasswordReset`), injected via `AuthDeps.notifications`. Bootstrap wires
`consoleNotificationPort` (structured, token-free, masked recipient); swap in an SMTP/SES impl
(same interface) for real email — nothing else changes. The route delivers **best-effort +
isolated**: a send failure logs `notification_failed` (token-free) and never fails the auth op
or changes the enumeration-safe response. `makeAuthService` never knows how email is delivered.

## Scope / limits (honest)

- Auth is email+password (scrypt) with access/refresh tokens (Build 18). No OAuth /
  social / SMS-OTP issuers yet — those layer on behind the same token-mint seam.
  No JWT lib (opaque HMAC). Member invites (non-admin users in a tenant) not yet.
- Single domain: `orders`. No Stripe SDK, no queues.
- SSE is single-instance; horizontal scale needs Postgres `LISTEN/NOTIFY`.
- Order money-status logic is the shared domain payment lifecycle — Local and
  Http adapters cannot diverge.

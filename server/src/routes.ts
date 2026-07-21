/** REST + SSE routes. 1:1 with the OrderGateway HTTP port. Tenant-enforced. */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { toContractOrder, validateSubmitOrderInput, NotFoundError, IdempotencyStore, ValidationError, nullNotificationPort, type AuthService, type InviteRole, type NotificationPort, type OrderService, type RevocationIndex, type ServerOrder, type SubmitOrderResult } from '@heyhomie/api';
import type { FastifyBaseLogger } from 'fastify';
import { reqAuth, reqAuthToken } from './auth.js';

/**
 * Auth endpoints (Build 18) — PUBLIC (pre-auth), rate-limited by the onRequest
 * hook. Replace the dev-only `/dev/token` as the real issuer: register/login mint
 * an access + refresh pair; refresh rotates (single-use); logout revokes. The
 * service returns canonical AppErrors (401 generic → no enumeration).
 */
export function registerAuthRoutes(app: FastifyInstance, auth: AuthService, opts?: { devMode?: boolean; notifications?: NotificationPort }): void {
    const notifications = opts?.notifications ?? nullNotificationPort();
    const body = (b: unknown): Record<string, unknown> => {
        if (!b || typeof b !== 'object') throw new ValidationError('invalid request body');
        return b as Record<string, unknown>;
    };
    // Best-effort, ISOLATED delivery: a send failure NEVER fails the auth op and the
    // failure record is token-free (no secret leakage). No auto-retry (provider concern).
    const deliver = async (log: FastifyBaseLogger, type: 'invitation' | 'password_reset', send: () => Promise<void>): Promise<void> => {
        try { await send(); }
        catch { log.error({ event: 'notification_failed', type }, 'notification delivery failed'); }
    };
    // Client-safe wire shape: the access token is opaque to the UI and the tenant
    // stays server-side (hard rule) — never echo identity/tenantId in the body.
    const wire = (t: { accessToken: string; refreshToken: string; expiresIn: number }) =>
        ({ accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn });
    app.post('/auth/register', async (req, reply) => {
        const b = body(req.body);
        const tokens = await auth.register({ email: b.email as string, password: b.password as string });
        return reply.code(201).send(wire(tokens));
    });
    app.post('/auth/login', async (req) => {
        const b = body(req.body);
        return wire(await auth.login({ email: b.email as string, password: b.password as string }));
    });
    app.post('/auth/refresh', async (req) => {
        const b = body(req.body);
        return wire(await auth.refresh(b.refreshToken as string));
    });
    app.post('/auth/logout', async (req, reply) => {
        const b = body(req.body);
        await auth.logout(b.refreshToken as string);
        return reply.code(204).send();
    });

    // Member invites (Build 23). /auth/invite is AUTHENTICATED (owner-only, enforced
    // in the service via req.auth); /auth/accept-invite is public (it establishes a
    // new user). The invite token is shared out-of-band; tenant internals never leak.
    app.post('/auth/invite', async (req, reply) => {
        const b = body(req.body);
        const result = await auth.invite({ email: b.email as string, role: b.role as InviteRole }, reqAuth(req));
        // Deliver the invite email (best-effort); the owner also gets the token in the
        // response as an out-of-band fallback (unchanged).
        await deliver(req.log, 'invitation', () => notifications.sendInvitation({ email: result.email, inviteToken: result.inviteToken, role: result.role, expiresInSec: result.expiresIn }));
        return reply.code(201).send({ id: result.id, inviteToken: result.inviteToken, email: result.email, role: result.role, expiresIn: result.expiresIn });
    });
    app.post('/auth/accept-invite', async (req) => {
        const b = body(req.body);
        return wire(await auth.accept({ inviteToken: b.inviteToken as string, password: b.password as string }));
    });

    // ── Auth operations (Build 24). All /auth/invitations + /auth/sessions are
    // AUTHENTICATED (not in the pre-auth set); password-reset is public. ──
    app.get('/auth/invitations', async (req) => ({ invitations: await auth.listInvitations(reqAuth(req)) }));
    app.post<{ Params: { id: string } }>('/auth/invitations/:id/revoke', async (req, reply) => {
        await auth.revokeInvite(req.params.id, reqAuth(req));
        return reply.code(204).send();
    });

    app.post('/auth/password-reset/request', async (req, reply) => {
        const b = body(req.body);
        const res = await auth.requestPasswordReset({ email: b.email as string });
        // Deliver the reset email (best-effort) only when a token exists; the response
        // is IDENTICAL either way (enumeration-safe). A delivery failure never changes it.
        if (res) await deliver(req.log, 'password_reset', () => notifications.sendPasswordReset({ email: res.email, resetToken: res.resetToken, expiresInSec: res.expiresIn }));
        // The token is delivered out-of-band (email); it is echoed ONLY in dev mode, the
        // same gate as /dev/token — never in production, never in a log.
        return reply.code(200).send(opts?.devMode && res ? { resetToken: res.resetToken } : {});
    });
    app.post('/auth/password-reset/confirm', async (req, reply) => {
        const b = body(req.body);
        await auth.confirmPasswordReset({ resetToken: b.resetToken as string, password: b.password as string });
        return reply.code(204).send();
    });

    app.get('/auth/sessions', async (req) => ({ sessions: await auth.listSessions(reqAuth(req)) }));
    app.delete<{ Params: { id: string } }>('/auth/sessions/:id', async (req, reply) => {
        await auth.revokeSessionById(req.params.id, reqAuth(req));
        return reply.code(204).send();
    });

    // ── Account lifecycle (Build 25). AUTHENTICATED, owner-only (enforced in the
    // service via req.auth). Disable/enable/delete a tenant member. ──
    app.get('/auth/users', async (req) => ({ users: await auth.listMembers(reqAuth(req)) }));
    app.post<{ Params: { id: string } }>('/auth/users/:id/disable', async (req, reply) => {
        await auth.disableUser(req.params.id, reqAuth(req));
        return reply.code(204).send();
    });
    app.post<{ Params: { id: string } }>('/auth/users/:id/enable', async (req, reply) => {
        await auth.enableUser(req.params.id, reqAuth(req));
        return reply.code(204).send();
    });
    app.delete<{ Params: { id: string } }>('/auth/users/:id', async (req, reply) => {
        await auth.deleteUser(req.params.id, reqAuth(req));
        return reply.code(204).send();
    });

    // Privileged-action audit trail (Build 27). AUTHENTICATED, owner/admin only
    // (enforced in the service). Never returns tokens/hashes.
    app.get<{ Querystring: { limit?: string } }>('/auth/audit', async (req) => {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        return { events: await auth.listAuditEvents(reqAuth(req), Number.isFinite(limit) ? limit : undefined) };
    });
}

export function registerRoutes(app: FastifyInstance, service: OrderService, idem?: IdempotencyStore<SubmitOrderResult>): void {
    // create — body validated at the boundary (hostile input → 400). If the client
    // sent an Idempotency-Key, a repeat of the SAME booking (timeout-retry / double
    // tap) returns the cached order instead of creating a second one (Build 17).
    app.post('/orders', async (req) => {
        const auth = reqAuth(req);
        const input = validateSubmitOrderInput(req.body); // validate BEFORE dedup (never cache a bad body)
        const key = req.headers['idempotency-key'];
        if (idem && typeof key === 'string' && key) {
            const scoped = `${auth.tenantId}:${key}`; // tenant-scoped — no cross-tenant collision
            const cached = idem.get(scoped);
            if (cached) return cached;
            const result = await service.create(input, auth);
            idem.set(scoped, result);
            return result;
        }
        return service.create(input, auth);
    });

    // list / get (tenant-scoped)
    app.get('/orders', async (req) => (await service.list(reqAuth(req))).map(toContractOrder));
    app.get<{ Params: { id: string } }>('/orders/:id', async (req) => {
        const o = await service.get(req.params.id, reqAuth(req));
        if (!o) throw new NotFoundError();
        return toContractOrder(o);
    });

    // transitions (idempotent). Cross-tenant → the service throws
    // FORBIDDEN_TENANT_ACCESS, surfaced as 403 by the error hook (index.ts).
    // `body` is read as an optional {completedAt|now} but typed `unknown` at the
    // route boundary (some transitions declare no Body generic) — cast at the read
    // so the one handler shape is assignable to every app.post<> variant below.
    const mutate = (fn: (id: string, req: FastifyRequest, arg?: string) => Promise<ServerOrder | undefined>) =>
        async (req: FastifyRequest<{ Params: { id: string } }>) => {
            const b = req.body as { completedAt?: string; now?: string } | undefined;
            const arg = b?.completedAt ?? b?.now;
            const o = await fn(req.params.id, req, arg);
            return o ? toContractOrder(o) : null;
        };

    app.post<{ Params: { id: string } }>('/orders/:id/confirm', mutate((id, req) => service.confirm(id, reqAuth(req))));
    app.post<{ Params: { id: string } }>('/orders/:id/cancel', mutate((id, req) => service.cancel(id, reqAuth(req))));
    app.post<{ Params: { id: string }; Body: { completedAt?: string } }>('/orders/:id/complete', mutate((id, req, at) => service.complete(id, reqAuth(req), at)));
    app.post<{ Params: { id: string }; Body: { now?: string } }>('/orders/:id/settle', mutate((id, req, now) => service.settle(id, reqAuth(req), now)));
    app.post<{ Params: { id: string } }>('/orders/:id/mark-paid', mutate((id, req) => service.markPaid(id, reqAuth(req))));
}

/**
 * Change feed. SSE, full-snapshot frames scoped to the connection's tenant
 * (idempotent → the client replaces its cache; no delta = no dup/ordering bugs).
 * A cross-tenant change still pokes other connections, but each `send` lists only
 * its own tenant, so no data crosses the boundary.
 * NOTE: single-instance. Horizontal scale needs Postgres LISTEN/NOTIFY.
 */
export function registerStream(app: FastifyInstance, service: OrderService, metrics?: { sseConnections: { add: (d: number) => void } }, sseSockets?: Set<{ end: () => void }>, opts?: { revocations?: RevocationIndex; heartbeatMs?: number }): void {
    const heartbeatMs = opts?.heartbeatMs ?? 15_000;
    app.get('/orders/stream', async (req, reply) => {
        const auth = reqAuth(req);
        const tok = reqAuthToken(req);
        // A long-lived stream authenticated ONCE at connect; without this it would
        // keep streaming a disabled/deleted/reset user's tenant data indefinitely
        // (the per-request revocation check can't reach an open socket). Re-check on
        // each heartbeat → a revoked stream is cut within one heartbeat (Build 30).
        const isRevoked = () => !!(opts?.revocations && tok && opts.revocations.isRevoked({ userId: auth.userId, sid: tok.sid, iat: tok.iat }));
        // Take over the socket so Fastify won't try to serialize/error-handle this
        // reply after we've streamed bytes (a post-headers throw would otherwise
        // double-writeHead and crash the process — found under SSE load, Build 13).
        reply.hijack();
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        // Registered so graceful shutdown can end long-lived SSE sockets (they'd
        // otherwise block app.close() forever — Build 14).
        sseSockets?.add(reply.raw);
        metrics?.sseConnections.add(1);
        req.log.info({ correlationId: req.id, tenantId: auth.tenantId }, 'sse_connected');
        let closed = false;
        // Guarded write — never throw on a disconnected client.
        const write = (chunk: string): void => {
            if (closed || reply.raw.writableEnded) return;
            try { reply.raw.write(chunk); } catch { /* client vanished mid-write */ }
        };
        const send = async () => {
            try {
                const orders = (await service.list(auth)).map(toContractOrder);
                write(`data: ${JSON.stringify(orders)}\n\n`);
            } catch (e) {
                req.log.error({ correlationId: req.id, err: e }, 'sse_send_failed');
            }
        };
        const unsub = service.subscribe(() => { void send(); });
        // Heartbeat: keep-alive + enforce revocation. If the connection's token has
        // been revoked, end the socket (the 'close' handler below runs cleanup).
        const heartbeat = setInterval(() => {
            if (isRevoked()) {
                req.log.info({ correlationId: req.id, tenantId: auth.tenantId }, 'sse_revoked');
                try { reply.raw.end(); } catch { /* already closed */ }
                return;
            }
            write(': ping\n\n');
        }, heartbeatMs);
        // Register cleanup BEFORE any awaited work (Build 16 / C1): the initial
        // `send()` awaits a DB query, and a client that disconnects during it emits
        // 'close' once — if the handler were attached after the await it would miss
        // the event and leak the subscription, heartbeat timer and gauge forever.
        req.raw.on('close', () => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            unsub();
            sseSockets?.delete(reply.raw);
            metrics?.sseConnections.add(-1);
            req.log.info({ correlationId: req.id, tenantId: auth.tenantId }, 'sse_disconnected');
        });
        // Reject an already-revoked token at connect (don't even send the snapshot).
        if (isRevoked()) { try { reply.raw.end(); } catch { /* already closed */ } return; }
        await send(); // initial snapshot (tenant-scoped) — cleanup already wired
    });
}

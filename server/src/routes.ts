/** REST + SSE routes. 1:1 with the OrderGateway HTTP port. Tenant-enforced. */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { toContractOrder, NotFoundError, type OrderService, type ServerOrder, type SubmitOrderInput } from '@heyhomie/api';
import { reqAuth } from './auth.js';

export function registerRoutes(app: FastifyInstance, service: OrderService): void {
    // create
    app.post('/orders', async (req) => service.create(req.body as SubmitOrderInput, reqAuth(req)));

    // list / get (tenant-scoped)
    app.get('/orders', async (req) => (await service.list(reqAuth(req))).map(toContractOrder));
    app.get<{ Params: { id: string } }>('/orders/:id', async (req) => {
        const o = await service.get(req.params.id, reqAuth(req));
        if (!o) throw new NotFoundError();
        return toContractOrder(o);
    });

    // transitions (idempotent). Cross-tenant → the service throws
    // FORBIDDEN_TENANT_ACCESS, surfaced as 403 by the error hook (index.ts).
    const mutate = (fn: (id: string, req: FastifyRequest, arg?: string) => Promise<ServerOrder | undefined>) =>
        async (req: FastifyRequest & { params: { id: string }; body?: { completedAt?: string; now?: string } }) => {
            const arg = req.body?.completedAt ?? req.body?.now;
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
export function registerStream(app: FastifyInstance, service: OrderService): void {
    app.get('/orders/stream', async (req, reply) => {
        const auth = reqAuth(req);
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        const send = async () => {
            const orders = (await service.list(auth)).map(toContractOrder);
            reply.raw.write(`data: ${JSON.stringify(orders)}\n\n`);
        };
        await send(); // initial snapshot (tenant-scoped)
        const unsub = service.subscribe(() => { void send(); });
        // Heartbeat comment keeps the connection alive through proxies and lets the
        // client's watchdog detect a dead link. Cleared on close (no timer leak).
        const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
        req.raw.on('close', () => { clearInterval(heartbeat); unsub(); });
    });
}

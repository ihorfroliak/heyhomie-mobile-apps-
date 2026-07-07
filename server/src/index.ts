/**
 * HeyHomie orders backend — authoritative source of truth, multi-tenant.
 * Fastify + Postgres over the shared `orderService`. Auth is a preHandler; the
 * service enforces tenant isolation. `httpOrderGateway` is the client.
 */
import Fastify from 'fastify';
import { makeOrderService, FORBIDDEN_TENANT_ACCESS, type AuthContext, type Role } from '@heyhomie/api';
import { makePool, initSchema } from './db.js';
import { pgOrderRepo } from './pgRepo.js';
import { registerRoutes, registerStream } from './routes.js';
import { authenticateRequest, signAuthToken } from './auth.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/heyhomie';
const PORT = Number(process.env.PORT ?? 8090);
const AUTH_SECRET = process.env.AUTH_SECRET ?? 'dev-secret-change-me';
const AUTH_DEV_MODE = process.env.AUTH_DEV_MODE === '1';

async function main() {
    const pool = makePool(DATABASE_URL);
    await initSchema(pool);
    const service = makeOrderService(pgOrderRepo(pool));

    const app = Fastify({ logger: true });

    // Cross-tenant / denied access → 403 (not a 500).
    app.setErrorHandler((err, _req, reply) => {
        if (err.message === FORBIDDEN_TENANT_ACCESS) return reply.code(403).send({ error: FORBIDDEN_TENANT_ACCESS });
        reply.code(500).send({ error: 'internal_error' });
    });

    app.get('/healthz', async () => ({ ok: true }));

    // Dev-only helper to mint a signed token for smoke tests.
    if (AUTH_DEV_MODE) {
        app.get<{ Querystring: { tenant?: string; user?: string; role?: string } }>('/dev/token', async (req) => {
            const auth: AuthContext = {
                tenantId: req.query.tenant ?? 'default',
                userId: req.query.user ?? 'dev',
                role: (req.query.role === 'admin' ? 'admin' : 'member') as Role,
            };
            return { token: signAuthToken(auth, AUTH_SECRET), auth };
        });
    }

    // Auth boundary for everything below (skips /healthz and /dev/token).
    app.addHook('preHandler', authenticateRequest(AUTH_SECRET, AUTH_DEV_MODE));

    registerRoutes(app, service);
    registerStream(app, service);

    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`orders backend listening on :${PORT} (devMode=${AUTH_DEV_MODE})`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

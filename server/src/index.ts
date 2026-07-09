/**
 * HeyHomie orders backend — authoritative source of truth, multi-tenant.
 * Fastify + Postgres over the shared `orderService`. Auth is a preHandler; the
 * service enforces tenant isolation. `httpOrderGateway` is the client.
 *
 * Build 06: fail-fast config validation, liveness/readiness probes, graceful
 * shutdown. The process never boots with invalid configuration.
 */
import Fastify from 'fastify';
import { makeOrderService, loadServerConfig, ConfigError, FORBIDDEN_TENANT_ACCESS, type AuthContext, type Role } from '@heyhomie/api';
import { makePool, initSchema } from './db.js';
import { pgOrderRepo } from './pgRepo.js';
import { registerRoutes, registerStream } from './routes.js';
import { authenticateRequest, signAuthToken } from './auth.js';

async function main() {
    // 1. Validate configuration — die before opening a port if anything is wrong.
    const config = loadServerConfig(process.env);

    // 2. Database + schema.
    const pool = makePool(config.databaseUrl);
    await pool.query('SELECT 1'); // startup DB reachability check (fail fast)
    await initSchema(pool);
    const service = makeOrderService(pgOrderRepo(pool));

    const app = Fastify({ logger: true });

    app.setErrorHandler((err, _req, reply) => {
        if (err.message === FORBIDDEN_TENANT_ACCESS) return reply.code(403).send({ error: FORBIDDEN_TENANT_ACCESS });
        reply.code(500).send({ error: 'internal_error' });
    });

    // Liveness: process is up (no dependency checks — used by orchestrators to
    // decide restart). Readiness: dependencies healthy (used to gate traffic).
    app.get('/health/live', async () => ({ status: 'up' }));
    app.get('/health/ready', async (_req, reply) => {
        try {
            await pool.query('SELECT 1');
            return { status: 'ready', db: 'up' };
        } catch {
            return reply.code(503).send({ status: 'not_ready', db: 'down' });
        }
    });
    app.get('/healthz', async () => ({ ok: true })); // back-compat

    if (config.devMode) {
        app.get<{ Querystring: { tenant?: string; user?: string; role?: string } }>('/dev/token', async (req) => {
            const auth: AuthContext = {
                tenantId: req.query.tenant ?? 'default',
                userId: req.query.user ?? 'dev',
                role: (req.query.role === 'admin' ? 'admin' : 'member') as Role,
            };
            return { token: signAuthToken(auth, config.authSecret), auth };
        });
    }

    app.addHook('preHandler', authenticateRequest(config.authSecret, config.devMode));
    registerRoutes(app, service);
    registerStream(app, service);

    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`orders backend listening on :${config.port} (devMode=${config.devMode})`);

    // 3. Graceful shutdown — drain connections, close the pool, then exit.
    const shutdown = async (signal: string) => {
        app.log.info(`${signal} received — shutting down`);
        try {
            await app.close();
            await pool.end();
            process.exit(0);
        } catch (e) {
            app.log.error(e);
            process.exit(1);
        }
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
    if (e instanceof ConfigError) {
        console.error(`\n[config] ${e.message}\n`);
    } else {
        console.error(e);
    }
    process.exit(1);
});

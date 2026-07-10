/**
 * HeyHomie orders backend — authoritative source of truth, multi-tenant.
 * Fastify + Postgres over the shared `orderService`. Auth is a preHandler; the
 * service enforces tenant isolation. `httpOrderGateway` is the client.
 *
 * Build 06: fail-fast config, health probes, graceful shutdown, canonical
 * errors, rate limiting, and full observability — correlation ids, structured
 * request logs, Prometheus /metrics, startup/shutdown diagnostics.
 */
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { makeOrderService, loadServerConfig, ConfigError, fromUnknown, RateLimiter, RateLimitedError, type AuthContext, type Role } from '@heyhomie/api';
import { makePool, initSchema } from './db.js';
import { pgOrderRepo } from './pgRepo.js';
import { registerRoutes, registerStream } from './routes.js';
import { authenticateRequest, signAuthToken } from './auth.js';
import { makeServerMetrics } from './metrics.js';

async function main() {
    const bootStart = Date.now();
    // 1. Validate configuration — die before opening a port if anything is wrong.
    const config = loadServerConfig(process.env);

    // 2. Database + schema.
    const pool = makePool(config.databaseUrl);
    await pool.query('SELECT 1'); // startup DB reachability check (fail fast)
    await initSchema(pool);

    // 3. Metrics + service (telemetry bridged to Prometheus counters).
    const metrics = makeServerMetrics();
    const service = makeOrderService(pgOrderRepo(pool), metrics.serviceTelemetry);

    const app = Fastify({
        // Redact the bearer token from request logs; cap body size (DoS guard).
        // Residual: the SSE token rides in the query string (EventSource can't set
        // headers) so it may appear in access logs — bounded by the 15-min TTL.
        logger: { redact: ['req.headers.authorization', 'req.headers["x-dev-user"]', 'req.headers["x-dev-tenant"]'] },
        bodyLimit: 64 * 1024,
        // Correlation: reuse the client's x-correlation-id (the gateway sends one
        // per logical call, stable across retries), else generate. req.id IS the
        // correlation id — it flows through logs, errors and responses.
        genReqId: (req) => {
            const cid = req.headers['x-correlation-id'];
            return typeof cid === 'string' && cid.length > 0 && cid.length <= 128 ? cid : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        },
    });

    // Rate limit BEFORE auth so unauthenticated floods are shed cheaply. Per-IP,
    // in-memory (single-instance; multi-instance needs a shared store — INFRA PENDING).
    const limiter = new RateLimiter({ capacity: 120, refillPerSec: 20 });
    app.addHook('onRequest', async (req, reply) => {
        reply.header('x-correlation-id', req.id); // echo so clients can report it
        metrics.activeRequests.add(1);
        if (req.url.startsWith('/health')) return; // never throttle probes
        if (!limiter.allow(req.ip)) throw new RateLimitedError();
    });

    // Structured completion log + request metrics. One line per request with
    // everything the 03:00 engineer needs: correlationId, tenant, route, status,
    // duration. (Fastify's own req/res lines carry req.id too.)
    app.addHook('onResponse', async (req, reply) => {
        metrics.activeRequests.add(-1);
        const route = req.routeOptions?.url ?? req.url.split('?')[0];
        const durationSec = reply.elapsedTime / 1000;
        metrics.httpRequests.inc({ method: req.method, route, status: String(reply.statusCode) });
        metrics.httpDuration.observe(durationSec, { method: req.method, route });
        const tenantId = (req as typeof req & { auth?: AuthContext }).auth?.tenantId;
        req.log.info({
            correlationId: req.id,
            tenantId,
            route,
            method: req.method,
            statusCode: reply.statusCode,
            duration_ms: Math.round(reply.elapsedTime),
        }, 'request_completed');
    });

    // Every error → a canonical, client-safe response + error telemetry.
    app.setErrorHandler((err, req, reply) => {
        const tenantId = (req as typeof req & { auth?: AuthContext }).auth?.tenantId;
        const ae = fromUnknown(err).withContext(req.id, tenantId);
        metrics.errors.inc({ code: ae.internalCode, status: String(ae.httpStatus), retryable: String(ae.retryable) });
        if (ae.httpStatus === 401) metrics.authFailures.inc();
        if (ae.internalCode === 'FORBIDDEN_TENANT_ACCESS') metrics.tenantForbidden.inc();
        req.log.error({
            err,
            correlationId: req.id,
            tenantId,
            errorCode: ae.internalCode,
            statusCode: ae.httpStatus,
            retryable: ae.retryable,
        }, 'request_error');
        reply.code(ae.httpStatus).send(ae.toResponse());
    });

    // Liveness: process is up. Readiness: dependencies healthy (gates traffic).
    // Both PUBLIC (auth skips /health*) and never rate limited.
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

    // Prometheus scrape endpoint — counts + latencies only (no ids/PII/secrets).
    app.get('/metrics', async (_req, reply) => reply.type('text/plain; version=0.0.4').send(metrics.registry.render()));

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
    registerStream(app, service, metrics);

    await app.listen({ port: config.port, host: '0.0.0.0' });

    // Startup diagnostics — exactly once, no secrets.
    let version = '0.0.0';
    try { version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version; } catch { /* keep default */ }
    app.log.info({
        version,
        gitCommit: process.env.GIT_COMMIT ?? 'unknown',
        environment: config.production ? 'production' : 'development',
        port: config.port,
        db: 'up',
        devMode: config.devMode,
        bootDuration_ms: Date.now() - bootStart,
    }, 'startup_complete');

    // Graceful shutdown — drain connections, close the pool, then exit.
    const shutdown = async (signal: string) => {
        const t0 = Date.now();
        app.log.info({ signal }, 'shutdown_started');
        try {
            await app.close();
            await pool.end();
            app.log.info({ shutdownDuration_ms: Date.now() - t0 }, 'shutdown_complete');
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
        console.error(`\n[config] ${e.message}\n`); // pre-logger: config failed, no app exists yet
    } else {
        console.error(e);
    }
    process.exit(1);
});

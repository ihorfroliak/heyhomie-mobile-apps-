/**
 * buildApp — the entire HTTP application, repo-injected. `index.ts` boots it
 * with the Postgres repo; the live integration test boots the SAME app over the
 * memory repo on a real socket. One construction path → what we test is what we
 * deploy.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import {
    makeOrderService, fromUnknown, AppError, RateLimiter, RateLimitedError,
    type AuthContext, type Role, type OrderRepo, type ServerConfig,
} from '@heyhomie/api';
import { registerRoutes, registerStream } from './routes.js';
import { authenticateRequest, signAuthToken } from './auth.js';
import { makeServerMetrics, type ServerMetrics } from './metrics.js';

export interface BuiltApp {
    app: FastifyInstance;
    metrics: ServerMetrics;
    /** Flip readiness to 503 (SIGTERM → LB stops routing + drains, then close). */
    beginShutdown: () => void;
}

export function buildApp(config: ServerConfig, repo: OrderRepo, checkDb: () => Promise<void>): BuiltApp {
    const metrics = makeServerMetrics();
    const service = makeOrderService(repo, metrics.serviceTelemetry);

    const app = Fastify({
        // Redact the bearer token from request logs; cap body size (DoS guard).
        // Residual: the SSE token rides in the query string (EventSource can't set
        // headers) so it may appear in access logs — bounded by the 15-min TTL.
        logger: { redact: ['req.headers.authorization', 'req.headers["x-dev-user"]', 'req.headers["x-dev-tenant"]'] },
        bodyLimit: 64 * 1024,
        // Behind a reverse proxy / LB (required for TLS), trust X-Forwarded-* so
        // req.ip is the REAL client IP — otherwise the rate limiter would bucket
        // every client under the single proxy IP (H1). Off for direct connections.
        trustProxy: config.trustProxy,
        // true = shutdown is ALWAYS bounded (never hangs on long-lived / reconnecting
        // SSE). In-flight requests are drained at the LB via the readiness flip
        // below (SIGTERM → /health/ready 503 → orchestrator stops routing + drains,
        // THEN close) — the standard k8s preStop pattern (Build 14).
        forceCloseConnections: true,
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
    const limiter = new RateLimiter({ capacity: config.rateCapacity, refillPerSec: config.rateRefillPerSec });
    app.addHook('onRequest', async (req, reply) => {
        reply.header('x-correlation-id', req.id); // echo so clients can report it
        // SSE hijacks the reply → onResponse never fires for it, so don't count it
        // in activeRequests (would leak); the sse_connections gauge tracks it instead.
        // Stamp what we incremented and decrement ONLY stamped requests — a 401/404
        // on the stream path DOES reach onResponse (not hijacked) and an
        // unconditional decrement would drift the gauge negative (Build 15).
        if (!req.url.startsWith('/orders/stream')) {
            metrics.activeRequests.add(1);
            (req as typeof req & { counted?: boolean }).counted = true;
        }
        if (req.url.startsWith('/health')) return; // never throttle probes
        if (!limiter.allow(req.ip)) throw new RateLimitedError();
    });

    // Structured completion log + request metrics.
    app.addHook('onResponse', async (req, reply) => {
        if ((req as typeof req & { counted?: boolean }).counted) metrics.activeRequests.add(-1);
        // Label cardinality guard: unmatched (404) requests have no routeOptions.url;
        // using the raw URL would let any scanner mint unbounded Prometheus series
        // (memory DoS — Build 15). All unmatched traffic shares one label.
        const route = req.routeOptions?.url ?? 'unmatched';
        metrics.httpRequests.inc({ method: req.method, route, status: String(reply.statusCode) });
        metrics.httpDuration.observe(reply.elapsedTime / 1000, { method: req.method, route });
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
    // Transport-level client errors (Fastify 413 body-too-large, 400 malformed
    // JSON, …) carry a 4xx statusCode but are NOT AppErrors — without this
    // mapping they'd be wrapped as 500 INTERNAL_ERROR, poisoning 5xx alerting
    // and lying to clients about retryability. (Found by the live HTTP test.)
    const toCanonical = (err: unknown): AppError => {
        if (err instanceof AppError) return err;
        const status = (err as { statusCode?: unknown }).statusCode;
        if (typeof status === 'number' && status >= 400 && status < 500) {
            return new AppError('TRANSPORT_CLIENT_ERROR', 'invalid_request', status, false, true, (err as Error).message, err);
        }
        return fromUnknown(err);
    };
    app.setErrorHandler((err, req, reply) => {
        const tenantId = (req as typeof req & { auth?: AuthContext }).auth?.tenantId;
        const ae = toCanonical(err).withContext(req.id, tenantId);
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
        // If bytes were already streamed (SSE / chunked), we can't send a fresh
        // status+body — writing headers again would throw ERR_HTTP_HEADERS_SENT.
        if (reply.raw.headersSent) { try { reply.raw.end(); } catch { /* already closed */ } return; }
        reply.code(ae.httpStatus).send(ae.toResponse());
    });

    // Liveness: process is up. Readiness: dependencies healthy (gates traffic).
    // Both PUBLIC (auth skips /health*) and never rate limited.
    let shuttingDown = false;
    app.get('/health/live', async () => ({ status: 'up' }));
    app.get('/health/ready', async (_req, reply) => {
        // While draining, report NOT ready so the LB/orchestrator stops routing.
        if (shuttingDown) return reply.code(503).send({ status: 'shutting_down' });
        try {
            await checkDb();
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

    // Graceful shutdown: SSE connections are long-lived and would block app.close()
    // forever. Track their sockets and end them on close, so in-flight requests
    // still drain cleanly (no forceCloseConnections → no dropped requests, Build 14).
    const sseSockets = new Set<{ end: () => void }>();
    app.addHook('onClose', async () => {
        for (const raw of sseSockets) { try { raw.end(); } catch { /* already closed */ } }
    });

    app.addHook('preHandler', authenticateRequest(config.authSecret, config.devMode));
    registerRoutes(app, service);
    registerStream(app, service, metrics, sseSockets);

    return { app, metrics, beginShutdown: () => { shuttingDown = true; } };
}

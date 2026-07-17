/**
 * HeyHomie orders backend — bootstrap. Validates config, connects Postgres,
 * builds the app (see app.ts — the same construction the live test exercises),
 * starts listening, handles graceful shutdown with diagnostics.
 */
import { readFileSync } from 'node:fs';
import { loadServerConfig, ConfigError } from '@heyhomie/api';
import { makePool, initSchema } from './db.js';
import { pgOrderRepo } from './pgRepo.js';
import { consoleNotificationPort } from '@heyhomie/api';
import { pgAuthRepo } from './pgAuthRepo.js';
import { pgAuditPort } from './pgAuditPort.js';
import { makeAuthCrypto } from './authCrypto.js';
import { buildApp } from './app.js';

async function main() {
    const bootStart = Date.now();
    // 1. Validate configuration — die before opening a port if anything is wrong.
    const config = loadServerConfig(process.env);

    // 2. Database + schema.
    const pool = makePool(config.databaseUrl);
    await pool.query('SELECT 1'); // startup DB reachability check (fail fast)
    await initSchema(pool);

    // 3. The application (routes, auth, metrics, hooks) — repo-injected. Auth
    //    issuer wired with real crypto (scrypt/HMAC) + the Postgres auth repo.
    // NotificationPort delivers invite/reset tokens. Console until a real provider
    // (SMTP/SES/SendGrid) implements the same port — the ONLY delivery abstraction.
    const authDeps = { repo: pgAuthRepo(pool), crypto: makeAuthCrypto(config.authSecret, config.accessTtlSec), notifications: consoleNotificationPort(), audit: pgAuditPort(pool) };
    const { app, beginShutdown, purgeExpired, revocations } = buildApp(config, pgOrderRepo(pool), async () => { await pool.query('SELECT 1'); }, authDeps);
    const DRAIN_MS = config.shutdownDrainMs; // validated at boot (fail-fast, C2)

    // Seed the RevocationIndex from durable state BEFORE serving (Build 29): a
    // restart must not resurrect access tokens of users disabled / sessions
    // deliberately revoked within the last access-TTL window. One bounded query.
    if (revocations) {
        const since = new Date(Date.now() - (config.accessTtlSec + 120) * 1000).toISOString();
        const recent = await authDeps.repo.listRecentRevocations(since);
        for (const u of recent.users) revocations.revokeUser(u.id, Math.floor(new Date(u.at).getTime() / 1000));
        for (const s of recent.sessions) revocations.revokeSession(s.id, Math.floor(new Date(s.at).getTime() / 1000));
    }

    await app.listen({ port: config.port, host: '0.0.0.0' });

    // Retention sweep (Build 28): purge expired auth rows so auth_sessions (grows one
    // row per refresh) + invitations + password_resets can't accumulate unbounded.
    // Best-effort; a sweep error is logged, never fatal. 0 = disabled.
    let purgeTimer: ReturnType<typeof setInterval> | undefined;
    if (purgeExpired && config.purgeIntervalSec > 0) {
        const sweep = async () => {
            try { app.log.info({ event: 'auth_purge', ...(await purgeExpired()) }, 'retention sweep'); }
            catch (e) { app.log.error({ event: 'auth_purge_failed' }, 'retention sweep failed'); void e; }
        };
        void sweep(); // once at boot
        purgeTimer = setInterval(() => void sweep(), config.purgeIntervalSec * 1000);
        purgeTimer.unref?.(); // never keep the process alive for the sweep
    }

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
    let shuttingDownStarted = false;
    const shutdown = async (signal: string) => {
        // Re-entrancy guard (Build 16 / C3): a second SIGTERM/SIGINT during the
        // drain window must not re-run app.close()/pool.end() (the 2nd pool.end()
        // rejects → false exit(1) racing the first exit(0)).
        if (shuttingDownStarted) { app.log.info({ signal }, 'shutdown_signal_ignored'); return; }
        shuttingDownStarted = true;
        const t0 = Date.now();
        app.log.info({ signal, drainMs: DRAIN_MS }, 'shutdown_started');
        if (purgeTimer) clearInterval(purgeTimer);
        try {
            // 1) flip readiness → 503 so the LB/orchestrator stops routing new traffic
            beginShutdown();
            // 2) grace window for in-flight requests to drain at the LB before we close
            await new Promise(r => setTimeout(r, DRAIN_MS));
            // 3) bounded close (forceCloseConnections:true → never hangs on SSE) + pool
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

/**
 * HeyHomie orders backend — bootstrap. Validates config, connects Postgres,
 * builds the app (see app.ts — the same construction the live test exercises),
 * starts listening, handles graceful shutdown with diagnostics.
 */
import { readFileSync } from 'node:fs';
import { loadServerConfig, ConfigError } from '@heyhomie/api';
import { makePool, initSchema } from './db.js';
import { pgOrderRepo } from './pgRepo.js';
import { buildApp } from './app.js';

async function main() {
    const bootStart = Date.now();
    // 1. Validate configuration — die before opening a port if anything is wrong.
    const config = loadServerConfig(process.env);

    // 2. Database + schema.
    const pool = makePool(config.databaseUrl);
    await pool.query('SELECT 1'); // startup DB reachability check (fail fast)
    await initSchema(pool);

    // 3. The application (routes, auth, metrics, hooks) — repo-injected.
    const { app } = buildApp(config, pgOrderRepo(pool), async () => { await pool.query('SELECT 1'); });

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

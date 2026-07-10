/** Postgres pool (tuned, H2) + schema via the versioned migration runner (H4). */
import { Pool } from 'pg';
import { runMigrations } from './migrate.js';

export function makePool(connectionString: string): Pool {
    return new Pool({
        connectionString,
        // H2 — bounded, fail-fast pool. Values justified:
        max: 10, //                       cap concurrent DB connections (single instance)
        connectionTimeoutMillis: 5_000, // give up acquiring a connection after 5s (fail fast, don't hang)
        idleTimeoutMillis: 30_000, //     reclaim idle connections after 30s
        statement_timeout: 10_000, //     kill any query running >10s (runaway-query guard)
        query_timeout: 10_000, //         client-side query cap (belt + suspenders)
    });
}

/** Apply pending migrations (advisory-locked, exactly-once). Name kept for callers. */
export async function initSchema(pool: Pool): Promise<void> {
    await runMigrations(pool);
}

/**
 * Versioned migrations (H4). Replaces bootstrap-only schema init with an
 * ordered, tracked, concurrency-safe runner:
 *  - `schema_migrations` records applied versions (exactly-once).
 *  - a Postgres advisory lock serializes concurrent app starts: one instance
 *    migrates while the others block, then see the work done and skip it.
 *  - each step is additive + idempotent (safe even against a pre-existing schema
 *    created by the old bootstrap path).
 * Add new schema changes ONLY by appending a higher-versioned migration.
 */
import type { Pool } from 'pg';

interface Migration { version: number; name: string; sql: string; }

// Advisory-lock key — an arbitrary constant unique to this app's migrations.
const MIGRATION_LOCK_KEY = 778241;

const MIGRATIONS: Migration[] = [
    {
        version: 1,
        name: 'orders_table',
        sql: `
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
                    CREATE TYPE order_status AS ENUM ('draft', 'confirmed', 'canceled', 'paid', 'settled');
                END IF;
            END $$;
            CREATE TABLE IF NOT EXISTS orders (
                id         text PRIMARY KEY,
                status     order_status NOT NULL,
                created_at timestamptz  NOT NULL DEFAULT now(),
                updated_at timestamptz  NOT NULL DEFAULT now(),
                payload    jsonb        NOT NULL
            );`,
    },
    {
        version: 2,
        name: 'tenant_column',
        sql: `
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';
            CREATE INDEX IF NOT EXISTS orders_tenant_idx ON orders (tenant_id);`,
    },
    {
        version: 3,
        name: 'version_and_check',
        sql: `
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
            ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_paid_not_canceled;
            ALTER TABLE orders ADD CONSTRAINT orders_paid_not_canceled
                CHECK (NOT (status = 'canceled' AND (payload->'payment'->>'status') = 'paid'));`,
    },
    {
        version: 4,
        name: 'tenant_created_index',
        sql: `CREATE INDEX IF NOT EXISTS orders_tenant_created_idx ON orders (tenant_id, created_at);`,
    },
    {
        // Build 18 — production auth. Users (credential holders) + revocable
        // refresh sessions. Additive; does not touch `orders`. Email + refresh_hash
        // are UNIQUE at the DB (enumeration/dedup guarantees don't rely on app code).
        version: 5,
        name: 'auth_users_and_sessions',
        sql: `
            CREATE TABLE IF NOT EXISTS users (
                id            text PRIMARY KEY,
                tenant_id     text        NOT NULL,
                email         text        NOT NULL UNIQUE,
                role          text        NOT NULL DEFAULT 'member',
                password_hash text        NOT NULL,
                password_salt text        NOT NULL,
                created_at    timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id           text PRIMARY KEY,
                user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                tenant_id    text        NOT NULL,
                role         text        NOT NULL,
                refresh_hash text        NOT NULL UNIQUE,
                expires_at   timestamptz NOT NULL,
                created_at   timestamptz NOT NULL DEFAULT now(),
                revoked_at   timestamptz
            );
            CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);`,
    },
];

export async function runMigrations(pool: Pool): Promise<number[]> {
    const client = await pool.connect();
    const applied: number[] = [];
    try {
        // Take the advisory lock FIRST — everything below (including creating the
        // tracking table) is then serialized across concurrent starts. Creating
        // schema_migrations outside the lock races two `CREATE TABLE IF NOT EXISTS`
        // on the pg_type catalog (found under concurrent-start test).
        await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
        const done = new Set<number>((await client.query('SELECT version FROM schema_migrations')).rows.map((r: { version: number }) => Number(r.version)));
        for (const m of MIGRATIONS) {
            if (done.has(m.version)) continue;
            await client.query('BEGIN');
            try {
                await client.query(m.sql);
                await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
                await client.query('COMMIT');
                applied.push(m.version);
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            }
        }
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
        client.release();
    }
    return applied;
}

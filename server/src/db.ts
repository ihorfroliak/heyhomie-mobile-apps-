/** Postgres pool + schema. Single `orders` table (per Build 04 scope). */
import { Pool } from 'pg';

export function makePool(connectionString: string): Pool {
    return new Pool({ connectionString });
}

export async function initSchema(pool: Pool): Promise<void> {
    await pool.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
                CREATE TYPE order_status AS ENUM ('draft', 'confirmed', 'canceled', 'paid', 'settled');
            END IF;
        END $$;
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id         text PRIMARY KEY,
            status     order_status NOT NULL,
            created_at timestamptz  NOT NULL DEFAULT now(),
            updated_at timestamptz  NOT NULL DEFAULT now(),
            payload    jsonb        NOT NULL
        );
    `);
    // Build 05 migration: tenant column (required, indexed) + index.
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'default';`);
    await pool.query(`CREATE INDEX IF NOT EXISTS orders_tenant_idx ON orders (tenant_id);`);
}

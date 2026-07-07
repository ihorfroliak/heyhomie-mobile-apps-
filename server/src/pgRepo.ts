/** Postgres-backed OrderRepo — every query is tenant-scoped. No unscoped SQL. */
import type { Pool } from 'pg';
import type { OrderRepo, ServerOrder } from '@heyhomie/api';

interface Row {
    id: string;
    tenant_id: string;
    status: ServerOrder['status'];
    created_at: string | Date;
    updated_at: string | Date;
    payload: ServerOrder['payload'];
}

const rowToOrder = (r: Row): ServerOrder => ({
    id: r.id,
    tenantId: r.tenant_id,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    payload: r.payload,
});

export function pgOrderRepo(pool: Pool): OrderRepo {
    return {
        async get(id, tenantId) {
            const r = await pool.query<Row>(
                'SELECT id, tenant_id, status, created_at, updated_at, payload FROM orders WHERE id = $1 AND tenant_id = $2',
                [id, tenantId],
            );
            return r.rows[0] ? rowToOrder(r.rows[0]) : undefined;
        },
        async put(o) {
            // tenant_id is written on insert and pinned on update (WHERE tenant_id)
            // so an update can never move a row across tenants.
            await pool.query(
                `INSERT INTO orders (id, tenant_id, status, created_at, updated_at, payload)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload
                 WHERE orders.tenant_id = EXCLUDED.tenant_id`,
                [o.id, o.tenantId, o.status, o.createdAt, o.updatedAt, JSON.stringify(o.payload)],
            );
        },
        async list(tenantId) {
            const r = await pool.query<Row>(
                'SELECT id, tenant_id, status, created_at, updated_at, payload FROM orders WHERE tenant_id = $1 ORDER BY created_at',
                [tenantId],
            );
            return r.rows.map(rowToOrder);
        },
    };
}

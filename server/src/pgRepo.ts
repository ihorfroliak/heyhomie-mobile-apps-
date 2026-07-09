/** Postgres-backed OrderRepo — tenant-scoped, optimistic-concurrency (version CAS). */
import type { Pool } from 'pg';
import { ConflictError, type OrderRepo, type ServerOrder } from '@heyhomie/api';

interface Row {
    id: string;
    tenant_id: string;
    version: number;
    status: ServerOrder['status'];
    created_at: string | Date;
    updated_at: string | Date;
    payload: ServerOrder['payload'];
}

const rowToOrder = (r: Row): ServerOrder => ({
    id: r.id,
    tenantId: r.tenant_id,
    version: Number(r.version),
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    payload: r.payload,
});

export function pgOrderRepo(pool: Pool): OrderRepo {
    return {
        async get(id, tenantId) {
            const r = await pool.query<Row>(
                'SELECT id, tenant_id, version, status, created_at, updated_at, payload FROM orders WHERE id = $1 AND tenant_id = $2',
                [id, tenantId],
            );
            return r.rows[0] ? rowToOrder(r.rows[0]) : undefined;
        },
        async insert(o) {
            await pool.query(
                `INSERT INTO orders (id, tenant_id, version, status, created_at, updated_at, payload)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [o.id, o.tenantId, o.version, o.status, o.createdAt, o.updatedAt, JSON.stringify(o.payload)],
            );
        },
        async update(o, expectedVersion) {
            // Atomic compare-and-swap: the row must still be at expectedVersion AND
            // in this tenant. 0 rows updated → someone else won → ConflictError.
            const r = await pool.query<Row>(
                `UPDATE orders
                    SET status = $1, updated_at = $2, payload = $3, version = version + 1
                  WHERE id = $4 AND tenant_id = $5 AND version = $6
              RETURNING id, tenant_id, version, status, created_at, updated_at, payload`,
                [o.status, o.updatedAt, JSON.stringify(o.payload), o.id, o.tenantId, expectedVersion],
            );
            if (r.rowCount === 0) throw new ConflictError('version conflict');
            return rowToOrder(r.rows[0]);
        },
        async list(tenantId) {
            const r = await pool.query<Row>(
                'SELECT id, tenant_id, version, status, created_at, updated_at, payload FROM orders WHERE tenant_id = $1 ORDER BY created_at',
                [tenantId],
            );
            return r.rows.map(rowToOrder);
        },
    };
}

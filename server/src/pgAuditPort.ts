/**
 * Postgres-backed AuditPort (Build 27). Append-only privileged-action log; the
 * full target email is stored (forensics) in this private, access-controlled
 * table — never a token/hash/password. Reads are tenant-scoped, newest first.
 */
import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { AuditEvent, AuditEventType, AuditEventView, AuditPort } from '@heyhomie/api';

interface AuditRow {
    type: AuditEventType; actor_user_id: string | null; target_email: string | null; created_at: string | Date;
}

export function pgAuditPort(pool: Pool): AuditPort {
    return {
        async record(e: AuditEvent) {
            await pool.query(
                `INSERT INTO audit_log (id, type, tenant_id, actor_user_id, target_user_id, target_email, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [crypto.randomUUID(), e.type, e.tenantId, e.actorUserId, e.targetUserId ?? null, e.targetEmail ?? null, e.at],
            );
        },
        async listByTenant(tenantId: string, limit = 100): Promise<AuditEventView[]> {
            const r = await pool.query<AuditRow>(
                'SELECT type, actor_user_id, target_email, created_at FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
                [tenantId, Math.max(1, Math.min(limit, 500))],
            );
            return r.rows.map(row => ({ type: row.type, actorUserId: row.actor_user_id, targetEmail: row.target_email, at: new Date(row.created_at).toISOString() }));
        },
    };
}

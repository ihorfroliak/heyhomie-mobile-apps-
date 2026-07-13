/**
 * Postgres-backed AuthRepo (Build 18). Users + revocable refresh sessions.
 * Email uniqueness + refresh-hash uniqueness are enforced at the DB (migration
 * v5); a duplicate-email insert surfaces as a canonical ConflictError.
 */
import type { Pool } from 'pg';
import { ConflictError, type AuthRepo, type AuthSession, type Invitation, type InviteRole, type Role, type User } from '@heyhomie/api';

interface UserRow {
    id: string; tenant_id: string; email: string; role: Role;
    password_hash: string; password_salt: string; created_at: string | Date;
}
interface SessionRow {
    id: string; user_id: string; tenant_id: string; role: Role;
    refresh_hash: string; expires_at: string | Date; created_at: string | Date; revoked_at: string | Date | null;
}
interface InviteRow {
    id: string; tenant_id: string; email: string; role: InviteRole; token_hash: string; invited_by: string;
    expires_at: string | Date; created_at: string | Date; accepted_at: string | Date | null; revoked_at: string | Date | null;
}
const toInvite = (r: InviteRow): Invitation => ({
    id: r.id, tenantId: r.tenant_id, email: r.email, role: r.role, tokenHash: r.token_hash, invitedByUserId: r.invited_by,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
});

const toUser = (r: UserRow): User => ({
    id: r.id, tenantId: r.tenant_id, email: r.email, role: r.role,
    passwordHash: r.password_hash, passwordSalt: r.password_salt,
    createdAt: new Date(r.created_at).toISOString(),
});
const toSession = (r: SessionRow): AuthSession => ({
    id: r.id, userId: r.user_id, tenantId: r.tenant_id, role: r.role,
    refreshHash: r.refresh_hash,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
});

export function pgAuthRepo(pool: Pool): AuthRepo {
    return {
        async findUserByEmail(email) {
            const r = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
            return r.rows[0] ? toUser(r.rows[0]) : undefined;
        },
        async findUserById(id) {
            const r = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
            return r.rows[0] ? toUser(r.rows[0]) : undefined;
        },
        async insertUser(u) {
            try {
                await pool.query(
                    `INSERT INTO users (id, tenant_id, email, role, password_hash, password_salt, created_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [u.id, u.tenantId, u.email, u.role, u.passwordHash, u.passwordSalt, u.createdAt],
                );
            } catch (e) {
                if ((e as { code?: string }).code === '23505') throw new ConflictError('email already registered'); // unique_violation
                throw e;
            }
        },
        async insertSession(s) {
            await pool.query(
                `INSERT INTO auth_sessions (id, user_id, tenant_id, role, refresh_hash, expires_at, created_at, revoked_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [s.id, s.userId, s.tenantId, s.role, s.refreshHash, s.expiresAt, s.createdAt, s.revokedAt],
            );
        },
        async findSessionByRefreshHash(hash) {
            const r = await pool.query<SessionRow>('SELECT * FROM auth_sessions WHERE refresh_hash = $1', [hash]);
            return r.rows[0] ? toSession(r.rows[0]) : undefined;
        },
        async revokeSession(id, at) {
            await pool.query('UPDATE auth_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL', [id, at]);
        },
        async revokeAllUserSessions(userId, at) {
            await pool.query('UPDATE auth_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, at]);
        },
        async insertInvitation(inv) {
            await pool.query(
                `INSERT INTO invitations (id, tenant_id, email, role, token_hash, invited_by, expires_at, created_at, accepted_at, revoked_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [inv.id, inv.tenantId, inv.email, inv.role, inv.tokenHash, inv.invitedByUserId, inv.expiresAt, inv.createdAt, inv.acceptedAt, inv.revokedAt],
            );
        },
        async findInvitationByTokenHash(hash) {
            const r = await pool.query<InviteRow>('SELECT * FROM invitations WHERE token_hash = $1', [hash]);
            return r.rows[0] ? toInvite(r.rows[0]) : undefined;
        },
        async findInvitationById(id) {
            const r = await pool.query<InviteRow>('SELECT * FROM invitations WHERE id = $1', [id]);
            return r.rows[0] ? toInvite(r.rows[0]) : undefined;
        },
        async markInvitationAccepted(id, at) {
            await pool.query('UPDATE invitations SET accepted_at = $2 WHERE id = $1 AND accepted_at IS NULL', [id, at]);
        },
        async revokeInvitation(id, at) {
            await pool.query('UPDATE invitations SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL', [id, at]);
        },
    };
}

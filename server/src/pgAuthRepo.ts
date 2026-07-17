/**
 * Postgres-backed AuthRepo (Build 18). Users + revocable refresh sessions.
 * Email uniqueness + refresh-hash uniqueness are enforced at the DB (migration
 * v5); a duplicate-email insert surfaces as a canonical ConflictError.
 */
import type { Pool } from 'pg';
import { ConflictError, type AuthRepo, type AuthSession, type Invitation, type InviteRole, type PasswordReset, type RevokedReason, type Role, type User } from '@heyhomie/api';

interface UserRow {
    id: string; tenant_id: string; email: string; role: Role;
    password_hash: string; password_salt: string; created_at: string | Date; disabled_at: string | Date | null;
}
interface SessionRow {
    id: string; user_id: string; tenant_id: string; role: Role;
    refresh_hash: string; expires_at: string | Date; created_at: string | Date;
    last_used_at: string | Date | null; device_label: string | null;
    revoked_at: string | Date | null; revoked_reason: RevokedReason | null;
}
interface ResetRow {
    id: string; user_id: string; email: string; token_hash: string;
    expires_at: string | Date; created_at: string | Date; used_at: string | Date | null;
}
const toReset = (r: ResetRow): PasswordReset => ({
    id: r.id, userId: r.user_id, email: r.email, tokenHash: r.token_hash,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    usedAt: r.used_at ? new Date(r.used_at).toISOString() : null,
});
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
    disabledAt: r.disabled_at ? new Date(r.disabled_at).toISOString() : null,
});
const toSession = (r: SessionRow): AuthSession => ({
    id: r.id, userId: r.user_id, tenantId: r.tenant_id, role: r.role,
    refreshHash: r.refresh_hash,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: new Date(r.last_used_at ?? r.created_at).toISOString(),
    deviceLabel: r.device_label ?? null,
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
    revokedReason: r.revoked_reason ?? null,
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
        async updateUserPassword(userId, hash, salt) {
            await pool.query('UPDATE users SET password_hash = $2, password_salt = $3 WHERE id = $1', [userId, hash, salt]);
        },
        async setUserDisabled(userId, at) {
            await pool.query('UPDATE users SET disabled_at = $2 WHERE id = $1', [userId, at]);
        },
        async deleteUserById(userId) {
            // auth_sessions + password_resets cascade (FK ON DELETE CASCADE).
            await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        },
        async listUsersByTenant(tenantId) {
            const r = await pool.query<UserRow>('SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at', [tenantId]);
            return r.rows.map(toUser);
        },
        async countOwners(tenantId) {
            const r = await pool.query<{ c: number }>(`SELECT count(*)::int AS c FROM users WHERE tenant_id = $1 AND role = 'owner'`, [tenantId]);
            return r.rows[0].c;
        },
        async revokeInvitationsByInviter(userId, at) {
            await pool.query('UPDATE invitations SET revoked_at = $2 WHERE invited_by = $1 AND accepted_at IS NULL AND revoked_at IS NULL', [userId, at]);
        },
        async insertSession(s) {
            await pool.query(
                `INSERT INTO auth_sessions (id, user_id, tenant_id, role, refresh_hash, expires_at, created_at, last_used_at, device_label, revoked_at, revoked_reason)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [s.id, s.userId, s.tenantId, s.role, s.refreshHash, s.expiresAt, s.createdAt, s.lastUsedAt, s.deviceLabel, s.revokedAt, s.revokedReason],
            );
        },
        async findSessionByRefreshHash(hash) {
            const r = await pool.query<SessionRow>('SELECT * FROM auth_sessions WHERE refresh_hash = $1', [hash]);
            return r.rows[0] ? toSession(r.rows[0]) : undefined;
        },
        async findSessionById(id) {
            const r = await pool.query<SessionRow>('SELECT * FROM auth_sessions WHERE id = $1', [id]);
            return r.rows[0] ? toSession(r.rows[0]) : undefined;
        },
        async listSessionsByUser(userId) {
            const r = await pool.query<SessionRow>('SELECT * FROM auth_sessions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
            return r.rows.map(toSession);
        },
        async revokeSession(id, at, reason) {
            await pool.query('UPDATE auth_sessions SET revoked_at = $2, revoked_reason = $3 WHERE id = $1 AND revoked_at IS NULL', [id, at, reason]);
        },
        async revokeAllUserSessions(userId, at, reason) {
            await pool.query('UPDATE auth_sessions SET revoked_at = $2, revoked_reason = $3 WHERE user_id = $1 AND revoked_at IS NULL', [userId, at, reason]);
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
        async listInvitationsByTenant(tenantId) {
            const r = await pool.query<InviteRow>('SELECT * FROM invitations WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
            return r.rows.map(toInvite);
        },
        async markInvitationAccepted(id, at) {
            await pool.query('UPDATE invitations SET accepted_at = $2 WHERE id = $1 AND accepted_at IS NULL', [id, at]);
        },
        async revokeInvitation(id, at) {
            await pool.query('UPDATE invitations SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL', [id, at]);
        },
        async insertPasswordReset(pr) {
            await pool.query(
                `INSERT INTO password_resets (id, user_id, email, token_hash, expires_at, created_at, used_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [pr.id, pr.userId, pr.email, pr.tokenHash, pr.expiresAt, pr.createdAt, pr.usedAt],
            );
        },
        async findPasswordResetByTokenHash(hash) {
            const r = await pool.query<ResetRow>('SELECT * FROM password_resets WHERE token_hash = $1', [hash]);
            return r.rows[0] ? toReset(r.rows[0]) : undefined;
        },
        async markPasswordResetUsed(id, at) {
            await pool.query('UPDATE password_resets SET used_at = $2 WHERE id = $1 AND used_at IS NULL', [id, at]);
        },
        async purgeExpiredSessions(before) {
            return (await pool.query('DELETE FROM auth_sessions WHERE expires_at < $1', [before])).rowCount ?? 0;
        },
        async purgeExpiredInvitations(before) {
            return (await pool.query('DELETE FROM invitations WHERE expires_at < $1', [before])).rowCount ?? 0;
        },
        async purgeExpiredPasswordResets(before) {
            return (await pool.query('DELETE FROM password_resets WHERE expires_at < $1', [before])).rowCount ?? 0;
        },
        async listRecentRevocations(since) {
            const users = await pool.query<{ id: string; at: string | Date }>(
                'SELECT id, disabled_at AS at FROM users WHERE disabled_at >= $1', [since]);
            const sessions = await pool.query<{ id: string; at: string | Date }>(
                `SELECT id, revoked_at AS at FROM auth_sessions WHERE revoked_at >= $1 AND revoked_reason = 'revoked'`, [since]);
            const iso = (r: { id: string; at: string | Date }) => ({ id: r.id, at: new Date(r.at).toISOString() });
            return { users: users.rows.map(iso), sessions: sessions.rows.map(iso) };
        },
    };
}

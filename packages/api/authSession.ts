/**
 * Production auth foundation — the PURE credential/session service (Build 18).
 *
 * Mirrors `orderService`: an authoritative engine with injected adapters, so the
 * security-critical logic (rotation, reuse detection, expiry, enumeration-safety)
 * is fully unit-testable in the gate with a deterministic fake — while the real
 * crypto (scrypt, HMAC, random) and Postgres stay server-side (node:crypto is NOT
 * bundled in RN; this module has none, same rule as `auth.ts`).
 *
 *   register/login → mint an ACCESS token (the existing HMAC token, unchanged) +
 *   a REFRESH token (opaque random, stored hashed, single-use, revocable).
 *   refresh → rotate (revoke old, issue new); a reused rotated token is a theft
 *   signal → revoke every session for that user. logout → revoke.
 *
 * Access authorization is unchanged: the access token still carries the same
 * AuthContext the service enforces tenancy with. Auth stays orthogonal to the
 * frozen OrderGateway contract.
 */
import type { AuthContext, Role } from './auth';
import { ValidationError, UnauthorizedError, ConflictError, ForbiddenError } from './errors';
import { nullAuditPort, type AuditPort, type AuditEvent, type AuditEventView } from './auditPort';

/** A credential-holder. `passwordHash`/`passwordSalt` are opaque to this module
 *  (the injected AuthCrypto owns their format). A user owns exactly one tenant. */
export interface User {
    id: string;
    tenantId: string;
    email: string;
    role: Role;
    passwordHash: string;
    passwordSalt: string;
    createdAt: string; // ISO
    disabledAt: string | null; // ISO when disabled, else null (Build 25)
}

/** Why a session was revoked (Build 24). `rotated` = consumed by a refresh (a
 *  replay of it is theft → nuke the family); `revoked` = deliberately killed
 *  (logout / user-revoked / password-reset) → a replay is just dead, NOT theft. */
export type RevokedReason = 'rotated' | 'revoked';

/** A refresh session — a server-side, revocable record. `refreshHash` is the
 *  sha256 of the opaque refresh token (the raw token never touches storage). */
export interface AuthSession {
    id: string;
    userId: string;
    tenantId: string;
    role: Role;
    refreshHash: string;
    expiresAt: string; // ISO
    createdAt: string; // ISO
    lastUsedAt: string; // ISO — refreshed each rotation (Build 24)
    deviceLabel: string | null; // optional client-supplied label (Build 24)
    revokedAt: string | null; // ISO or null (kept after rotation → reuse detection)
    revokedReason: RevokedReason | null;
}

/** Client-safe session summary (Build 24) — NEVER includes the refresh hash. */
export interface SessionView {
    id: string;
    createdAt: string;
    lastUsedAt: string;
    deviceLabel: string | null;
}

/** Client-safe member summary (Build 25) — the owner's roster; no password hashes. */
export interface MemberView {
    id: string;
    email: string;
    role: Role;
    status: 'active' | 'disabled';
    createdAt: string;
}

/** Client-safe invitation summary (Build 24) — NEVER includes the token hash. */
export interface InvitationView {
    id: string;
    email: string;
    role: InviteRole;
    status: 'pending' | 'accepted' | 'revoked' | 'expired';
    expiresAt: string;
    createdAt: string;
}

/** A password-reset offer (Build 24): opaque random token, sha256-stored,
 *  expiring, single-use. Never reveals whether the email exists. */
export interface PasswordReset {
    id: string;
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: string; // ISO
    createdAt: string; // ISO
    usedAt: string | null;
}

/** What an issuer hands back to a client. `expiresIn` = access-token TTL seconds. */
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    identity: AuthContext;
}

/** Roles an owner may hand out via an invite (never `owner`/`member`). */
export type InviteRole = 'admin' | 'worker';

/** A pending membership offer (Build 23). The raw invite token is returned to the
 *  owner ONCE; only its sha256 is stored. Single-use (`acceptedAt`), expiring,
 *  revocable. Bound to a tenant + email + role — the invitee can't change any of them. */
export interface Invitation {
    id: string;
    tenantId: string;
    email: string;
    role: InviteRole;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: string; // ISO
    createdAt: string; // ISO
    acceptedAt: string | null;
    revokedAt: string | null;
}

/** What the owner receives from `invite`. `inviteToken` is shared out-of-band with
 *  the invitee; `id` lets the owner revoke it. No tenant internals are exposed. */
export interface InviteResult {
    id: string;
    inviteToken: string;
    email: string;
    role: InviteRole;
    expiresIn: number;
}

/** Persistence port (users + sessions). Every impl is tenant-safe by construction:
 *  identity is resolved by credential, never by client-supplied tenant. */
export interface AuthRepo {
    findUserByEmail(email: string): Promise<User | undefined>;
    findUserById(id: string): Promise<User | undefined>;
    insertUser(u: User): Promise<void>;
    // Account lifecycle (Build 25).
    setUserDisabled(userId: string, at: string | null): Promise<void>;
    deleteUserById(userId: string): Promise<void>;
    listUsersByTenant(tenantId: string): Promise<User[]>;
    countOwners(tenantId: string): Promise<number>;
    /** Revoke all still-pending invitations created by a user (on their deletion). */
    revokeInvitationsByInviter(userId: string, at: string): Promise<void>;
    insertSession(s: AuthSession): Promise<void>;
    findSessionByRefreshHash(hash: string): Promise<AuthSession | undefined>;
    findSessionById(id: string): Promise<AuthSession | undefined>;
    listSessionsByUser(userId: string): Promise<AuthSession[]>;
    revokeSession(id: string, at: string, reason: RevokedReason): Promise<void>;
    /** Theft / global response: revoke every (still-live) session for a user. */
    revokeAllUserSessions(userId: string, at: string, reason: RevokedReason): Promise<void>;
    // Invitations (Build 23/24).
    insertInvitation(inv: Invitation): Promise<void>;
    findInvitationByTokenHash(hash: string): Promise<Invitation | undefined>;
    findInvitationById(id: string): Promise<Invitation | undefined>;
    listInvitationsByTenant(tenantId: string): Promise<Invitation[]>;
    markInvitationAccepted(id: string, at: string): Promise<void>;
    revokeInvitation(id: string, at: string): Promise<void>;
    // Password reset + password change (Build 24).
    updateUserPassword(userId: string, hash: string, salt: string): Promise<void>;
    insertPasswordReset(pr: PasswordReset): Promise<void>;
    findPasswordResetByTokenHash(hash: string): Promise<PasswordReset | undefined>;
    markPasswordResetUsed(id: string, at: string): Promise<void>;
    // Retention / GC (Build 28) — hard-delete capability rows past their expiry.
    // Safe: once `expiresAt < now`, a token can never validate (expiry is checked
    // before reuse), so the row is inert. Each returns the number of rows removed.
    purgeExpiredSessions(before: string): Promise<number>;
    purgeExpiredInvitations(before: string): Promise<number>;
    purgeExpiredPasswordResets(before: string): Promise<number>;
}

/** Crypto port — the ONLY place node:crypto is used (server-side impl). Injected
 *  so the pure service is testable with a deterministic fake. */
export interface AuthCrypto {
    /** Fresh opaque id (user id, session id, tenant id). */
    newId(): string;
    hashPassword(password: string): { hash: string; salt: string };
    verifyPassword(password: string, hash: string, salt: string): boolean;
    /** Mint the existing HMAC access token for an identity. */
    mintAccess(identity: AuthContext): { token: string; expiresIn: number };
    /** New refresh token + its storage hash. The raw token is returned to the
     *  client ONCE; only the hash is persisted. */
    newRefresh(): { token: string; hash: string };
    /** Hash a presented refresh token for lookup (must match `newRefresh().hash`). */
    hashRefresh(token: string): string;
}

export interface AuthServiceOptions {
    refreshTtlSec: number;
    inviteTtlSec?: number; // default 7 days — how long an invitation stays acceptable
    resetTtlSec?: number; // default 1 hour — how long a password-reset token is valid
    now?: () => number; // epoch ms (default Date.now) — injected for expiry tests
    minPasswordLength?: number; // default 8
    audit?: AuditPort; // privileged-action accountability sink (default null) — Build 27
}

export interface RegisterInput { email: string; password: string; deviceLabel?: string }
export interface LoginInput { email: string; password: string; deviceLabel?: string }
export interface InviteInput { email: string; role: InviteRole; }
export interface AcceptInviteInput { inviteToken: string; password: string; deviceLabel?: string }
export interface PasswordResetRequestInput { email: string; }
export interface PasswordResetConfirmInput { resetToken: string; password: string; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Constant-work decoy for a missing user: login always runs one password verify
// (against these if no user exists) so an unknown email and a wrong password take
// the same time — no timing side-channel to enumerate registered emails. The
// values just need to drive the same crypto work; they never match a real password.
const DECOY_SALT = 'ZGVjb3ktc2FsdA==';
const DECOY_HASH = 'A'.repeat(88); // ~64-byte base64 → full-length scrypt compare

function normalizeEmail(raw: unknown): string {
    if (typeof raw !== 'string') throw new ValidationError('email is required');
    const email = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) throw new ValidationError('invalid email');
    return email;
}

function requirePassword(raw: unknown, min: number): string {
    if (typeof raw !== 'string' || raw.length < min) throw new ValidationError(`password must be at least ${min} characters`);
    if (raw.length > 512) throw new ValidationError('password too long'); // scrypt DoS guard
    return raw;
}

export interface AuthService {
    register(input: RegisterInput): Promise<AuthTokens>;
    login(input: LoginInput): Promise<AuthTokens>;
    refresh(refreshToken: string): Promise<AuthTokens>;
    logout(refreshToken: string): Promise<void>;
    /** Owner invites a member to their tenant → one-time invite token (Build 23). */
    invite(input: InviteInput, auth: AuthContext): Promise<InviteResult>;
    /** Invitee sets their password once → user created in the tenant + logged in. */
    accept(input: AcceptInviteInput): Promise<AuthTokens>;
    /** Owner cancels a still-pending invitation in their tenant. */
    revokeInvite(inviteId: string, auth: AuthContext): Promise<void>;
    // ── Auth operations (Build 24) ──
    /** Owner/admin: list their tenant's invitations (no token hashes). */
    listInvitations(auth: AuthContext): Promise<InvitationView[]>;
    /** Request a password reset. Returns the token to deliver out-of-band (email),
     *  or null if no such user — the CALLER must respond identically either way. */
    requestPasswordReset(input: PasswordResetRequestInput): Promise<{ resetToken: string; email: string; expiresIn: number } | null>;
    /** Confirm a reset: set the new password + revoke ALL sessions (fresh login). */
    confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void>;
    /** List the CURRENT user's own live sessions (no refresh tokens). */
    listSessions(auth: AuthContext): Promise<SessionView[]>;
    /** Revoke one of the current user's OWN sessions (never another user's). */
    revokeSessionById(sessionId: string, auth: AuthContext): Promise<void>;
    // ── Account lifecycle (Build 25, owner-only) ──
    /** Owner: the tenant's member roster (no password hashes). */
    listMembers(auth: AuthContext): Promise<MemberView[]>;
    /** Owner: disable a member (not self) → immediately revokes all their sessions. */
    disableUser(userId: string, auth: AuthContext): Promise<void>;
    /** Owner: re-enable a disabled member. */
    enableUser(userId: string, auth: AuthContext): Promise<void>;
    /** Owner: permanently delete a member (not self, not the last owner) → revokes
     *  sessions + pending invitations, removes the account, preserves the tenant. */
    deleteUser(userId: string, auth: AuthContext): Promise<void>;
    /** Owner/admin: the tenant's privileged-action audit trail (no secrets). */
    listAuditEvents(auth: AuthContext, limit?: number): Promise<AuditEventView[]>;
    /** Maintenance (Build 28): hard-delete every capability row past its expiry
     *  (sessions / invitations / password-resets). Idempotent, no auth — it removes
     *  only inert rows and keeps live ones. Returns counts for observability. */
    purgeExpired(): Promise<PurgeResult>;
}

/** Rows removed by a retention sweep (Build 28). */
export interface PurgeResult { sessions: number; invitations: number; passwordResets: number; }

/**
 * The authoritative credential/session engine. Pure orchestration over the two
 * injected ports — no crypto, no I/O of its own.
 */
export function makeAuthService(repo: AuthRepo, crypto: AuthCrypto, opts: AuthServiceOptions): AuthService {
    const now = opts.now ?? (() => Date.now());
    const minPw = opts.minPasswordLength ?? 8;
    const inviteTtlSec = opts.inviteTtlSec ?? 604_800; // 7 days
    const resetTtlSec = opts.resetTtlSec ?? 3_600; // 1 hour
    const audit = opts.audit ?? nullAuditPort();
    const iso = (ms: number) => new Date(ms).toISOString();
    // Best-effort + ISOLATED: an audit-sink failure must never fail (or roll back)
    // the auth op. Events carry NO secrets (no token / hash / password).
    const emit = async (e: Omit<AuditEvent, 'at'>): Promise<void> => {
        try { await audit.record({ ...e, at: iso(now()) }); } catch { /* isolated */ }
    };
    const deviceLabelOf = (raw: unknown): string | null =>
        typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 100) : null;

    /** Create a fresh refresh session for an identity + mint the access token. */
    async function issue(identity: AuthContext, deviceLabel: string | null = null): Promise<AuthTokens> {
        const t = now();
        const { token: refreshToken, hash: refreshHash } = crypto.newRefresh();
        const session: AuthSession = {
            id: crypto.newId(),
            userId: identity.userId,
            tenantId: identity.tenantId,
            role: identity.role,
            refreshHash,
            expiresAt: iso(t + opts.refreshTtlSec * 1000),
            createdAt: iso(t),
            lastUsedAt: iso(t),
            deviceLabel,
            revokedAt: null,
            revokedReason: null,
        };
        await repo.insertSession(session);
        const access = crypto.mintAccess(identity);
        return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn, identity };
    }

    return {
        async register(input) {
            const email = normalizeEmail(input.email);
            const password = requirePassword(input.password, minPw);
            if (await repo.findUserByEmail(email)) throw new ConflictError('email already registered');
            const { hash, salt } = crypto.hashPassword(password);
            // Self-registration provisions a business: a new tenant, owned by its
            // creator (role `owner` — Build 23). Owners may later invite members.
            const user: User = {
                id: crypto.newId(),
                tenantId: crypto.newId(),
                email,
                role: 'owner',
                passwordHash: hash,
                passwordSalt: salt,
                createdAt: iso(now()),
                disabledAt: null,
            };
            await repo.insertUser(user);
            return issue({ userId: user.id, tenantId: user.tenantId, role: user.role }, deviceLabelOf(input.deviceLabel));
        },

        async login(input) {
            const email = normalizeEmail(input.email);
            const password = requirePassword(input.password, minPw);
            const user = await repo.findUserByEmail(email);
            // Enumeration-safe: ALWAYS run one verify (decoy hash when no user) so
            // unknown-email and wrong-password paths cost the same time. The `!user`
            // check gates the result, not whether the crypto work happens.
            const okPw = crypto.verifyPassword(password, user?.passwordHash ?? DECOY_HASH, user?.passwordSalt ?? DECOY_SALT);
            // A disabled account is rejected with the SAME generic 401 (no enumeration,
            // no "your account is disabled" leak). Sessions were revoked at disable time.
            if (!user || !okPw || user.disabledAt) throw new UnauthorizedError('invalid credentials');
            return issue({ userId: user.id, tenantId: user.tenantId, role: user.role }, deviceLabelOf(input.deviceLabel));
        },

        async refresh(refreshToken) {
            if (typeof refreshToken !== 'string' || !refreshToken) throw new UnauthorizedError('invalid refresh token');
            const hash = crypto.hashRefresh(refreshToken);
            const session = await repo.findSessionByRefreshHash(hash);
            const t = now();
            if (!session) throw new UnauthorizedError('invalid refresh token');
            if (session.revokedAt) {
                // Replay of a ROTATED token = theft → nuke the whole family. A token
                // for a DELIBERATELY-revoked session (logout / user-killed / reset) is
                // simply dead — reject it alone, so revoking one device leaves the rest.
                if (session.revokedReason === 'rotated') {
                    await repo.revokeAllUserSessions(session.userId, iso(t), 'revoked');
                    throw new UnauthorizedError('refresh token reuse detected');
                }
                throw new UnauthorizedError('invalid refresh token');
            }
            if (new Date(session.expiresAt).getTime() <= t) {
                await repo.revokeSession(session.id, iso(t), 'revoked');
                throw new UnauthorizedError('refresh token expired');
            }
            // Defense in depth: even though disable revokes all sessions, re-check the
            // user is still active before minting a new token (Build 25).
            const su = await repo.findUserById(session.userId);
            if (!su || su.disabledAt) throw new UnauthorizedError('invalid refresh token');
            // Single-use rotation: revoke the presented session, issue a fresh one
            // (carrying its device label forward).
            await repo.revokeSession(session.id, iso(t), 'rotated');
            return issue({ userId: session.userId, tenantId: session.tenantId, role: session.role }, session.deviceLabel);
        },

        async logout(refreshToken) {
            // Idempotent: unknown/blank token is a no-op (client is signed out either way).
            if (typeof refreshToken !== 'string' || !refreshToken) return;
            const session = await repo.findSessionByRefreshHash(crypto.hashRefresh(refreshToken));
            if (session && !session.revokedAt) await repo.revokeSession(session.id, iso(now()), 'revoked');
        },

        async invite(input, auth) {
            // Owner-only: an authenticated, in-tenant, but non-owner caller is forbidden.
            if (auth.role !== 'owner') throw new ForbiddenError('only the owner may invite members');
            const email = normalizeEmail(input.email);
            if (input.role !== 'admin' && input.role !== 'worker') throw new ValidationError('role must be admin or worker');
            if (await repo.findUserByEmail(email)) throw new ConflictError('a user with that email already exists');
            const t = now();
            const { token: inviteToken, hash: tokenHash } = crypto.newRefresh(); // reuse: opaque random + sha256
            const inv: Invitation = {
                id: crypto.newId(),
                tenantId: auth.tenantId, // bound to the OWNER's tenant — never client-supplied
                email,
                role: input.role,
                tokenHash,
                invitedByUserId: auth.userId,
                expiresAt: iso(t + inviteTtlSec * 1000),
                createdAt: iso(t),
                acceptedAt: null,
                revokedAt: null,
            };
            await repo.insertInvitation(inv);
            await emit({ type: 'member.invited', tenantId: auth.tenantId, actorUserId: auth.userId, targetEmail: email });
            return { id: inv.id, inviteToken, email, role: input.role, expiresIn: inviteTtlSec };
        },

        async accept(input) {
            if (typeof input.inviteToken !== 'string' || !input.inviteToken) throw new UnauthorizedError('invalid invitation');
            const password = requirePassword(input.password, minPw);
            const inv = await repo.findInvitationByTokenHash(crypto.hashRefresh(input.inviteToken));
            const t = now();
            // Generic 401s so a probe can't distinguish revoked / used / expired / bogus.
            if (!inv || inv.revokedAt || inv.acceptedAt || new Date(inv.expiresAt).getTime() <= t) {
                throw new UnauthorizedError('invalid or expired invitation');
            }
            const { hash, salt } = crypto.hashPassword(password);
            const user: User = {
                id: crypto.newId(),
                tenantId: inv.tenantId, // JOIN the inviter's tenant (from the invite, not the client)
                email: inv.email,
                role: inv.role,
                passwordHash: hash,
                passwordSalt: salt,
                createdAt: iso(t),
                disabledAt: null,
            };
            await repo.insertUser(user); // unique-email enforced (ConflictError on race)
            await repo.markInvitationAccepted(inv.id, iso(t)); // single-use
            await emit({ type: 'member.joined', tenantId: inv.tenantId, actorUserId: null, targetUserId: user.id, targetEmail: inv.email });
            return issue({ userId: user.id, tenantId: user.tenantId, role: user.role }, deviceLabelOf(input.deviceLabel));
        },

        async revokeInvite(inviteId, auth) {
            if (auth.role !== 'owner') throw new ForbiddenError('only the owner may revoke invitations');
            const inv = await repo.findInvitationById(inviteId);
            // Deny-by-default + tenant isolation: a cross-tenant id is treated as not-found.
            if (!inv || inv.tenantId !== auth.tenantId) throw new ForbiddenError('invitation not found');
            if (inv.acceptedAt) throw new ConflictError('cannot revoke an accepted invitation');
            if (!inv.revokedAt) {
                await repo.revokeInvitation(inv.id, iso(now()));
                await emit({ type: 'invitation.revoked', tenantId: auth.tenantId, actorUserId: auth.userId, targetEmail: inv.email });
            }
        },

        async listInvitations(auth) {
            // Owner or admin may see the tenant's roster of invites; workers/members may not.
            if (auth.role !== 'owner' && auth.role !== 'admin') throw new ForbiddenError('insufficient role');
            const t = now();
            const status = (inv: Invitation): InvitationView['status'] =>
                inv.acceptedAt ? 'accepted' : inv.revokedAt ? 'revoked' : new Date(inv.expiresAt).getTime() <= t ? 'expired' : 'pending';
            return (await repo.listInvitationsByTenant(auth.tenantId)).map(inv => ({
                id: inv.id, email: inv.email, role: inv.role, status: status(inv), expiresAt: inv.expiresAt, createdAt: inv.createdAt,
            })); // NB: tokenHash is intentionally never projected
        },

        async requestPasswordReset(input) {
            const email = normalizeEmail(input.email);
            const user = await repo.findUserByEmail(email);
            // Enumeration-safe: always do the same shape of work; only mint+persist a
            // token when the user exists AND is active. The CALLER responds identically.
            if (!user || user.disabledAt) return null;
            const t = now();
            const { token: resetToken, hash: tokenHash } = crypto.newRefresh(); // opaque random + sha256
            await repo.insertPasswordReset({
                id: crypto.newId(), userId: user.id, email: user.email, tokenHash,
                expiresAt: iso(t + resetTtlSec * 1000), createdAt: iso(t), usedAt: null,
            });
            return { resetToken, email: user.email, expiresIn: resetTtlSec };
        },

        async confirmPasswordReset(input) {
            if (typeof input.resetToken !== 'string' || !input.resetToken) throw new UnauthorizedError('invalid reset token');
            const password = requirePassword(input.password, minPw);
            const pr = await repo.findPasswordResetByTokenHash(crypto.hashRefresh(input.resetToken));
            const t = now();
            if (!pr || pr.usedAt || new Date(pr.expiresAt).getTime() <= t) throw new UnauthorizedError('invalid or expired reset token');
            const { hash, salt } = crypto.hashPassword(password);
            await repo.updateUserPassword(pr.userId, hash, salt);
            await repo.markPasswordResetUsed(pr.id, iso(t)); // single-use
            // Force a fresh login everywhere: revoke every existing session.
            await repo.revokeAllUserSessions(pr.userId, iso(t), 'revoked');
            const u = await repo.findUserById(pr.userId);
            if (u) await emit({ type: 'password.reset', tenantId: u.tenantId, actorUserId: null, targetUserId: u.id, targetEmail: u.email });
        },

        async listSessions(auth) {
            const live = (await repo.listSessionsByUser(auth.userId)).filter(s => !s.revokedAt);
            return live.map(s => ({ id: s.id, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, deviceLabel: s.deviceLabel }));
        },

        async revokeSessionById(sessionId, auth) {
            const s = await repo.findSessionById(sessionId);
            // Ownership is by userId — even an owner/admin cannot touch another user's
            // session. A missing / other-user id is denied identically (no leak).
            if (!s || s.userId !== auth.userId) throw new ForbiddenError('session not found');
            if (!s.revokedAt) await repo.revokeSession(s.id, iso(now()), 'revoked');
        },

        // ── Account lifecycle (Build 25). Owner-only; a target is resolved deny-by-
        // default and cross-tenant/missing/self are all rejected identically. ──
        async listMembers(auth) {
            if (auth.role !== 'owner' && auth.role !== 'admin') throw new ForbiddenError('insufficient role');
            return (await repo.listUsersByTenant(auth.tenantId)).map(u => ({
                id: u.id, email: u.email, role: u.role, status: u.disabledAt ? 'disabled' as const : 'active' as const, createdAt: u.createdAt,
            })); // NB: password hashes are never projected
        },

        async disableUser(userId, auth) {
            const target = await ownerTarget(userId, auth);
            await repo.setUserDisabled(target.id, iso(now()));
            // Kill access immediately: every live session is revoked.
            await repo.revokeAllUserSessions(target.id, iso(now()), 'revoked');
            await emit({ type: 'member.disabled', tenantId: auth.tenantId, actorUserId: auth.userId, targetUserId: target.id, targetEmail: target.email });
        },

        async enableUser(userId, auth) {
            const target = await ownerTarget(userId, auth);
            await repo.setUserDisabled(target.id, null); // re-enable; user must log in fresh
            await emit({ type: 'member.enabled', tenantId: auth.tenantId, actorUserId: auth.userId, targetUserId: target.id, targetEmail: target.email });
        },

        async deleteUser(userId, auth) {
            const target = await ownerTarget(userId, auth);
            // Never orphan a tenant: the last owner cannot be deleted.
            if (target.role === 'owner' && (await repo.countOwners(auth.tenantId)) <= 1) {
                throw new ForbiddenError('cannot delete the last owner');
            }
            const at = iso(now());
            await repo.revokeAllUserSessions(target.id, at, 'revoked'); // sessions dead
            await repo.revokeInvitationsByInviter(target.id, at); // their pending invites dead
            await repo.deleteUserById(target.id); // account removed; tenant + others intact
            await emit({ type: 'member.deleted', tenantId: auth.tenantId, actorUserId: auth.userId, targetUserId: target.id, targetEmail: target.email });
        },

        async listAuditEvents(auth, limit) {
            if (auth.role !== 'owner' && auth.role !== 'admin') throw new ForbiddenError('insufficient role');
            return audit.listByTenant(auth.tenantId, limit);
        },

        async purgeExpired() {
            const before = iso(now());
            const [sessions, invitations, passwordResets] = await Promise.all([
                repo.purgeExpiredSessions(before),
                repo.purgeExpiredInvitations(before),
                repo.purgeExpiredPasswordResets(before),
            ]);
            return { sessions, invitations, passwordResets };
        },
    };

    /** Owner-only target resolver: cross-tenant / missing / self are all denied the
     *  same way so existence never leaks across tenants (Build 25). */
    async function ownerTarget(userId: string, auth: AuthContext): Promise<User> {
        if (auth.role !== 'owner') throw new ForbiddenError('only the owner may manage accounts');
        if (userId === auth.userId) throw new ForbiddenError('cannot act on your own account');
        const target = await repo.findUserById(userId);
        if (!target || target.tenantId !== auth.tenantId) throw new ForbiddenError('user not found');
        return target;
    }
}

/** In-memory AuthRepo for tests / dev. NOT for production (no durability). */
export function memoryAuthRepo(): AuthRepo {
    const usersById = new Map<string, User>();
    const usersByEmail = new Map<string, User>();
    const sessionsById = new Map<string, AuthSession>();
    const sessionsByHash = new Map<string, AuthSession>();
    const invitesById = new Map<string, Invitation>();
    const invitesByHash = new Map<string, Invitation>();
    const resetsById = new Map<string, PasswordReset>();
    const resetsByHash = new Map<string, PasswordReset>();
    return {
        async findUserByEmail(email) { return usersByEmail.get(email); },
        async findUserById(id) { return usersById.get(id); },
        async insertUser(u) {
            if (usersByEmail.has(u.email)) throw new ConflictError('email already registered');
            usersById.set(u.id, u);
            usersByEmail.set(u.email, u);
        },
        async updateUserPassword(userId, hash, salt) {
            const u = usersById.get(userId);
            if (u) { u.passwordHash = hash; u.passwordSalt = salt; }
        },
        async setUserDisabled(userId, at) {
            const u = usersById.get(userId);
            if (u) u.disabledAt = at;
        },
        async deleteUserById(userId) {
            const u = usersById.get(userId);
            if (u) { usersById.delete(userId); usersByEmail.delete(u.email); }
        },
        async listUsersByTenant(tenantId) { return [...usersById.values()].filter(u => u.tenantId === tenantId); },
        async countOwners(tenantId) { return [...usersById.values()].filter(u => u.tenantId === tenantId && u.role === 'owner').length; },
        async revokeInvitationsByInviter(userId, at) {
            for (const inv of invitesById.values()) if (inv.invitedByUserId === userId && !inv.acceptedAt && !inv.revokedAt) inv.revokedAt = at;
        },
        async insertSession(s) {
            sessionsById.set(s.id, s);
            sessionsByHash.set(s.refreshHash, s);
        },
        async findSessionByRefreshHash(hash) { return sessionsByHash.get(hash); },
        async findSessionById(id) { return sessionsById.get(id); },
        async listSessionsByUser(userId) { return [...sessionsById.values()].filter(s => s.userId === userId); },
        async revokeSession(id, at, reason) {
            const s = sessionsById.get(id);
            if (s && !s.revokedAt) { s.revokedAt = at; s.revokedReason = reason; }
        },
        async revokeAllUserSessions(userId, at, reason) {
            for (const s of sessionsById.values()) if (s.userId === userId && !s.revokedAt) { s.revokedAt = at; s.revokedReason = reason; }
        },
        async insertInvitation(inv) {
            invitesById.set(inv.id, inv);
            invitesByHash.set(inv.tokenHash, inv);
        },
        async findInvitationByTokenHash(hash) { return invitesByHash.get(hash); },
        async findInvitationById(id) { return invitesById.get(id); },
        async listInvitationsByTenant(tenantId) { return [...invitesById.values()].filter(i => i.tenantId === tenantId); },
        async markInvitationAccepted(id, at) {
            const inv = invitesById.get(id);
            if (inv && !inv.acceptedAt) inv.acceptedAt = at;
        },
        async revokeInvitation(id, at) {
            const inv = invitesById.get(id);
            if (inv && !inv.revokedAt) inv.revokedAt = at;
        },
        async insertPasswordReset(pr) {
            resetsById.set(pr.id, pr);
            resetsByHash.set(pr.tokenHash, pr);
        },
        async findPasswordResetByTokenHash(hash) { return resetsByHash.get(hash); },
        async markPasswordResetUsed(id, at) {
            const pr = resetsById.get(id);
            if (pr && !pr.usedAt) pr.usedAt = at;
        },
        async purgeExpiredSessions(before) {
            let n = 0;
            for (const s of [...sessionsById.values()]) if (s.expiresAt < before) { sessionsById.delete(s.id); sessionsByHash.delete(s.refreshHash); n++; }
            return n;
        },
        async purgeExpiredInvitations(before) {
            let n = 0;
            for (const inv of [...invitesById.values()]) if (inv.expiresAt < before) { invitesById.delete(inv.id); invitesByHash.delete(inv.tokenHash); n++; }
            return n;
        },
        async purgeExpiredPasswordResets(before) {
            let n = 0;
            for (const pr of [...resetsById.values()]) if (pr.expiresAt < before) { resetsById.delete(pr.id); resetsByHash.delete(pr.tokenHash); n++; }
            return n;
        },
    };
}

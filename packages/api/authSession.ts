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
}

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
    revokedAt: string | null; // ISO or null (kept after rotation → reuse detection)
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
    insertSession(s: AuthSession): Promise<void>;
    findSessionByRefreshHash(hash: string): Promise<AuthSession | undefined>;
    revokeSession(id: string, at: string): Promise<void>;
    /** Theft response: revoke every (still-live) session for a user. */
    revokeAllUserSessions(userId: string, at: string): Promise<void>;
    // Invitations (Build 23).
    insertInvitation(inv: Invitation): Promise<void>;
    findInvitationByTokenHash(hash: string): Promise<Invitation | undefined>;
    findInvitationById(id: string): Promise<Invitation | undefined>;
    markInvitationAccepted(id: string, at: string): Promise<void>;
    revokeInvitation(id: string, at: string): Promise<void>;
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
    now?: () => number; // epoch ms (default Date.now) — injected for expiry tests
    minPasswordLength?: number; // default 8
}

export interface RegisterInput { email: string; password: string; }
export interface LoginInput { email: string; password: string; }
export interface InviteInput { email: string; role: InviteRole; }
export interface AcceptInviteInput { inviteToken: string; password: string; }

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
}

/**
 * The authoritative credential/session engine. Pure orchestration over the two
 * injected ports — no crypto, no I/O of its own.
 */
export function makeAuthService(repo: AuthRepo, crypto: AuthCrypto, opts: AuthServiceOptions): AuthService {
    const now = opts.now ?? (() => Date.now());
    const minPw = opts.minPasswordLength ?? 8;
    const inviteTtlSec = opts.inviteTtlSec ?? 604_800; // 7 days
    const iso = (ms: number) => new Date(ms).toISOString();

    /** Create a fresh refresh session for an identity + mint the access token. */
    async function issue(identity: AuthContext): Promise<AuthTokens> {
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
            revokedAt: null,
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
            };
            await repo.insertUser(user);
            return issue({ userId: user.id, tenantId: user.tenantId, role: user.role });
        },

        async login(input) {
            const email = normalizeEmail(input.email);
            const password = requirePassword(input.password, minPw);
            const user = await repo.findUserByEmail(email);
            // Enumeration-safe: ALWAYS run one verify (decoy hash when no user) so
            // unknown-email and wrong-password paths cost the same time. The `!user`
            // check gates the result, not whether the crypto work happens.
            const okPw = crypto.verifyPassword(password, user?.passwordHash ?? DECOY_HASH, user?.passwordSalt ?? DECOY_SALT);
            if (!user || !okPw) throw new UnauthorizedError('invalid credentials');
            return issue({ userId: user.id, tenantId: user.tenantId, role: user.role });
        },

        async refresh(refreshToken) {
            if (typeof refreshToken !== 'string' || !refreshToken) throw new UnauthorizedError('invalid refresh token');
            const hash = crypto.hashRefresh(refreshToken);
            const session = await repo.findSessionByRefreshHash(hash);
            const t = now();
            if (!session) throw new UnauthorizedError('invalid refresh token');
            // Reuse of an already-rotated (revoked) token = theft signal → nuke the
            // whole session family so the attacker AND victim are logged out.
            if (session.revokedAt) {
                await repo.revokeAllUserSessions(session.userId, iso(t));
                throw new UnauthorizedError('refresh token reuse detected');
            }
            if (new Date(session.expiresAt).getTime() <= t) {
                await repo.revokeSession(session.id, iso(t));
                throw new UnauthorizedError('refresh token expired');
            }
            // Single-use rotation: revoke the presented session, issue a fresh one.
            await repo.revokeSession(session.id, iso(t));
            return issue({ userId: session.userId, tenantId: session.tenantId, role: session.role });
        },

        async logout(refreshToken) {
            // Idempotent: unknown/blank token is a no-op (client is signed out either way).
            if (typeof refreshToken !== 'string' || !refreshToken) return;
            const session = await repo.findSessionByRefreshHash(crypto.hashRefresh(refreshToken));
            if (session && !session.revokedAt) await repo.revokeSession(session.id, iso(now()));
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
            };
            await repo.insertUser(user); // unique-email enforced (ConflictError on race)
            await repo.markInvitationAccepted(inv.id, iso(t)); // single-use
            return issue({ userId: user.id, tenantId: user.tenantId, role: user.role });
        },

        async revokeInvite(inviteId, auth) {
            if (auth.role !== 'owner') throw new ForbiddenError('only the owner may revoke invitations');
            const inv = await repo.findInvitationById(inviteId);
            // Deny-by-default + tenant isolation: a cross-tenant id is treated as not-found.
            if (!inv || inv.tenantId !== auth.tenantId) throw new ForbiddenError('invitation not found');
            if (!inv.revokedAt && !inv.acceptedAt) await repo.revokeInvitation(inv.id, iso(now()));
        },
    };
}

/** In-memory AuthRepo for tests / dev. NOT for production (no durability). */
export function memoryAuthRepo(): AuthRepo {
    const usersById = new Map<string, User>();
    const usersByEmail = new Map<string, User>();
    const sessionsById = new Map<string, AuthSession>();
    const sessionsByHash = new Map<string, AuthSession>();
    const invitesById = new Map<string, Invitation>();
    const invitesByHash = new Map<string, Invitation>();
    return {
        async findUserByEmail(email) { return usersByEmail.get(email); },
        async findUserById(id) { return usersById.get(id); },
        async insertUser(u) {
            if (usersByEmail.has(u.email)) throw new ConflictError('email already registered');
            usersById.set(u.id, u);
            usersByEmail.set(u.email, u);
        },
        async insertSession(s) {
            sessionsById.set(s.id, s);
            sessionsByHash.set(s.refreshHash, s);
        },
        async findSessionByRefreshHash(hash) { return sessionsByHash.get(hash); },
        async revokeSession(id, at) {
            const s = sessionsById.get(id);
            if (s && !s.revokedAt) s.revokedAt = at;
        },
        async revokeAllUserSessions(userId, at) {
            for (const s of sessionsById.values()) if (s.userId === userId && !s.revokedAt) s.revokedAt = at;
        },
        async insertInvitation(inv) {
            invitesById.set(inv.id, inv);
            invitesByHash.set(inv.tokenHash, inv);
        },
        async findInvitationByTokenHash(hash) { return invitesByHash.get(hash); },
        async findInvitationById(id) { return invitesById.get(id); },
        async markInvitationAccepted(id, at) {
            const inv = invitesById.get(id);
            if (inv && !inv.acceptedAt) inv.acceptedAt = at;
        },
        async revokeInvitation(id, at) {
            const inv = invitesById.get(id);
            if (inv && !inv.revokedAt) inv.revokedAt = at;
        },
    };
}

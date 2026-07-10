/**
 * Auth primitives — pure, no crypto (safe to bundle in RN). Token signing /
 * verification is the SERVER's trust boundary (server/src/auth.ts, node:crypto);
 * clients only carry an opaque token string.
 *
 * Tenancy is orthogonal to the order lifecycle: the service enforces it, the UI
 * never sees a tenant and cannot switch one. The OrderGateway contract is
 * unchanged — auth is injected at the adapter/transport, not the contract.
 */
export type Role = 'admin' | 'member';

export interface AuthContext {
    userId: string;
    tenantId: string;
    role: Role;
}

import { ForbiddenTenantError, UnauthorizedError } from './errors';

export const FORBIDDEN_TENANT_ACCESS = 'FORBIDDEN_TENANT_ACCESS';

/** Signed-token claims: identity + issued-at / expiry (epoch seconds). */
export interface TokenClaims extends AuthContext {
    iat: number;
    exp: number;
}

export interface VerifyTokenOptions {
    now?: number; // epoch seconds (default Date.now)
    clockSkewSec?: number; // tolerance for clock drift (default 60s)
}

/**
 * Validate decoded token claims — shape + expiry with clock-skew tolerance.
 * Pure (no crypto): the server verifies the HMAC first, then calls this. Throws
 * UnauthorizedError on ANY problem; the server maps every failure to a generic
 * 401 so the reason never leaks to the client. Rejects expired AND future-dated
 * tokens (replay window is bounded by `exp`).
 */
export function validateClaims(raw: unknown, opts: VerifyTokenOptions = {}): AuthContext {
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    const skew = opts.clockSkewSec ?? 60;
    if (!raw || typeof raw !== 'object') throw new UnauthorizedError('malformed token');
    const p = raw as Record<string, unknown>;
    if (typeof p.userId !== 'string' || !p.userId || typeof p.tenantId !== 'string' || !p.tenantId || (p.role !== 'admin' && p.role !== 'member')) {
        throw new UnauthorizedError('invalid token claims');
    }
    if (typeof p.iat !== 'number' || typeof p.exp !== 'number') throw new UnauthorizedError('token missing iat/exp');
    if (p.exp <= p.iat) throw new UnauthorizedError('token exp before iat');
    if (p.iat - skew > now) throw new UnauthorizedError('token used before issued'); // future-dated
    if (p.exp + skew < now) throw new UnauthorizedError('token expired');
    return { userId: p.userId, tenantId: p.tenantId, role: p.role };
}

/** Tenant-access denial — a canonical AppError (403). Message kept stable. */
export class AuthError extends ForbiddenTenantError {
    constructor(message: string = FORBIDDEN_TENANT_ACCESS) {
        super(message);
        this.name = 'AuthError';
    }
}

/**
 * Deny-by-default tenant guard for MUTATIONS. `o` comes from a tenant-scoped
 * read, so undefined means "not yours or not there" — both denied identically so
 * existence never leaks across tenants.
 */
export function requireOwned<T extends { tenantId: string }>(o: T | undefined, auth: AuthContext): T {
    if (!o || o.tenantId !== auth.tenantId) throw new AuthError(FORBIDDEN_TENANT_ACCESS);
    return o;
}

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

import { ForbiddenTenantError } from './errors';

export const FORBIDDEN_TENANT_ACCESS = 'FORBIDDEN_TENANT_ACCESS';

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

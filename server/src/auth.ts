/**
 * Server auth — the trust boundary. Opaque bearer tokens are HMAC-signed here
 * (node:crypto) so a spoofed header without a valid signature is rejected. Tokens
 * carry iat/exp and EXPIRE (validated via the pure `validateClaims`). Auth is
 * orthogonal: it never touches order business logic, only gates the request and
 * yields the AuthContext the service enforces tenancy with.
 *
 * Every failure → a generic 401 (UnauthorizedError) so the reason never leaks.
 * Minimal by design: no OAuth, no JWT lib, no DB sessions.
 */
import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { validateClaims, UnauthorizedError, type AuthContext, type Role, type TokenClaims, type VerifyTokenOptions, type RevocationIndex } from '@heyhomie/api';

export const DEFAULT_TTL_SEC = 900; // 15 min — bounds the replay window

export function signAuthToken(auth: AuthContext, secret: string, ttlSec: number = DEFAULT_TTL_SEC, sid?: string): string {
    const iat = Math.floor(Date.now() / 1000);
    const claims: TokenClaims = { ...auth, iat, exp: iat + ttlSec, ...(sid ? { sid } : {}) };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
}

/** Verify signature (timing-safe) THEN validate claims (expiry/skew/shape). Any
 *  failure → null (caller returns a generic 401). Also surfaces `iat`/`sid` so the
 *  caller can consult the RevocationIndex (Build 29). */
export function verifyAuthToken(token: string, secret: string, opts?: VerifyTokenOptions): (AuthContext & { iat: number; sid?: string }) | null {
    const dot = token.indexOf('.');
    if (dot < 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
        const auth = validateClaims(parsed, opts); // throws on expiry/malformed
        return { ...auth, iat: parsed.iat as number, ...(typeof parsed.sid === 'string' ? { sid: parsed.sid } : {}) };
    } catch {
        return null;
    }
}

// Public (pre-auth): health probes, /metrics (counts only), the dev token mint
// (dev-only), and the auth endpoints that ESTABLISH identity — register/login/
// refresh/logout/accept-invite. NOT every /auth/* route: `/auth/invite` is an
// authenticated, owner-only action (Build 23), so it must go through auth.
const PRE_AUTH_ROUTES = new Set([
    '/auth/register', '/auth/login', '/auth/refresh', '/auth/logout', '/auth/accept-invite',
    '/auth/password-reset/request', '/auth/password-reset/confirm', // Build 24: pre-auth by nature
]);
const isPublic = (url: string) => {
    if (url.startsWith('/health') || url.startsWith('/metrics') || url.startsWith('/dev/token')) return true;
    const path = url.split('?')[0];
    return PRE_AUTH_ROUTES.has(path);
};

/** Fastify preHandler: extract + verify identity, attach `req.auth`, else 401.
 *  With a RevocationIndex (Build 29), a cryptographically-valid but REVOKED token
 *  (disable/delete/reset/logout) is rejected with the SAME generic 401 — no
 *  "your token was revoked" oracle. O(1) in-memory check; the hot path stays DB-free. */
export function authenticateRequest(secret: string, devMode: boolean, revocations?: RevocationIndex) {
    return async (req: FastifyRequest, _reply: FastifyReply) => {
        if (isPublic(req.url)) return; // health probes + dev token are public

        const hdr = req.headers['authorization'];
        let token: string | undefined;
        if (typeof hdr === 'string' && hdr.startsWith('Bearer ')) token = hdr.slice(7);
        const q = req.query as { token?: string } | undefined;
        if (!token && typeof q?.token === 'string') token = q.token; // SSE via query

        if (token) {
            const auth = verifyAuthToken(token, secret);
            if (!auth) throw new UnauthorizedError('invalid or expired token');
            if (revocations?.isRevoked({ userId: auth.userId, sid: auth.sid, iat: auth.iat })) {
                throw new UnauthorizedError('invalid or expired token'); // generic — no revocation oracle
            }
            (req as FastifyRequest & { auth: AuthContext }).auth = { userId: auth.userId, tenantId: auth.tenantId, role: auth.role };
            return;
        }

        // Dev fallback (local only): explicit headers, still no unauthenticated access.
        if (devMode) {
            const t = req.headers['x-dev-tenant'];
            const u = req.headers['x-dev-user'];
            const r = req.headers['x-dev-role'];
            if (typeof t === 'string' && typeof u === 'string') {
                const role: Role = r === 'admin' ? 'admin' : 'member';
                (req as FastifyRequest & { auth: AuthContext }).auth = { tenantId: t, userId: u, role };
                return;
            }
        }
        throw new UnauthorizedError('unauthenticated');
    };
}

/** Read the AuthContext an authenticated request carries. */
export function reqAuth(req: FastifyRequest): AuthContext {
    return (req as FastifyRequest & { auth: AuthContext }).auth;
}

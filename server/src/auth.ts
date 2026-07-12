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
import { validateClaims, UnauthorizedError, type AuthContext, type Role, type TokenClaims, type VerifyTokenOptions } from '@heyhomie/api';

export const DEFAULT_TTL_SEC = 900; // 15 min — bounds the replay window

export function signAuthToken(auth: AuthContext, secret: string, ttlSec: number = DEFAULT_TTL_SEC): string {
    const iat = Math.floor(Date.now() / 1000);
    const claims: TokenClaims = { ...auth, iat, exp: iat + ttlSec };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
}

/** Verify signature (timing-safe) THEN validate claims (expiry/skew/shape). Any
 *  failure → null (caller returns a generic 401). */
export function verifyAuthToken(token: string, secret: string, opts?: VerifyTokenOptions): AuthContext | null {
    const dot = token.indexOf('.');
    if (dot < 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        return validateClaims(parsed, opts); // throws on expiry/malformed
    } catch {
        return null;
    }
}

// Public (pre-auth): health probes (orchestrators), /metrics (Prometheus scraper
// — counts only, no data), the auth issuer endpoints (register/login/refresh/
// logout — they establish identity, so they cannot require a token), and the
// dev token mint (dev-mode only route). All are still rate-limited.
const isPublic = (url: string) => url.startsWith('/health') || url.startsWith('/metrics') || url.startsWith('/auth/') || url.startsWith('/dev/token');

/** Fastify preHandler: extract + verify identity, attach `req.auth`, else 401. */
export function authenticateRequest(secret: string, devMode: boolean) {
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
            (req as FastifyRequest & { auth: AuthContext }).auth = auth;
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

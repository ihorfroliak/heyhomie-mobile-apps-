/**
 * Server auth — the trust boundary. Opaque bearer tokens are HMAC-signed here
 * (node:crypto) so a spoofed header without a valid signature is rejected. Auth
 * is orthogonal: it never touches order business logic, only gates the request
 * and yields the AuthContext the service enforces tenancy with.
 *
 * Minimal by design: no OAuth, no JWT refresh, no DB sessions (Build 05 scope).
 */
import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext, Role } from '@heyhomie/api';

export function signAuthToken(auth: AuthContext, secret: string): string {
    const body = Buffer.from(JSON.stringify(auth)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
}

export function verifyAuthToken(token: string, secret: string): AuthContext | null {
    const dot = token.indexOf('.');
    if (dot < 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<AuthContext>;
        if (typeof p.userId === 'string' && typeof p.tenantId === 'string' && (p.role === 'admin' || p.role === 'member')) {
            return { userId: p.userId, tenantId: p.tenantId, role: p.role };
        }
        return null;
    } catch {
        return null;
    }
}

/** Fastify preHandler: extract + verify identity, attach `req.auth`, else 401. */
export function authenticateRequest(secret: string, devMode: boolean) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
        if (req.url.startsWith('/healthz') || req.url.startsWith('/dev/token')) return; // public

        const hdr = req.headers['authorization'];
        let token: string | undefined;
        if (typeof hdr === 'string' && hdr.startsWith('Bearer ')) token = hdr.slice(7);
        const q = req.query as { token?: string } | undefined;
        if (!token && typeof q?.token === 'string') token = q.token; // SSE via query

        if (token) {
            const auth = verifyAuthToken(token, secret);
            if (!auth) return reply.code(401).send({ error: 'invalid token' });
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
        return reply.code(401).send({ error: 'unauthenticated' });
    };
}

/** Read the AuthContext an authenticated request carries. */
export function reqAuth(req: FastifyRequest): AuthContext {
    return (req as FastifyRequest & { auth: AuthContext }).auth;
}

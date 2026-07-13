/**
 * Client auth (Build 20) — the piece that lets the mobile apps talk to the real
 * backend. Turns the async, durable token store (`session.ts`) into the SYNC
 * `getToken()` the `httpOrderPort` needs, and owns the credential lifecycle
 * against the server's `/auth/*` issuer (Build 18):
 *
 *   register/login → hold the access token in memory + persist the refresh token
 *   refresh        → rotate (single-use) → new access, re-persist
 *   authFetch      → a `fetchImpl` wrapper: on 401, refresh once and retry, so
 *                    an expired access token is transparent to the gateway
 *   bootstrap      → on app start, mint a fresh access token from the stored
 *                    refresh token (no re-login) before the gateway connects
 *   logout         → revoke server-side + wipe local tokens
 *
 * Pure (no crypto) → RN-safe. The OrderGateway contract is untouched: this lives
 * entirely at the transport/composition layer.
 */
import { createSession, type SecureStore } from './session';
import { UnauthorizedError } from './errors';

type FetchLike = typeof fetch;

/** Wire shape returned by /auth/{register,login,refresh}. */
interface TokenResponse { accessToken: string; refreshToken: string; expiresIn: number; }

export interface AuthClientConfig {
    baseUrl: string;
    store: SecureStore;
    /** Injectable fetch (real global by default) — the raw transport, NOT authFetch. */
    fetchImpl?: FetchLike;
}

/** One-time invite an owner shares with a prospective member (Build 23). */
export interface InviteTokenResult { id: string; inviteToken: string; email: string; role: 'admin' | 'worker'; expiresIn: number; }

export interface AuthClient {
    /** Current access token (sync) — feed to `httpOrderPort({ getToken })`. */
    getToken(): string | undefined;
    /** fetchImpl for the port: refreshes + retries once on a 401. */
    authFetch: FetchLike;
    register(email: string, password: string): Promise<void>;
    login(email: string, password: string): Promise<void>;
    /** Rotate the refresh token → new access. Returns false if not refreshable. */
    refresh(): Promise<boolean>;
    /** App-start: fresh access token from the stored refresh token (or false). */
    bootstrap(): Promise<boolean>;
    logout(): Promise<void>;
    /** Owner action: invite a member → the one-time invite token (Build 23). */
    invite(email: string, role: 'admin' | 'worker'): Promise<InviteTokenResult>;
    /** Invitee action: set a password once → logged in as the new member. */
    acceptInvite(inviteToken: string, password: string): Promise<void>;
}

export function createAuthClient(cfg: AuthClientConfig): AuthClient {
    const base = cfg.baseUrl.replace(/\/$/, '');
    const f: FetchLike = cfg.fetchImpl ?? (globalThis.fetch as FetchLike);
    const session = createSession(cfg.store);
    let access: string | undefined;

    const post = (path: string, body: unknown): Promise<Response> =>
        f(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    // login/register: on success hold the access token + persist BOTH tokens.
    const establish = async (path: string, email: string, password: string): Promise<void> => {
        const res = await post(path, { email, password });
        if (!res.ok) throw new UnauthorizedError('authentication failed');
        const t = (await res.json()) as TokenResponse;
        access = t.accessToken;
        await session.setTokens(t);
    };

    const refresh = async (): Promise<boolean> => {
        const rt = await session.getRefreshToken();
        if (!rt) return false;
        const res = await post('/auth/refresh', { refreshToken: rt });
        if (!res.ok) { access = undefined; await session.clear(); return false; } // refresh dead → force re-login
        const t = (await res.json()) as TokenResponse;
        access = t.accessToken;
        await session.setTokens(t); // rotation: persist the new refresh token
        return true;
    };

    const authFetch: FetchLike = async (input, init) => {
        const res = await f(input, init);
        if (res.status !== 401) return res;
        // Access token likely expired — refresh once, then replay with the new token.
        if (!(await refresh())) return res;
        const headers = { ...((init?.headers as Record<string, string>) ?? {}), authorization: `Bearer ${access}` };
        return f(input, { ...init, headers });
    };

    return {
        getToken: () => access,
        authFetch,
        register: (email, password) => establish('/auth/register', email, password),
        login: (email, password) => establish('/auth/login', email, password),
        refresh,
        bootstrap: () => refresh(),
        async invite(email, role) {
            // Authenticated owner action → attach the bearer; authFetch refreshes on 401.
            const res = await authFetch(`${base}/auth/invite`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
                body: JSON.stringify({ email, role }),
            });
            if (!res.ok) throw new UnauthorizedError('invite failed');
            return (await res.json()) as InviteTokenResult;
        },
        async acceptInvite(inviteToken, password) {
            // Public: sets the member's password once and logs them in (persists tokens).
            const res = await post('/auth/accept-invite', { inviteToken, password });
            if (!res.ok) throw new UnauthorizedError('invite acceptance failed');
            const t = (await res.json()) as TokenResponse;
            access = t.accessToken;
            await session.setTokens(t);
        },
        async logout() {
            const rt = await session.getRefreshToken();
            if (rt) { try { await post('/auth/logout', { refreshToken: rt }); } catch { /* best-effort revoke */ } }
            access = undefined;
            await session.clear();
        },
    };
}

/* ── App-level singleton (env-selected gateway needs getToken/authFetch at load) ── */

let _client: AuthClient | undefined;

/** Wire the app's auth client once at startup (before `orderGateway.init`). */
export function configureAuth(cfg: AuthClientConfig): AuthClient {
    _client = createAuthClient(cfg);
    return _client;
}
export function getAuthClient(): AuthClient | undefined { return _client; }

const need = (): AuthClient => {
    if (!_client) throw new Error('auth not configured — call configureAuth({ baseUrl, store }) first');
    return _client;
};

/** Stable facade the env-selected http gateway binds to at module load. Delegates
 *  to the configured client; getToken/authFetch degrade gracefully pre-configure. */
export const auth = {
    getToken: (): string | undefined => _client?.getToken(),
    authFetch: (async (input, init) => (_client ? _client.authFetch(input, init) : (globalThis.fetch as FetchLike)(input, init))) as FetchLike,
    register: (email: string, password: string) => need().register(email, password),
    login: (email: string, password: string) => need().login(email, password),
    refresh: () => need().refresh(),
    bootstrap: () => need().bootstrap(),
    logout: () => need().logout(),
    invite: (email: string, role: 'admin' | 'worker') => need().invite(email, role),
    acceptInvite: (inviteToken: string, password: string) => need().acceptInvite(inviteToken, password),
};

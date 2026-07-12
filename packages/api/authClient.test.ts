/**
 * Build 20 — client auth (GATE). Exercises createAuthClient against a stateful
 * fake `/auth/*` server (single-use refresh rotation, bearer-checked protected
 * route): login/register, sync getToken, authFetch refresh-on-401 + retry,
 * rotation invalidation, logout wipe, bootstrap from a persisted refresh token.
 * Real HTTP + real crypto are proven separately in server/test/e2e.
 *
 * Run: npx -y tsx packages/api/authClient.test.ts
 */
import { createAuthClient } from './authClient';
import { memorySecureStore } from './session';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

/** Minimal in-memory issuer: mirrors the server's single-use rotation contract. */
function fakeServer(base: string) {
    let n = 0;
    const activeAccess = new Set<string>();
    const liveRefresh = new Set<string>();
    const issue = () => { const a = `acc${++n}`, r = `ref${n}`; activeAccess.add(a); liveRefresh.add(r); return { accessToken: a, refreshToken: r, expiresIn: 900 }; };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input).slice(base.length);
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, string> : {};
        if (path === '/auth/register' || path === '/auth/login') return json(issue(), path.endsWith('register') ? 201 : 200);
        if (path === '/auth/refresh') {
            const rt = body.refreshToken;
            if (rt && liveRefresh.has(rt)) { liveRefresh.delete(rt); return json(issue()); } // single-use
            return new Response(null, { status: 401 });
        }
        if (path === '/auth/logout') { if (body.refreshToken) liveRefresh.delete(body.refreshToken); return new Response(null, { status: 204 }); }
        if (path === '/protected') {
            const h = (init?.headers as Record<string, string>) ?? {};
            const tok = (h.authorization ?? '').replace('Bearer ', '');
            return activeAccess.has(tok) ? json({ ok: true }) : new Response(null, { status: 401 });
        }
        return new Response(null, { status: 404 });
    }) as typeof fetch;

    return { fetchImpl, expire: (tok: string | undefined) => { if (tok) activeAccess.delete(tok); } };
}

async function main() {
    const base = 'http://svc';
    const srv = fakeServer(base);
    const store = memorySecureStore();
    const client = createAuthClient({ baseUrl: base, store, fetchImpl: srv.fetchImpl });

    // not authenticated yet
    ok('no token before login', client.getToken() === undefined);
    ok('authFetch passes through 401 when unauthenticated', (await client.authFetch(`${base}/protected`, {})).status === 401);

    // login
    await client.login('a@b.co', 'password1');
    const tok1 = client.getToken();
    ok('login sets a sync access token', typeof tok1 === 'string');
    ok('login persists the refresh token', (await store.getItem('heyhomie.auth.refresh')) !== null);

    // protected call with the current token → 200
    const withTok = () => ({ headers: { authorization: `Bearer ${client.getToken()}` } });
    ok('valid access reaches a protected route', (await client.authFetch(`${base}/protected`, withTok())).status === 200);

    // simulate access-token expiry → authFetch must refresh + retry → 200, token rotated
    srv.expire(tok1);
    ok('expired token alone → server 401', (await srv.fetchImpl(`${base}/protected`, withTok())).status === 401);
    const retried = await client.authFetch(`${base}/protected`, { headers: { authorization: `Bearer ${tok1}` } });
    ok('authFetch refreshes on 401 and retries → 200', retried.status === 200);
    ok('access token rotated after refresh', client.getToken() !== tok1 && typeof client.getToken() === 'string');

    // bootstrap a fresh client seeded with the SAME persisted refresh-token value
    // (models re-opening the app / a second device) → mints a new access token.
    const currentRefresh = (await store.getItem('heyhomie.auth.refresh')) as string;
    const inherited = memorySecureStore();
    await inherited.setItem('heyhomie.auth.refresh', currentRefresh);
    const client2 = createAuthClient({ baseUrl: base, store: inherited, fetchImpl: srv.fetchImpl });
    ok('bootstrap mints access from stored refresh', (await client2.bootstrap()) === true && typeof client2.getToken() === 'string');
    // client2 consumed that token value (single-use) → the original client, still
    // holding the same now-rotated value, can no longer refresh with it.
    ok('reused refresh-token value is rejected (single-use)', (await client.refresh()) === false);

    // logout wipes local + server, subsequent protected call rejected
    await client2.logout();
    ok('logout clears the access token', client2.getToken() === undefined);
    ok('logout wipes the refresh token', (await store.getItem('heyhomie.auth.refresh')) === null);
    ok('after logout authFetch cannot refresh → 401', (await client2.authFetch(`${base}/protected`, {})).status === 401);

    // register path issues tokens too
    const store3 = memorySecureStore();
    const client3 = createAuthClient({ baseUrl: base, store, fetchImpl: srv.fetchImpl });
    await client3.register('new@b.co', 'password9');
    ok('register issues a usable access token', typeof client3.getToken() === 'string');
    void store3;

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All authClient tests passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

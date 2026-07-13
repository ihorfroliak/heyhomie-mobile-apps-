/**
 * Build 20 — END-TO-END integration. The real mobile-app path against a REAL
 * Fastify server: `createAuthClient` (client auth) + `makeHttpOrderGateway`/
 * `httpOrderPort` (the HTTP adapter) over genuine HTTP + SSE, real HMAC/scrypt
 * auth (server authCrypto), memory repos on a real socket. No fake backend, no
 * mocked HTTP — the exact composition the app `_layout` files wire at startup.
 *
 * Journey: register → tokens → app starts (gateway.init → SSE) → create order →
 * receive it via SSE → transition (complete/settle) via SSE → refresh token →
 * keep working → logout → requests rejected.
 *
 * Run: npx tsx server/test/e2e.test.ts
 */
import {
    createAuthClient, memorySecureStore, makeHttpOrderGateway, httpOrderPort,
    memoryOrderRepo, memoryAuthRepo, loadServerConfig, type Order,
} from '@heyhomie/api';
import { buildApp } from '../src/app.js';
import { makeAuthCrypto } from '../src/authCrypto.js';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const until = async (cond: () => boolean, ms = 3000): Promise<boolean> => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise(r => setTimeout(r, 25)); }
    return cond();
};

/** Minimal SSE client over fetch streams (runtime may lack EventSource). Reads the
 *  `?token=` URL the port builds — real SSE authorization over the wire. */
function sseShim(url: string) {
    const ctrl = new AbortController();
    const self = { onmessage: null as ((ev: { data: string }) => void) | null, onerror: null as ((e?: unknown) => void) | null, close: () => ctrl.abort() };
    void (async () => {
        try {
            const res = await fetch(url, { signal: ctrl.signal });
            const reader = (res.body as ReadableStream<Uint8Array>).getReader();
            const dec = new TextDecoder();
            let buf = '';
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                let i;
                while ((i = buf.indexOf('\n\n')) >= 0) {
                    const frame = buf.slice(0, i); buf = buf.slice(i + 2);
                    const data = frame.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
                    if (data) self.onmessage?.({ data });
                }
            }
        } catch (e) { if (!ctrl.signal.aborted) self.onerror?.(e); }
    })();
    return self;
}

async function main() {
    const AUTH_SECRET = 'e2e-test-secret-16chars-min';
    // Real server: real auth crypto (scrypt/HMAC), memory repos, real socket.
    const config = loadServerConfig({ DATABASE_URL: 'postgres://unused/e2e', AUTH_SECRET, PORT: '8092' });
    const authDeps = { repo: memoryAuthRepo(), crypto: makeAuthCrypto(AUTH_SECRET, config.accessTtlSec) };
    const { app } = buildApp(config, memoryOrderRepo(), async () => { /* memory db up */ }, authDeps);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

    // ── the app's real composition: client auth → http gateway (getToken + authFetch) ──
    const store = memorySecureStore();
    const authClient = createAuthClient({ baseUrl: base, store });
    const gateway = makeHttpOrderGateway(httpOrderPort({
        baseUrl: base,
        getToken: authClient.getToken,
        fetchImpl: authClient.authFetch,
        eventSource: sseShim as never,
        timeoutMs: 4000,
    }));

    // 0) FRESH APP STARTUP with no stored token → not authenticated, protected refused
    ok('fresh start: bootstrap with no stored token → not authenticated', (await authClient.bootstrap()) === false && authClient.getToken() === undefined);
    ok('fresh start: a protected read is 401 (no session)', (await authClient.authFetch(`${base}/orders`, {})).status === 401);

    // 1) REGISTER → receive tokens
    await authClient.register('owner@e2e.pl', 'Sup3rSecret!');
    const firstAccess = authClient.getToken();
    ok('register yields a sync access token', typeof firstAccess === 'string');
    ok('refresh token persisted to secure store', (await store.getItem('heyhomie.auth.refresh')) !== null);

    // 2) APP STARTS → gateway.init connects SSE (authorized by ?token=) → empty snapshot
    await gateway.init({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} });
    ok('SSE connects and delivers the initial (empty) snapshot', await until(() => gateway.ordersSnapshot().length === 0));

    // 3) CREATE ORDER → 4) receive it via SSE
    const created = await gateway.submitOrder({ contact: { phone: '600100200' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    const id = created.draft.id;
    ok('created order arrives back over SSE', await until(() => gateway.ordersSnapshot().some(o => o.id === id)));

    // transition through the real lifecycle, observed via SSE
    gateway.completeOrder(id, '2025-06-01T14:00:00.000Z');
    ok('completed status propagates via SSE', await until(() => gateway.ordersSnapshot().find(o => o.id === id)?.status === 'completed'));
    await gateway.settleOrder(id, '2025-06-02T03:00:00.000Z');
    ok('paid status propagates via SSE', await until(() => gateway.ordersSnapshot().find(o => o.id === id)?.status === 'paid'));

    // 5) REFRESH TOKEN → 6) continue working (rotated session authorizes new calls)
    const refreshBefore = await store.getItem('heyhomie.auth.refresh');
    const rotated = await authClient.refresh();
    const refreshAfter = await store.getItem('heyhomie.auth.refresh');
    // NB: two access tokens minted in the same second are byte-identical (HMAC over
    // second-granularity iat) — so we assert the single-use REFRESH token rotated.
    ok('refresh succeeds and rotates the refresh token', rotated === true && refreshAfter !== refreshBefore && typeof authClient.getToken() === 'string');
    void firstAccess;
    const created2 = await gateway.submitOrder({ contact: { phone: '600222333' }, cityId: 'warszawa', serviceId: 'office_cleaning' });
    ok('mutations keep working after refresh', await until(() => gateway.ordersSnapshot().some(o => o.id === created2.draft.id)));

    // ── WORKER DEVICE (Build 22): its own authClient + gateway, same tenant ──
    // The worker app is a separate client instance (own token store) that logs in,
    // sees the tenant's assigned jobs, completes one, and observes it settle to paid.
    const noopKv = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
    const workerClient = createAuthClient({ baseUrl: base, store: memorySecureStore() });
    await workerClient.login('owner@e2e.pl', 'Sup3rSecret!');
    ok('worker login yields a token', typeof workerClient.getToken() === 'string');
    const workerGw = makeHttpOrderGateway(httpOrderPort({ baseUrl: base, getToken: workerClient.getToken, fetchImpl: workerClient.authFetch, eventSource: sseShim as never, timeoutMs: 4000 }));
    await workerGw.init(noopKv);
    const jobId = created2.draft.id;
    ok('worker fetches the assigned job over SSE (confirmed)', await until(() => workerGw.ordersSnapshot().some(o => o.id === jobId && o.status === 'confirmed')));
    workerGw.completeOrder(jobId, '2025-06-03T10:00:00.000Z'); // worker marks the job done
    ok('worker status update propagates (completed)', await until(() => workerGw.ordersSnapshot().find(o => o.id === jobId)?.status === 'completed'));
    await gateway.settleOrder(jobId, '2025-06-03T12:00:00.000Z'); // client/admin settles payment
    ok('worker sees the paid confirmation', await until(() => workerGw.ordersSnapshot().find(o => o.id === jobId)?.status === 'paid'));
    await workerClient.logout();
    ok('worker logout clears its token', workerClient.getToken() === undefined);
    ok('worker request rejected after logout (401)', (await workerClient.authFetch(`${base}/orders`, {})).status === 401);

    // ── MEMBER INVITE over HTTP (Build 23): owner invites a worker into the tenant ──
    const invite = await authClient.invite('member@e2e.pl', 'worker');
    ok('owner receives a one-time invite token', typeof invite.inviteToken === 'string' && invite.role === 'worker' && !!invite.id);
    const member = createAuthClient({ baseUrl: base, store: memorySecureStore() });
    await member.acceptInvite(invite.inviteToken, 'MemberPass1!'); // sets password once → logged in
    ok('invited worker is authenticated after accepting', typeof member.getToken() === 'string');
    const memberGw = makeHttpOrderGateway(httpOrderPort({ baseUrl: base, getToken: member.getToken, fetchImpl: member.authFetch, eventSource: sseShim as never, timeoutMs: 4000 }));
    await memberGw.init(noopKv);
    ok('invited worker receives the tenant data (joined owner tenant)', await until(() => memberGw.ordersSnapshot().some(o => o.id === id)));
    let reuse = false;
    try { await member.acceptInvite(invite.inviteToken, 'MemberPass1!'); } catch { reuse = true; }
    ok('invitation cannot be reused over HTTP (single-use)', reuse);
    let ownerOnly = false;
    try { await member.invite('nope@e2e.pl', 'worker'); } catch { ownerOnly = true; }
    ok('invited worker cannot invite (owner-only) over HTTP', ownerOnly);
    await member.logout();

    // 7) LOGOUT → tokens gone → requests rejected
    await authClient.logout();
    ok('logout clears the access token', authClient.getToken() === undefined);
    ok('refresh token wiped from secure store', (await store.getItem('heyhomie.auth.refresh')) === null);
    let rejected = false;
    try { await gateway.submitOrder({ contact: { phone: '600999000' }, cityId: 'krakow', serviceId: 'standard_cleaning' }); }
    catch { rejected = true; }
    ok('after logout a mutation is rejected (401, no refresh possible)', rejected);
    // a direct authorized read is also refused
    ok('after logout a protected read is 401', (await authClient.authFetch(`${base}/orders`, {})).status === 401);

    await app.close();
    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All end-to-end integration tests passed.');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

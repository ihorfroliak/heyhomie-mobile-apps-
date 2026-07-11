/**
 * Build 10 — LIVE HTTP verification. Boots the REAL Fastify app (same buildApp
 * the production bootstrap uses) on a real socket with the memory repo, then
 * exercises it over genuine HTTP: the real httpOrderPort (fetch + SSE), real
 * multi-client sync, tenant isolation, canonical errors, health/metrics,
 * duplicate requests, client timeouts, graceful shutdown with open SSE.
 * Postgres-specific behaviour stays INFRA PENDING (Docker daemon required).
 *
 * Run: npx tsx server/test/live.test.ts
 */
import { memoryOrderRepo, makeHttpOrderGateway, httpOrderPort, loadServerConfig, type Order } from '@heyhomie/api';
import { buildApp } from '../src/app.js';
import { signAuthToken } from '../src/auth.js';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));
const until = async (cond: () => boolean, ms = 3000): Promise<boolean> => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise(r => setTimeout(r, 25)); }
    return cond();
};

/** Minimal SSE client over fetch streams (used if the runtime lacks EventSource). */
function sseShim(url: string) {
    const ctrl = new AbortController();
    const self = {
        onmessage: null as ((ev: { data: string }) => void) | null,
        onerror: null as ((ev?: unknown) => void) | null,
        close: () => ctrl.abort(),
    };
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
                let idx;
                while ((idx = buf.indexOf('\n\n')) >= 0) {
                    const frame = buf.slice(0, idx);
                    buf = buf.slice(idx + 2);
                    const data = frame.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
                    if (data) self.onmessage?.({ data });
                }
            }
        } catch (e) {
            if (!ctrl.signal.aborted) self.onerror?.(e);
        }
    })();
    return self;
}

async function main() {
    const AUTH_SECRET = 'live-test-secret-16chars-min';
    const bootT0 = Date.now();
    // PORT in config is validated (1..65535); the test listens on an ephemeral port explicitly.
    const config = loadServerConfig({ DATABASE_URL: 'postgres://unused/live', AUTH_SECRET, PORT: '8091', AUTH_DEV_MODE: '1' });
    const { app } = buildApp(config, memoryOrderRepo(), async () => { /* memory db always up */ });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const bootMs = Date.now() - bootT0;
    const addr = app.server.address() as { port: number };
    const base = `http://127.0.0.1:${addr.port}`;
    console.log(`  [perf] startup ${bootMs}ms on ${base}`);

    // ── PHASE 6: operational endpoints, live ──
    const t1st = Date.now();
    const live = await fetch(`${base}/health/live`);
    console.log(`  [perf] first request latency ${Date.now() - t1st}ms`);
    eq('live probe 200 public', live.status, 200);
    eq('ready probe 200 public', (await fetch(`${base}/health/ready`)).status, 200);
    const noTok = await fetch(`${base}/orders`);
    eq('no token → 401', noTok.status, 401);
    const body401 = await noTok.json() as Record<string, unknown>;
    eq('401 is canonical', [body401.error, body401.code, body401.retryable], ['unauthorized', 'UNAUTHENTICATED', false]);
    ok('401 carries requestId', typeof body401.requestId === 'string');
    const cid = 'live-corr-123';
    const echo = await fetch(`${base}/health/live`, { headers: { 'x-correlation-id': cid } });
    eq('correlation id echoed', echo.headers.get('x-correlation-id'), cid);

    // expired + tampered tokens over real HTTP
    const expired = signAuthToken({ userId: 'u', tenantId: 't1', role: 'member' }, AUTH_SECRET, -100);
    eq('expired token → 401', (await fetch(`${base}/orders`, { headers: { authorization: `Bearer ${expired}` } })).status, 401);
    const good = signAuthToken({ userId: 'u', tenantId: 't1', role: 'member' }, AUTH_SECRET);
    const tampered = good.slice(0, good.length - 4) + 'AAAA';
    eq('tampered token → 401', (await fetch(`${base}/orders`, { headers: { authorization: `Bearer ${tampered}` } })).status, 401);

    // invalid + oversized bodies
    const authHdr = { authorization: `Bearer ${good}`, 'content-type': 'application/json' };
    const bad = await fetch(`${base}/orders`, { method: 'POST', headers: authHdr, body: JSON.stringify({ nope: true }) });
    eq('invalid body → 400 canonical', [bad.status, ((await bad.json()) as { code: string }).code], [400, 'VALIDATION_FAILED']);
    const big = await fetch(`${base}/orders`, { method: 'POST', headers: authHdr, body: JSON.stringify({ pad: 'x'.repeat(70 * 1024) }) });
    ok('oversized body rejected 4xx (not 500)', big.status >= 400 && big.status < 500);

    // ── PHASE 3+4: real gateways, multi-client, SSE ──
    const esFactory = (url: string) => (typeof globalThis.EventSource === 'function' ? new EventSource(url) : sseShim(url));
    const mkGw = (tenant: string, role: 'admin' | 'member') => {
        const tok = signAuthToken({ userId: `${role}-${tenant}`, tenantId: tenant, role }, AUTH_SECRET);
        return makeHttpOrderGateway(httpOrderPort({ baseUrl: base, getToken: () => tok, eventSource: esFactory as never, timeoutMs: 4000 }));
    };
    const clientA = mkGw('t1', 'member');
    const adminT1 = mkGw('t1', 'admin');
    const clientB = mkGw('t2', 'member');
    const noopKv = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
    await clientA.init(noopKv); await adminT1.init(noopKv); await clientB.init(noopKv);
    ok('SSE initial snapshots arrive', await until(() => clientA.ordersSnapshot().length === 0 && adminT1.ordersSnapshot().length === 0));

    const r = await clientA.submitOrder({ contact: { phone: '600100200' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    const id = r.draft.id;
    ok('client A sees own order via SSE', await until(() => clientA.ordersSnapshot().some(o => o.id === id)));
    ok('admin (same tenant) sees it live', await until(() => adminT1.ordersSnapshot().some(o => o.id === id)));
    ok('tenant B sees NOTHING', !(await until(() => clientB.ordersSnapshot().length > 0, 700)));

    // real lifecycle over HTTP: complete → settle → paid, visible to the other client
    clientA.completeOrder(id, '2025-06-01T14:00:00.000Z');
    ok('completed propagates', await until(() => adminT1.ordersSnapshot().find(o => o.id === id)?.status === 'completed'));
    await adminT1.settleOrder(id, '2025-06-02T03:00:00.000Z');
    ok('paid propagates to client A', await until(() => clientA.ordersSnapshot().find(o => o.id === id)?.status === 'paid'));

    // duplicate + parallel settles over real HTTP → still exactly paid once
    await Promise.all([adminT1.settleOrder(id), adminT1.settleOrder(id), adminT1.settleOrder(id)]);
    const after = clientA.ordersSnapshot().find(o => o.id === id) as Order;
    eq('idempotent settle over HTTP', after.status, 'paid');

    // client-side timeout/abort against a live socket
    const slowGw = httpOrderPort({ baseUrl: 'http://127.0.0.1:9', getToken: () => good, timeoutMs: 300, retry: { maxRetries: 0, baseMs: 1, maxMs: 2, maxWindowMs: 400 } });
    let aborted = false;
    try { await slowGw.confirm('nope'); } catch { aborted = true; }
    ok('unreachable host aborts within timeout', aborted);

    // metrics reflect real traffic
    // D-A (Build 15): unmatched paths must NOT mint per-URL label series (cardinality DoS)
    await fetch(`${base}/zz-cardinality-probe-1`, { headers: authHdr });
    await fetch(`${base}/zz-cardinality-probe-2`, { headers: authHdr });
    // D-B (Build 15): 401 on the stream path fires onResponse without an increment —
    // the gauge must not drift negative.
    await fetch(`${base}/orders/stream`); // no token → 401, not hijacked
    const metricsText = await (await fetch(`${base}/metrics`)).text();
    ok('/metrics public + has request series', metricsText.includes('http_requests_total{'));
    ok('metrics count mutations', metricsText.includes('order_mutations_total{'));
    ok('metrics saw 401s', metricsText.includes('auth_failures_total') && /auth_failures_total (\d+)/.test(metricsText));
    ok('unmatched routes share one label (no cardinality explosion)', !metricsText.includes('zz-cardinality-probe') && metricsText.includes('route="unmatched"'));
    const activeGauge = Number(metricsText.match(/^active_requests (-?\d+)/m)?.[1]);
    ok('active_requests gauge never negative', Number.isFinite(activeGauge) && activeGauge >= 0);

    // 404 canonical over HTTP
    const nf = await fetch(`${base}/orders/does-not-exist`, { headers: authHdr });
    eq('missing order → 404 canonical', [nf.status, ((await nf.json()) as { code: string }).code], [404, 'NOT_FOUND']);

    // ── PHASE 5 (partial): graceful shutdown with OPEN SSE connections ──
    const tClose = Date.now();
    await app.close();
    const closeMs = Date.now() - tClose;
    console.log(`  [perf] graceful shutdown with open SSE: ${closeMs}ms`);
    ok('shutdown completes despite open SSE (<3s)', closeMs < 3000);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All live HTTP tests passed.');
    process.exit(0); // SSE shims may hold the loop — exit explicitly after green
}

main().catch(e => { console.error(e); process.exit(1); });

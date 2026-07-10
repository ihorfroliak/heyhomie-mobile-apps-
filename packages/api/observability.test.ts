/**
 * Observability: metrics registry correctness, service mutation/CAS telemetry,
 * gateway telemetry (retry/timeout/reconnect) + correlation-id propagation.
 * Run: npx -y tsx packages/api/observability.test.ts
 */
import { MetricsRegistry } from './metrics';
import { makeOrderService, memoryOrderRepo } from './orderService';
import { httpOrderPort, type TimerHost } from './httpOrderGateway';
import type { AuthContext } from './auth';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const auth: AuthContext = { userId: 'u', tenantId: 't', role: 'admin' };
type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const res = (status: number): Res => ({ ok: status < 400, status, json: async () => ({}) });

async function main() {
    // ── metrics registry ──
    {
        const reg = new MetricsRegistry();
        const c = reg.counter('http_requests_total', 'Total HTTP requests');
        const g = reg.gauge('active_requests', 'In-flight requests');
        const h = reg.histogram('http_request_duration_seconds', 'Latency', [0.1, 0.5, 1]);
        c.inc({ method: 'POST', route: '/orders', status: '200' });
        c.inc({ method: 'POST', route: '/orders', status: '200' });
        c.inc({ method: 'GET', route: '/orders', status: '200' });
        eq('counter per-label value', c.value({ method: 'POST', route: '/orders', status: '200' }), 2);
        eq('counter label isolation', c.value({ method: 'GET', route: '/orders', status: '200' }), 1);
        g.add(1); g.add(1); g.add(-1);
        eq('gauge add/sub', g.value(), 1);
        h.observe(0.05); h.observe(0.3); h.observe(2);
        eq('histogram count', h.count(), 3);
        const out = reg.render();
        ok('render has HELP/TYPE', out.includes('# HELP http_requests_total') && out.includes('# TYPE http_requests_total counter'));
        ok('render has labeled series', out.includes('http_requests_total{method="POST",route="/orders",status="200"} 2'));
        ok('render has +Inf bucket', out.includes('le="+Inf"} 3'));
        ok('render has histogram sum/count', out.includes('http_request_duration_seconds_count 3'));
    }

    // ── service telemetry: mutations + CAS conflicts + idempotent no-ops ──
    {
        const events: { op: string; applied: boolean; conflictRetries: number; tenantId: string }[] = [];
        const svc = makeOrderService(memoryOrderRepo(), { mutation: (i) => events.push(i) });
        const id = (await svc.create({ contact: { phone: '600' }, cityId: 'k', serviceId: 's' }, auth)).draft.id;
        eq('create emits telemetry', events.filter(e => e.op === 'create').length, 1);
        await svc.complete(id, auth, '2025-06-01T14:00:00.000Z');
        await Promise.all(Array.from({ length: 50 }, () => svc.settle(id, auth)));
        const settles = events.filter(e => e.op === 'settle');
        eq('every settle call emits telemetry', settles.length, 50);
        eq('exactly one settle applied a write', settles.filter(e => e.applied).length, 1);
        ok('losers recorded CAS conflict retries', settles.some(e => !e.applied && e.conflictRetries > 0));
        ok('telemetry carries tenantId', events.every(e => e.tenantId === 't'));
        await svc.settle(id, auth); // already paid → no-op
        ok('idempotent no-op emits applied:false', events[events.length - 1].applied === false);
    }

    // ── gateway telemetry: retry + timeout events, correlation header ──
    {
        const events: string[] = [];
        const seenHeaders: Record<string, string>[] = [];
        let calls = 0;
        const fetchImpl = (async (_url: unknown, init: { headers: Record<string, string> }) => {
            seenHeaders.push(init.headers);
            calls += 1;
            return calls < 3 ? res(503) : res(200);
        }) as unknown as typeof fetch;
        const port = httpOrderPort({
            baseUrl: 'http://x', getToken: () => 'tok', fetchImpl,
            retry: { baseMs: 1, maxMs: 2, maxWindowMs: 1000 },
            onTelemetry: (e) => events.push(e),
        });
        await port.confirm('o1');
        eq('retry telemetry emitted per retry', events.filter(e => e === 'retry').length, 2);
        ok('correlation header present on every attempt', seenHeaders.every(h => typeof h['x-correlation-id'] === 'string' && h['x-correlation-id'].length > 0));
        eq('same correlationId across retries of one call', new Set(seenHeaders.map(h => h['x-correlation-id'])).size, 1);
    }

    // ── gateway telemetry: SSE reconnect ──
    {
        const events: string[] = [];
        let seq = 0;
        const q = new Map<number, { due: number; fn: () => void }>();
        let clock = 0;
        const timers: TimerHost = {
            set: (fn, ms) => { const id = ++seq; q.set(id, { due: clock + ms, fn }); return id; },
            clear: (h) => { q.delete(h as number); },
            now: () => clock,
        };
        const advance = (ms: number) => { clock += ms; for (const [id, t] of [...q]) if (t.due <= clock) { q.delete(id); t.fn(); } };
        const instances: { onmessage: ((e: { data: string }) => void) | null; onerror: ((e?: unknown) => void) | null; close(): void }[] = [];
        const esFactory = () => { const es = { onmessage: null, onerror: null, close() {} }; instances.push(es); return es; };
        const port = httpOrderPort({ baseUrl: 'http://x', getToken: () => 't', timers, eventSource: esFactory, reconnectBaseMs: 10, reconnectMaxMs: 20, onTelemetry: (e) => events.push(e) });
        const stop = port.connect(() => {});
        instances[0].onerror?.();
        advance(50);
        eq('sse_reconnect telemetry emitted', events.filter(e => e === 'sse_reconnect').length, 1);
        stop();
    }

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All observability tests passed.');
}

main();

/**
 * httpOrderPort resilience wiring: retry idempotent ops, never retry create,
 * dedupe double-fire, and a self-healing SSE stream (reconnect on error, dead
 * connection via heartbeat, clean teardown). Fake fetch / EventSource / timers →
 * deterministic, no real waiting on the stream path.
 * Run with: npx -y tsx packages/api/httpPort.test.ts
 */
import { httpOrderPort, type TimerHost } from './httpOrderGateway';
import type { Order } from './orderContract';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const res = (status: number, body: unknown = {}): Res => ({ ok: status < 400, status, json: async () => body });

function fakeTimers() {
    let clock = 0;
    let seq = 0;
    const q = new Map<number, { due: number; fn: () => void }>();
    const host: TimerHost = {
        set: (fn, ms) => { const id = ++seq; q.set(id, { due: clock + ms, fn }); return id; },
        clear: (h) => { q.delete(h as number); },
        now: () => clock,
    };
    const advance = (ms: number) => {
        clock += ms;
        for (const [id, t] of [...q].sort((a, b) => a[1].due - b[1].due)) {
            if (t.due <= clock) { q.delete(id); t.fn(); }
        }
    };
    return { host, advance };
}

interface FakeES { url: string; onmessage: ((e: { data: string }) => void) | null; onerror: ((e?: unknown) => void) | null; closed: boolean; close(): void; }
function fakeEventSource() {
    const instances: FakeES[] = [];
    const factory = (url: string): FakeES => {
        const es: FakeES = { url, onmessage: null, onerror: null, closed: false, close() { this.closed = true; } };
        instances.push(es);
        return es;
    };
    return { factory, instances };
}

async function main() {
    // ── retry: idempotent op survives transient 503s ──
    {
        let calls = 0;
        const fetchImpl = (async () => { calls += 1; return calls < 3 ? res(503) : res(200); }) as unknown as typeof fetch;
        const port = httpOrderPort({ baseUrl: 'http://x', getToken: () => 't', fetchImpl, retry: { baseMs: 1, maxMs: 2, maxWindowMs: 1000 } });
        await port.confirm('o1');
        eq('idempotent op retried to success', calls, 3);
    }

    // ── create is NEVER retried (would duplicate orders) ──
    {
        let calls = 0;
        const fetchImpl = (async () => { calls += 1; return res(503); }) as unknown as typeof fetch;
        const port = httpOrderPort({ baseUrl: 'http://x', getToken: () => 't', fetchImpl, retry: { baseMs: 1, maxMs: 2, maxWindowMs: 1000 } });
        let threw = false;
        try { await port.submit({ contact: {}, cityId: 'k', serviceId: 's' }); } catch { threw = true; }
        ok('submit rejects on 5xx', threw);
        eq('submit NOT retried', calls, 1);
    }

    // ── dedupe: concurrent double-fire → one request ──
    {
        let calls = 0;
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const fetchImpl = (async () => { calls += 1; await gate; return res(200); }) as unknown as typeof fetch;
        const port = httpOrderPort({ baseUrl: 'http://x', getToken: () => 't', fetchImpl });
        const p1 = port.confirm('dup'); const p2 = port.confirm('dup');
        release();
        await Promise.all([p1, p2]);
        eq('concurrent confirm coalesced to 1 request', calls, 1);
    }

    // ── stream: reconnect on error, heartbeat-dead reconnect, clean teardown ──
    {
        const timers = fakeTimers();
        const es = fakeEventSource();
        const snaps: Order[][] = [];
        const port = httpOrderPort({
            baseUrl: 'http://x', getToken: () => 't', timers: timers.host, eventSource: es.factory,
            heartbeatMs: 1000, reconnectBaseMs: 100, reconnectMaxMs: 1000,
        });
        const disconnect = port.connect(s => snaps.push(s));
        eq('stream opens one connection', es.instances.length, 1);

        // healthy frame delivered
        es.instances[0].onmessage?.({ data: '[]' });
        eq('snapshot delivered from stream', snaps.length, 1);

        // error → schedule reconnect → new connection after backoff
        es.instances[0].onerror?.();
        ok('old connection closed on error', es.instances[0].closed);
        timers.advance(200);
        eq('reconnected after error', es.instances.length, 2);

        // heartbeat: no frames for > 2×window → dead → reconnect
        timers.advance(1000); // watch fires, not yet dead
        timers.advance(1500); // now stale > 2000ms → schedules reconnect
        timers.advance(500);  // reconnect backoff elapses → new connection
        ok('reconnected after heartbeat timeout', es.instances.length >= 3);

        // teardown: no reconnects after disconnect
        const beforeClose = es.instances.length;
        disconnect();
        ok('active connection closed on disconnect', es.instances[es.instances.length - 1].closed);
        timers.advance(10_000);
        eq('no reconnect after disconnect (no leak)', es.instances.length, beforeClose);
    }

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All httpPort resilience tests passed.');
}

main();

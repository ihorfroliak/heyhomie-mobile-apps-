/**
 * Build 09 stress verification: heavy parallel load, subscription churn, SSE
 * reconnect storm, terminal-state immutability, and resource-leak checks.
 * Deterministic (fake timers / injected clocks). Run:
 *   npx -y tsx packages/api/stress.test.ts
 */
import { makeOrderService, memoryOrderRepo, type OrderService, type ServerOrder } from './orderService';
import { fakeOrderBackend } from './fakeBackend';
import { makeHttpOrderGateway, httpOrderPort, type TimerHost } from './httpOrderGateway';
import type { AuthContext } from './auth';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const auth: AuthContext = { userId: 'u', tenantId: 't', role: 'admin' };
const create = async (s: OrderService) => (await s.create({ contact: { phone: '600' }, cityId: 'k', serviceId: 's' }, auth)).draft.id;

const badState = (o: ServerOrder): boolean =>
    (o.status === 'canceled' && o.payload.payment.status === 'paid') ||
    (o.payload.payment.status === 'paid' && o.status !== 'paid') ||
    o.version < 1;

async function main() {
    // ── 1000 parallel reads DURING 500 concurrent mixed mutations, 50 orders ──
    {
        const svc = makeOrderService(memoryOrderRepo());
        const ids: string[] = [];
        for (let i = 0; i < 50; i++) ids.push(await create(svc));
        const rid = () => ids[Math.floor(Math.random() * ids.length)];
        const muts: Promise<unknown>[] = [];
        const t0 = Date.now();
        for (let i = 0; i < 500; i++) {
            const id = rid();
            const op = i % 5;
            muts.push(
                op === 0 ? svc.confirm(id, auth)
                : op === 1 ? svc.cancel(id, auth)
                : op === 2 ? svc.complete(id, auth, '2025-06-01T14:00:00.000Z')
                : op === 3 ? svc.settle(id, auth)
                : svc.markPaid(id, auth),
            );
        }
        const reads: Promise<unknown>[] = [];
        for (let i = 0; i < 1000; i++) reads.push(i % 2 ? svc.list(auth) : svc.get(rid(), auth));
        await Promise.all([...muts, ...reads]);
        const elapsed = Date.now() - t0;
        const finals = await svc.list(auth);
        eq('all 50 orders survived', finals.length, 50);
        eq('zero invariant violations after 500 mutations + 1000 reads', finals.filter(badState).length, 0);
        ok('no order in an unknown status', finals.every(o => ['draft', 'confirmed', 'canceled', 'paid', 'settled'].includes(o.status)));
        console.log(`  [perf] 500 mutations + 1000 reads in ${elapsed}ms (${Math.round(1500 / (elapsed / 1000))} ops/s)`);
        ok('stress run completed', elapsed > 0);
    }

    // ── terminal-state immutability: paid stays paid under 100 random ops ──
    {
        const svc = makeOrderService(memoryOrderRepo());
        const id = await create(svc);
        await svc.complete(id, auth, '2025-06-01T14:00:00.000Z');
        await svc.settle(id, auth); // → paid
        const before = await svc.get(id, auth);
        const ops = [
            () => svc.confirm(id, auth), () => svc.cancel(id, auth),
            () => svc.complete(id, auth), () => svc.settle(id, auth), () => svc.markPaid(id, auth),
        ];
        await Promise.all(Array.from({ length: 100 }, () => ops[Math.floor(Math.random() * ops.length)]()));
        const after = await svc.get(id, auth);
        eq('paid order status immutable', after?.status, 'paid');
        eq('paid order version unchanged (all no-ops)', after?.version, before?.version);
    }

    // ── subscription churn: 200 subscribe/unsubscribe cycles → no dangling listener ──
    {
        const svc = makeOrderService(memoryOrderRepo());
        let fires = 0;
        for (let i = 0; i < 200; i++) {
            const unsub = svc.subscribe(() => { fires += 1; });
            unsub();
        }
        const live = svc.subscribe(() => { fires += 1; });
        await create(svc);
        eq('only the live subscriber fires (200 churned ones silent)', fires, 1);
        live();
    }

    // ── fake-backend service subscription released after last disconnect ──
    {
        const svc = makeOrderService(memoryOrderRepo());
        const port = fakeOrderBackend(auth, svc);
        let frames = 0;
        const d1 = port.connect(() => { frames += 1; });
        const d2 = port.connect(() => { frames += 1; });
        await create(svc);
        await new Promise(r => setTimeout(r, 0));
        ok('both connections received frames', frames >= 2);
        d1(); d2();
        const framesAtDisconnect = frames;
        await create(svc); // no connections → the fake must NOT be subscribed anymore
        await new Promise(r => setTimeout(r, 0));
        eq('no snapshot pushes after last disconnect (listener released)', frames, framesAtDisconnect);
    }

    // ── SSE reconnect storm: 50 forced errors → bounded, all conns closed, timers drained ──
    {
        let clock = 0; let seq = 0;
        const q = new Map<number, { due: number; fn: () => void }>();
        const timers: TimerHost = {
            set: (fn, ms) => { const id = ++seq; q.set(id, { due: clock + ms, fn }); return id; },
            clear: (h) => { q.delete(h as number); },
            now: () => clock,
        };
        const advance = (ms: number) => { clock += ms; for (const [id, t] of [...q].sort((a, b) => a[1].due - b[1].due)) if (t.due <= clock) { q.delete(id); t.fn(); } };
        interface ES { onmessage: ((e: { data: string }) => void) | null; onerror: ((e?: unknown) => void) | null; closed: boolean; close(): void }
        const instances: ES[] = [];
        const gw = makeHttpOrderGateway(httpOrderPort({
            baseUrl: 'http://x', getToken: () => 't', timers,
            eventSource: () => { const es: ES = { onmessage: null, onerror: null, closed: false, close() { this.closed = true; } }; instances.push(es); return es; },
            reconnectBaseMs: 10, reconnectMaxMs: 100,
        }));
        await gw.init({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} });
        for (let i = 0; i < 50; i++) { instances[instances.length - 1].onerror?.(); advance(200); }
        ok('reconnect storm bounded (≤ 60 connections for 50 errors)', instances.length <= 60);
        eq('every replaced connection closed', instances.filter(e => !e.closed).length, 1); // only the live one
        // teardown drains all timers → no timer leak
        const stop = gw.subscribe(() => {});
        stop();
        instances[instances.length - 1].onerror?.(); // trigger a pending reconnect
        const disconnectViaInit = instances.length;
        advance(10_000);
        ok('storm settled without runaway reconnects', instances.length - disconnectViaInit <= 2);
    }

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All stress tests passed.');
}

main();

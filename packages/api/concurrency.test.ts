/**
 * Data-integrity under concurrency. Proves the optimistic read-modify-write loop
 * gives exactly-once effects and preserves invariants under parallel load, plus
 * randomized (property) sequences. No infra — pure service + memory repo (which
 * models the DB's version CAS). Run: npx -y tsx packages/api/concurrency.test.ts
 */
import { makeOrderService, memoryOrderRepo, type OrderService, type ServerOrder } from './orderService';
import type { AuthContext } from './auth';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const auth: AuthContext = { userId: 'u', tenantId: 't', role: 'admin' };
const svc = (): OrderService => makeOrderService(memoryOrderRepo());
const newOrder = async (s: OrderService) => (await s.create({ contact: { phone: '600 000 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' }, auth)).draft.id;
const newDue = async (s: OrderService) => { const id = await newOrder(s); await s.complete(id, auth, '2025-06-01T14:00:00.000Z'); return id; };
const get = (s: OrderService, id: string) => s.get(id, auth) as Promise<ServerOrder>;

/** Invariants that must hold after ANY sequence of operations → list of breaks. */
function invariantBreaks(o: ServerOrder): string[] {
    const b: string[] = [];
    if (o.status === 'canceled' && o.payload.payment.status === 'paid') b.push('canceled+paid');
    if (o.payload.payment.status === 'paid' && o.status !== 'paid') b.push('paid-payment-without-paid-status');
    if (o.version < 1) b.push('version<1');
    if (!['draft', 'confirmed', 'canceled', 'paid', 'settled'].includes(o.status)) b.push('invalid-status');
    return b;
}

async function main() {
    // ── 100 parallel settle on one DUE order → exactly ONE charge ──
    {
        const s = svc();
        const id = await newDue(s); // create(v1) → complete(v2)
        await Promise.all(Array.from({ length: 100 }, () => s.settle(id, auth)));
        const o = await get(s, id);
        eq('100× settle → paid', o.status, 'paid');
        eq('100× settle → exactly one write (v3)', o.version, 3); // v2(complete) → v3(one settle)
    }

    // ── 100 parallel confirm on an already-confirmed order → zero spurious writes ──
    {
        const s = svc();
        const id = await newOrder(s); // v1 confirmed
        await Promise.all(Array.from({ length: 100 }, () => s.confirm(id, auth)));
        eq('100× confirm → no write (v1)', (await get(s, id)).version, 1);
    }

    // ── 100 parallel cancel → exactly one effective cancel ──
    {
        const s = svc();
        const id = await newOrder(s);
        await Promise.all(Array.from({ length: 100 }, () => s.cancel(id, auth)));
        const o = await get(s, id);
        eq('100× cancel → canceled', o.status, 'canceled');
        eq('100× cancel → exactly one write (v2)', o.version, 2);
    }

    // ── 100 parallel markPaid → exactly one payment ──
    {
        const s = svc();
        const id = await newOrder(s);
        await Promise.all(Array.from({ length: 100 }, () => s.markPaid(id, auth)));
        const o = await get(s, id);
        eq('100× markPaid → paid', o.status, 'paid');
        eq('100× markPaid → exactly one write (v2)', o.version, 2);
    }

    // ── mixed cancel/settle race → paid XOR canceled, never both (×50 rounds) ──
    {
        let bad = 0;
        for (let r = 0; r < 50; r++) {
            const s = svc();
            const id = await newDue(s);
            const ops = Array.from({ length: 100 }, (_, i) => (i % 2 ? s.cancel(id, auth) : s.settle(id, auth)));
            await Promise.all(ops);
            const o = await get(s, id);
            if (o.status === 'canceled' && o.payload.payment.status === 'paid') bad += 1;
            if (!['paid', 'canceled'].includes(o.status)) bad += 1;
        }
        eq('cancel/settle race never yields canceled+paid', bad, 0);
    }

    // ── explicit terminal invariants ──
    {
        const s = svc();
        const paid = await newDue(s);
        await s.settle(paid, auth); // → paid
        await s.cancel(paid, auth); // must be rejected (no un-pay)
        eq('cannot cancel a paid order', (await get(s, paid)).status, 'paid');

        const canceled = await newOrder(s);
        await s.cancel(canceled, auth);
        await s.complete(canceled, auth); // no-op
        await s.settle(canceled, auth); // no-op
        await s.markPaid(canceled, auth); // no-op — canceled cannot become paid
        const c = await get(s, canceled);
        eq('canceled stays canceled', c.status, 'canceled');
        ok('canceled never paid', c.payload.payment.status !== 'paid');
    }

    // ── property test: random op sequences preserve invariants (200 × 10 ops) ──
    {
        const kinds: ((s: OrderService, id: string) => Promise<unknown>)[] = [
            (s, id) => s.confirm(id, auth),
            (s, id) => s.cancel(id, auth),
            (s, id) => s.complete(id, auth, '2025-06-01T14:00:00.000Z'),
            (s, id) => s.settle(id, auth),
            (s, id) => s.markPaid(id, auth),
        ];
        let violations = 0;
        let versionRegressions = 0;
        for (let iter = 0; iter < 200; iter++) {
            const s = svc();
            const id = await newOrder(s);
            let prevVersion = 1;
            for (let step = 0; step < 10; step++) {
                await kinds[Math.floor(Math.random() * kinds.length)](s, id);
                const o = await get(s, id);
                violations += invariantBreaks(o).length;
                if (o.version < prevVersion) versionRegressions += 1;
                prevVersion = o.version;
            }
        }
        eq('property: 200×10 random ops → 0 invariant violations', violations, 0);
        eq('property: version never regresses', versionRegressions, 0);
    }

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.slice(0, 10).forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All concurrency/invariant/property tests passed.');
}

main();

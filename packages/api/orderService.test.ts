/**
 * Multi-tenant isolation + auth propagation. Proves the security boundary at the
 * service+repo layer (where the prompt requires it), independent of the gateway.
 * Run with: npx -y tsx packages/api/orderService.test.ts
 */
import { makeOrderService, memoryOrderRepo, type OrderRepo, type ServerOrder } from './orderService';
import { FORBIDDEN_TENANT_ACCESS, type AuthContext } from './auth';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));
async function expectForbidden(n: string, fn: () => Promise<unknown>) {
    try { await fn(); fail.push(`${n} (no throw)`); } catch (e) { (e as Error).message === FORBIDDEN_TENANT_ACCESS ? passed++ : fail.push(`${n} (wrong error: ${(e as Error).message})`); }
}

/** Repo spy — records the tenantId every query is scoped by. */
function spyRepo(inner: OrderRepo): { repo: OrderRepo; calls: { op: string; tenantId: string }[] } {
    const calls: { op: string; tenantId: string }[] = [];
    return {
        calls,
        repo: {
            get: (id, t) => { calls.push({ op: 'get', tenantId: t }); return inner.get(id, t); },
            put: (o: ServerOrder) => { calls.push({ op: 'put', tenantId: o.tenantId }); return inner.put(o); },
            list: (t) => { calls.push({ op: 'list', tenantId: t }); return inner.list(t); },
        },
    };
}

async function main() {
    const spy = spyRepo(memoryOrderRepo());
    const svc = makeOrderService(spy.repo);

    const authA: AuthContext = { userId: 'a', tenantId: 'T1', role: 'admin' };
    const authB: AuthContext = { userId: 'b', tenantId: 'T2', role: 'member' };

    const a = await svc.create({ contact: { phone: '600 111 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' }, authA);
    const b = await svc.create({ contact: { phone: '600 222 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' }, authB);
    const aId = a.draft.id;
    const bId = b.draft.id;

    // order carries its tenant
    eq('order A belongs to T1', (await svc.get(aId, authA))?.tenantId, 'T1');

    // reads are tenant-scoped — no cross-tenant visibility
    eq('A cannot read B order', await svc.get(bId, authA), undefined);
    eq('B cannot read A order', await svc.get(aId, authB), undefined);
    ok('A list sees only A', (await svc.list(authA)).every(o => o.tenantId === 'T1') && (await svc.list(authA)).length === 1);
    ok('B list sees only B', (await svc.list(authB)).every(o => o.tenantId === 'T2') && (await svc.list(authB)).length === 1);

    // mutations are deny-by-default across tenants → FORBIDDEN_TENANT_ACCESS
    await expectForbidden('A cannot cancel B order', () => svc.cancel(bId, authA));
    await expectForbidden('B cannot cancel A order', () => svc.cancel(aId, authB));
    await expectForbidden('B cannot settle A order', () => svc.settle(aId, authB));
    await expectForbidden('B cannot markPaid A order', () => svc.markPaid(aId, authB));
    await expectForbidden('mutating a missing id is also denied (no existence leak)', () => svc.confirm('ord-does-not-exist', authA));

    // same id namespace, isolated: A's id is invisible/immutable to B
    ok('A id invisible to B (shared PK namespace)', (await svc.get(aId, authB)) === undefined);

    // owner can still mutate their own — lifecycle intact under auth
    eq('A cancels own order', (await svc.cancel(aId, authA))?.status, 'canceled');
    eq('B completes own order', (await svc.complete(bId, authB, '2025-06-01T14:00:00Z'))?.status, 'settled');

    // no bleed: after cross ops, A still sees only A
    ok('no cross-tenant bleed after ops', (await svc.list(authA)).length === 1 && (await svc.list(authB)).length === 1);

    // auth propagation → repo: EVERY scoped query carried a tenantId, never blank,
    // and only the two known tenants appeared (no global/default scope leak).
    ok('every repo query is tenant-scoped', spy.calls.length > 0 && spy.calls.every(c => c.tenantId === 'T1' || c.tenantId === 'T2'));
    ok('no unscoped (blank) tenant reached the repo', spy.calls.every(c => c.tenantId.length > 0));

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All order-service tenant tests passed.');
}

main();

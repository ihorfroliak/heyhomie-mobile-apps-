/**
 * Contract tests for the OrderGateway. Adapter-agnostic: the order lifecycle is
 * run against BOTH the Local adapter and the Http adapter (backed by an
 * in-process fake of the real orders service). No import of bookingStore here —
 * proves the UI's dependency is testable without touching storage internals.
 * Run with: npx -y tsx packages/api/gateway.test.ts
 */
import { localOrderGateway, type OrderGateway } from './orderGateway';
import { makeHttpOrderGateway } from './httpOrderGateway';
import { fakeOrderBackend } from './fakeBackend';
import { memoryKeyValueStore } from './preferences';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));
/** Flush the async chain so stream-reconciled state is settled before asserting. */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

/**
 * The order lifecycle — asserted against the interface only, tick-based so it
 * works for a sync (Local) or eventually-consistent (Http/SSE) adapter alike.
 */
async function runOrderLifecycle(gw: OrderGateway, tag: string) {
    await gw.init(memoryKeyValueStore());
    await tick();

    // submit → get → state consistency
    const r1 = await gw.submitOrder({ contact: { phone: '600 111 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    const id = r1.draft.id;
    await tick();
    eq(`[${tag}] submit → confirmed`, gw.getOrder(id)?.status, 'confirmed');
    ok(`[${tag}] snapshot includes it`, gw.ordersSnapshot().some(o => o.id === id));
    ok(`[${tag}] getOrder matches snapshot entry`, JSON.stringify(gw.getOrder(id)) === JSON.stringify(gw.ordersSnapshot().find(o => o.id === id)));

    // confirm is idempotent (twice → still confirmed)
    gw.confirmOrder(id); gw.confirmOrder(id);
    await tick();
    eq(`[${tag}] confirm idempotent`, gw.getOrder(id)?.status, 'confirmed');

    // complete → settlement chain intact (payment due)
    gw.completeOrder(id, '2025-06-01T14:00:00.000Z');
    await tick();
    eq(`[${tag}] complete → completed`, gw.getOrder(id)?.status, 'completed');
    eq(`[${tag}] payment due after complete`, gw.getOrder(id)?.payment?.status, 'due');

    // settle → paid (card auto-charge), idempotent
    await gw.settleOrder(id, '2025-06-02T03:00:00.000Z');
    await tick();
    eq(`[${tag}] settle → paid`, gw.getOrder(id)?.status, 'paid');
    await gw.settleOrder(id, '2025-06-02T03:00:00.000Z');
    await tick();
    eq(`[${tag}] settle idempotent`, gw.getOrder(id)?.status, 'paid');

    // cancel → transition correctness, idempotent
    const r2 = await gw.submitOrder({ contact: { phone: '600 222 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    await tick();
    gw.cancelOrder(r2.draft.id); gw.cancelOrder(r2.draft.id);
    await tick();
    eq(`[${tag}] cancel → canceled`, gw.getOrder(r2.draft.id)?.status, 'canceled');

    // markPaid → order settled by admin
    const r3 = await gw.submitOrder({ contact: { phone: '600 333 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    await tick();
    gw.markPaid(r3.draft.id);
    await tick();
    eq(`[${tag}] markPaid → paid`, gw.getOrder(r3.draft.id)?.status, 'paid');

    // change feed: a subscriber fires on mutation
    let events = 0;
    const unsub = gw.subscribe(() => { events += 1; });
    const before = events;
    await gw.submitOrder({ contact: { phone: '600 555 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    await tick();
    ok(`[${tag}] change feed emits on mutation`, events > before);
    unsub();

    // reactive snapshot is a STABLE reference between reads
    ok(`[${tag}] snapshot stable ref`, gw.ordersSnapshot() === gw.ordersSnapshot());
}

async function main() {
    // Same lifecycle, two adapters — the drop-in guarantee. The fake carries a
    // session AuthContext (one tenant), transparent to the gateway/contract.
    await runOrderLifecycle(localOrderGateway, 'local');
    const devAuth = { userId: 'u-test', tenantId: 't-test', role: 'admin' as const };
    const http = makeHttpOrderGateway(fakeOrderBackend(devAuth));
    await runOrderLifecycle(http, 'http');

    // Leads are out of the orders-backend scope; local keeps the funnel op.
    const lead = await localOrderGateway.captureLead({ phone: '600 444 000', serviceId: 'office_cleaning', cityId: 'warszawa' });
    ok('local captures leads', localOrderGateway.leadsSnapshot().some(l => l.id === lead.id));
    let httpLeadRejected = false;
    try { await http.captureLead({ phone: '1', serviceId: 'office_cleaning', cityId: 'warszawa' }); } catch { httpLeadRejected = true; }
    ok('http rejects leads (out of scope)', httpLeadRejected);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All gateway contract tests passed.');
}

main();

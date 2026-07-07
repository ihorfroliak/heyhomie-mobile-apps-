/** Run with: npx -y tsx packages/api/bookingStore.test.ts */
import { submitBooking, submitLeadCallback, settlePayment, paymentForOrder, completeOrder, runNightlyCharges, markOrderPaidByAdmin, initBookingStore, resetBookingStore, getStoreDrafts, getStoreLeads, getStoreAccounts, getStorePayments, subscribeBookings } from './bookingStore';
import { memoryKeyValueStore } from './preferences';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

async function main() {
    let notified = 0;
    const unsub = subscribeBookings(() => notified++);

    // New contact → account created with default name, confirmed draft recorded.
    const r1 = await submitBooking({ contact: { phone: '700 111 222' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    ok('new contact creates an account', r1.isNewAccount);
    eq('name defaults to Friend', r1.account.firstName, 'Friend');
    eq('phone stored normalized', r1.account.phone, '+48700111222');
    eq('draft is confirmed', r1.draft.stage, 'confirmed');
    ok('draft visible in snapshot', getStoreDrafts().some(d => d.id === r1.draft.id));
    ok('subscriber notified', notified >= 1);
    eq('nothing charged at booking', [r1.payment.method, r1.payment.status], ['card', 'awaiting_completion']);

    // Card booking → mission completed → nightly run auto-charges via Stripe.
    completeOrder(r1.draft.id, '2025-06-01T14:00:00.000Z');
    eq('completion makes the card payment due', paymentForOrder(r1.draft.id)?.status, 'due');
    await runNightlyCharges('2025-06-02T03:00:00.000Z');
    eq('nightly run auto-charges the card', paymentForOrder(r1.draft.id)?.status, 'paid');

    // Pay-later booking → completed → nightly run emails a link → client pays.
    const r4 = await submitBooking({ contact: { email: 'later@x.pl' }, cityId: 'krakow', serviceId: 'standard_cleaning', paymentMethod: 'pay_later' });
    eq('pay-later also awaits completion', r4.payment.status, 'awaiting_completion');
    completeOrder(r4.draft.id, '2025-06-01T14:00:00.000Z');
    await runNightlyCharges('2025-06-02T03:00:00.000Z');
    eq('card-less order gets a link', paymentForOrder(r4.draft.id)?.status, 'link_sent');
    ok('link is present', !!paymentForOrder(r4.draft.id)?.linkUrl);
    eq('client settles the link', settlePayment(r4.draft.id)?.status, 'paid');

    // Admin can mark an order paid by hand (before any auto-run).
    const r5 = await submitBooking({ contact: { phone: '700 999 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    eq('admin manual mark paid', markOrderPaidByAdmin(r5.draft.id)?.status, 'paid');
    ok('store reflects admin-paid', getStorePayments().find(p => p.orderId === r5.draft.id)?.status === 'paid');

    // Returning demo client (Marek, +48501234567) → account reused, not duplicated.
    const before = getStoreAccounts().length;
    const r2 = await submitBooking({ contact: { phone: '501 234 567' }, cityId: 'krakow', serviceId: 'general_cleaning' });
    ok('demo client recognized as returning', !r2.isNewAccount);
    eq('resolved to the existing account', r2.account.id, 'cl1');
    eq('no duplicate account created', getStoreAccounts().length, before);

    // Flower delivery details survive, gift note clamped to the max length.
    const r3 = await submitBooking({
        contact: { phone: '700 111 222' },
        cityId: 'krakow',
        serviceId: 'flower_delivery',
        delivery: { recipientName: 'Anna', line1: 'Floriańska 3', city: 'krakow', date: '2025-06-01', slot: 'evening', note: 'x'.repeat(500) },
    });
    eq('delivery slot stored', r3.draft.delivery?.slot, 'evening');
    eq('gift note clamped to 300', r3.draft.delivery?.note?.length, 300);

    // Lead callback → normalized phone, new lead in snapshot.
    const lead = await submitLeadCallback({ phone: '0048 511 22 33 44', serviceId: 'office_cleaning', cityId: 'warszawa' });
    eq('lead phone normalized', lead.contact.phone, '+48511223344');
    eq('lead source is callback', lead.source, 'callback');
    eq('lead starts new', lead.status, 'new');
    ok('lead visible in snapshot', getStoreLeads().some(l => l.id === lead.id));

    unsub();

    // Persistence round-trip: a booking must survive an app reload.
    resetBookingStore();
    const kv = memoryKeyValueStore();
    await initBookingStore(kv); // first run — empty store, seeds it
    const rp = await submitBooking({ contact: { phone: '600 100 200' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    resetBookingStore(); // simulate app kill: in-memory wiped
    ok('reset clears in-memory drafts', getStoreDrafts().length === 0);
    await initBookingStore(kv); // reload from the same persisted store
    ok('draft survives reload', getStoreDrafts().some(d => d.id === rp.draft.id));
    ok('payment survives reload', getStorePayments().some(p => p.orderId === rp.draft.id));
    resetBookingStore();

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All bookingStore tests passed.');
}

main();

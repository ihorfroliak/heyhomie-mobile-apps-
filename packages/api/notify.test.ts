/** Run with: npx -y tsx packages/api/notify.test.ts */
import { notify, memorySender } from './notifyClient';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

async function main() {
    // Invoice → email only; recipient has email → one message with a subject.
    const s1 = memorySender();
    const inv = await notify({ kind: 'invoice_issued', invoiceNumber: 'FV/1', amount: 246, currency: 'PLN' }, { email: 'a@b.pl' }, s1);
    eq('invoice sends one email', inv.map(m => m.channel), ['email']);
    ok('invoice message carries subject', !!s1.sent[0].subject);

    // Reschedule → email+push; recipient can only email → single message.
    const s2 = memorySender();
    await notify({ kind: 'visit_rescheduled', actor: 'admin', scheduledAt: '2025-05-20T10:00', newScheduledAt: '2025-05-21T10:00' }, { email: 'a@b.pl' }, s2);
    eq('reschedule to email-only recipient', s2.sent.map(m => m.channel), ['email']);
    ok('reschedule body reflects admin actor', s2.sent[0].body.startsWith('We moved'));

    // No reachable channel → nothing sent.
    const s3 = memorySender();
    const none = await notify({ kind: 'visit_canceled', scheduledAt: '2025-05-20T10:00' }, {}, s3);
    eq('no channels → nothing sent', none.length, 0);

    // Callback lead → phone-only recipient gets exactly the SMS.
    const s4 = memorySender();
    const cb = await notify({ kind: 'callback_received', serviceLabel: 'Office cleaning' }, { phone: '+48511223344' }, s4);
    eq('callback to phone-only recipient → sms', cb.map(m => m.channel), ['sms']);
    ok('callback sms mentions the service', s4.sent[0].body.includes('Office cleaning'));

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All notify tests passed.');
}

main();

/** Run with: npx -y tsx packages/domain/growth.test.ts */
import { normalizePhone, isValidPolishPhone, formatPhone, displayName, validateSignup, findAccount, newAccount, contactKey, DEFAULT_FIRST_NAME, type ClientAccount } from './identity';
import { STAGE_ORDER, stageIndex, isAbandoned, abandonedDrafts, funnelCounts, bookingConversion, biggestDropStage, minutesSince, type BookingDraft } from './funnel';
import { openLeads, leadCounts, leadsFromDrafts, allLeads, type Lead } from './leads';
import { sortedServiceIds, serviceIcon, serviceOrder } from './catalog';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

// ---- identity ----
eq('normalize 9-digit adds +48', normalizePhone('501 234 567'), '+48501234567');
eq('normalize 0048 prefix', normalizePhone('0048 501 234 567'), '+48501234567');
eq('normalize 48 prefix', normalizePhone('48501234567'), '+48501234567');
ok('valid PL phone', isValidPolishPhone('+48 501 234 567'));
ok('too short is invalid', !isValidPolishPhone('+48 501 234'));
ok('non-PL prefix invalid', !isValidPolishPhone('+38 501 234 567'));
eq('format phone', formatPhone('501234567'), '+48 501 234 567');
eq('signup valid with phone only', validateSignup({ phone: '501234567' }).valid, true);
eq('signup valid with email only', validateSignup({ email: 'a@b.pl' }).valid, true);
eq('signup invalid with neither', validateSignup({}).valid, false);
eq('signup invalid with bad phone + no email', validateSignup({ phone: '123' }).valid, false);

const accounts: ClientAccount[] = [
    { id: 'cl1', phone: '+48501234567', email: 'marek@x.pl', firstName: 'Marek', lastName: 'Rutkowski', createdAt: '2025-02-01' },
    { id: 'cl2', email: 'anna@x.pl', firstName: 'Friend', createdAt: '2025-03-01' },
];
eq('find by phone (normalized)', findAccount(accounts, { phone: '501 234 567' })?.id, 'cl1');
eq('find by email case-insensitive', findAccount(accounts, { email: 'ANNA@x.pl' })?.id, 'cl2');
eq('unknown contact → none', findAccount(accounts, { phone: '+48999888777' }), undefined);
eq('displayName uses initial', displayName({ firstName: 'Marek', lastName: 'Rutkowski' }), 'Marek R.');
eq('displayName falls back to first', displayName({ firstName: 'Friend' }), 'Friend');
eq('new account defaults name to Friend', newAccount('x', { phone: '501234567' }, { createdAt: '2025-05-16' }).firstName, DEFAULT_FIRST_NAME);
eq('new account keeps given name + normalizes phone', (() => { const a = newAccount('x', { phone: '501 234 567' }, { firstName: 'Piotr', createdAt: '2025-05-16' }); return [a.firstName, a.phone, a.verifiedVia]; })(), ['Piotr', '+48501234567', 'phone']);
eq('contactKey prefers phone', contactKey({ phone: '501234567', email: 'a@b.pl' }), '+48501234567');

// ---- funnel ----
const NOW = '2025-05-16T12:00:00Z';
const drafts: BookingDraft[] = [
    { id: 'd1', stage: 'confirmed', updatedAt: '2025-05-16T11:50:00Z' },
    { id: 'd2', stage: 'scheduled', updatedAt: '2025-05-16T11:00:00Z' }, // 60m ago → abandoned
    { id: 'd3', contact: { phone: '+48700000000' }, serviceId: 'window_cleaning', stage: 'configured', updatedAt: '2025-05-16T09:00:00Z' }, // abandoned + contact
    { id: 'd4', stage: 'started', updatedAt: '2025-05-16T11:55:00Z' }, // 5m ago → not abandoned
];
eq('stage order length', STAGE_ORDER.length, 6);
eq('stageIndex confirmed is last', stageIndex('confirmed'), 5);
eq('minutesSince', minutesSince('2025-05-16T11:00:00Z', NOW), 60);
ok('recent draft not abandoned', !isAbandoned(drafts[3], NOW));
ok('stale non-confirmed abandoned', isAbandoned(drafts[1], NOW));
ok('confirmed never abandoned', !isAbandoned(drafts[0], NOW));
eq('abandoned set', abandonedDrafts(drafts, NOW).map(d => d.id), ['d2', 'd3']);
eq('funnel cumulative reached', funnelCounts(drafts).map(s => s.reached), [4, 3, 3, 2, 2, 1]);
eq('conversion rate', bookingConversion(drafts), 0.25);
ok('biggest drop is a real stage', STAGE_ORDER.includes(biggestDropStage(drafts)!));

// ---- leads ----
const derived = leadsFromDrafts(drafts, NOW);
eq('only abandoned-with-contact become leads', derived.map(l => l.id), ['lead-d3']);
eq('derived lead carries service interest', derived[0].serviceInterest, 'window_cleaning');
const explicit: Lead[] = [
    { id: 'ld1', contact: { phone: '+48511223344' }, source: 'callback', status: 'new', createdAt: '2025-05-16T10:00:00Z' },
    { id: 'ld2', contact: { phone: '+48522334455' }, source: 'callback', status: 'contacted', createdAt: '2025-05-15T10:00:00Z' },
];
eq('open leads', openLeads(explicit).map(l => l.id), ['ld1', 'ld2']);
eq('lead counts', leadCounts(explicit), { new: 1, contacted: 1, converted: 0, lost: 0 });
eq('allLeads merges explicit + derived', allLeads(explicit, drafts, NOW).map(l => l.id), ['ld1', 'ld2', 'lead-d3']);

// ---- catalog order ----
eq('sorted puts cleaning first, flowers last', sortedServiceIds(['flower_delivery', 'office_cleaning', 'standard_cleaning', 'general_cleaning']), ['standard_cleaning', 'general_cleaning', 'office_cleaning', 'flower_delivery']);
eq('icon lookup', serviceIcon('flower_delivery'), '💐');
ok('order increasing cleaning<office<flowers', serviceOrder('standard_cleaning') < serviceOrder('office_cleaning') && serviceOrder('office_cleaning') < serviceOrder('flower_delivery'));

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All growth tests passed.');

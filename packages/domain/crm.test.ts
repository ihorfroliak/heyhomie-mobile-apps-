/** Run with: npx -y tsx packages/domain/crm.test.ts */
import { clientProfiles, clientProfile, clientMissions, segmentFor, segmentCounts, clientComms, type CommEvent } from './crm';
import type { Mission } from './missions';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const mk = (id: string, clientId: string, firstName: string, scheduledAt: string, price: number, status: Mission['status'] = 'done'): Mission =>
    ({
        id, status, plan: 'standard', params: { rooms: 1, kitchens: 1, bathrooms: 1 }, addOns: [], scheduledAt,
        durationMinutes: 180, travelBufferMinutes: 15, workerCount: 1, address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'krakow' },
        client: { id: clientId, firstName }, price, currency: 'PLN',
    }) as Mission;

const missions = [
    mk('m1', 'cl1', 'Marek', '2025-05-12', 189),
    mk('m4', 'cl1', 'Marek', '2025-05-14', 219),
    mk('m6', 'cl1', 'Marek', '2025-05-16', 189),
    mk('m2', 'cl2', 'Anna', '2025-05-13', 256),
    mk('m5', 'cl2', 'Anna', '2025-05-15', 320),
    mk('m7', 'cl2', 'Anna', '2025-05-16', 200, 'canceled'),
    mk('m3', 'cl3', 'Piotr', '2025-05-13', 180),
];

const profiles = clientProfiles(missions);
eq('3 client profiles, sorted by LTV', profiles.map(p => p.id), ['cl1', 'cl2', 'cl3']);
eq('cl1 LTV = 597', profiles[0].totalSpent, 597);
eq('cl1 orders = 3 (canceled excluded)', profiles[0].orders, 3);
eq('cl1 avg order', profiles[0].avgOrder, 199);
ok('cl2 excludes canceled from LTV', clientProfile(missions, 'cl2')?.totalSpent === 576 && clientProfile(missions, 'cl2')?.orders === 2);

const REF = '2025-05-16';
eq('cl1 = champion (3+ orders, recent)', segmentFor(profiles[0], REF), 'champion');
eq('cl2 = loyal (2 orders)', segmentFor(profiles[1], REF), 'loyal');
eq('cl3 = new (1 order, recent)', segmentFor(profiles[2], REF), 'new');
eq('cl1 = at_risk if 120 days stale', segmentFor({ ...profiles[0], lastOrderAt: '2025-01-16' }, REF), 'at_risk');
eq('cl1 = lost if 200 days stale', segmentFor({ ...profiles[0], lastOrderAt: '2024-10-16' }, REF), 'lost');

const counts = segmentCounts(profiles, REF);
eq('segment counts', counts, { champion: 1, loyal: 1, new: 1, at_risk: 0, lost: 0 });

eq('client mission history newest first', clientMissions(missions, 'cl1').map(m => m.id), ['m6', 'm4', 'm1']);

const comms: CommEvent[] = [
    { id: 'e1', clientId: 'cl1', channel: 'sms', direction: 'out', at: '2025-05-16T08:00:00Z', summary: 'reminder' },
    { id: 'e2', clientId: 'cl1', channel: 'call', direction: 'in', at: '2025-05-15T14:20:00Z', summary: 'call' },
    { id: 'e3', clientId: 'cl2', channel: 'sms', direction: 'out', at: '2025-05-15T09:00:00Z', summary: 'x' },
];
eq('client comms filtered + newest first', clientComms(comms, 'cl1').map(c => c.id), ['e1', 'e2']);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All CRM tests passed.');

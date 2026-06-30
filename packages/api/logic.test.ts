/**
 * Runtime tests for the domain + mock API logic.
 * Run with:  npx -y tsx packages/api/logic.test.ts
 */
import {
    computeBaseMinutes,
    estimateMissionMinutes,
    addOnsFor,
    workersFor,
    checklistFor,
    Mission,
} from '../domain';
import { transitionMission, rescheduleMission, reassignHomie, isHomieAvailable, nextAvailableDate, homies } from './mock';

let passed = 0;
const fail: string[] = [];
function ok(name: string, cond: boolean) {
    if (cond) passed++;
    else fail.push(name);
}
function eq(name: string, got: unknown, exp: unknown) {
    ok(`${name} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`, JSON.stringify(got) === JSON.stringify(exp));
}

const makeMission = (over: Partial<Mission> = {}): Mission => ({
    id: 'm1',
    status: 'homie_found',
    plan: 'standard',
    params: { rooms: 1, kitchens: 1, bathrooms: 1 },
    addOns: [],
    scheduledAt: '2025-05-19',
    durationMinutes: 180,
    travelBufferMinutes: 15,
    workerCount: 1,
    address: { id: 'a1', name: 'Home', line1: 'Studencka 17', zipCode: '31-116', city: 'krakow' },
    client: { id: 'c1', firstName: 'Marek' },
    homie: { id: 'h2', firstName: 'Marta' },
    price: 189,
    currency: 'PLN',
    ...over,
});

// --- time calculator ---
eq('1 bath + 1 kitchen + 1 room + corridor = 3h', computeBaseMinutes({ rooms: 1, kitchens: 1, bathrooms: 1 }), 180);
eq('3 rooms + 1 kitchen + 2 baths', computeBaseMinutes({ rooms: 3, kitchens: 1, bathrooms: 2 }), 300);
eq('empty still clamps to 3h minimum', computeBaseMinutes({ rooms: 0, kitchens: 0, bathrooms: 0 }), 180);
eq('standard + 2 windows adds 60 min', estimateMissionMinutes({ rooms: 1, kitchens: 1, bathrooms: 1 }, [{ id: 'windows', quantity: 2 }]), 240);

// --- add-ons per plan ---
ok('general hides fridge (already included)', !addOnsFor('general').some(a => a.id === 'fridge'));
ok('standard offers fridge as add-on', addOnsFor('standard').some(a => a.id === 'fridge'));
ok('windows available on general too', addOnsFor('general').some(a => a.id === 'windows'));

// --- staffing ---
eq('standard = 1 homie', workersFor('standard'), 1);
eq('general 70m2 = 2 homies', workersFor('general', { areaSqm: 70 }), 2);
eq('general 55m2 = 1 homie', workersFor('general', { areaSqm: 55 }), 1);
eq('general recurring = 1 homie', workersFor('general', { recurring: true }), 1);

// --- checklist ---
ok('standard checklist has no generalOnly items', checklistFor('standard').every(a => a.items.every(i => !i.generalOnly)));
ok('general checklist includes deeper items', checklistFor('general').some(a => a.items.some(i => i.generalOnly)));

// --- availability ---
ok('Marta free on a weekday (Mon 19 May)', isHomieAvailable(homies.find(h => h.id === 'h2')!, '2025-05-19'));
ok('Marta not working on Saturday (17 May)', !isHomieAvailable(homies.find(h => h.id === 'h2')!, '2025-05-17'));
ok('Olena blocked on 15 May', !isHomieAvailable(homies.find(h => h.id === 'h1')!, '2025-05-15'));

// --- status transitions ---
const searching = makeMission({ status: 'searching_homie', homie: undefined });
const assigned = transitionMission(searching, 'assign', { homie: { id: 'h2', firstName: 'Marta' } });
eq('assign -> homie_found', assigned.status, 'homie_found');
ok('assign sets the homie', assigned.homie?.id === 'h2');
const started = transitionMission(assigned, 'begin', { at: '2025-05-19T10:00:00Z' });
eq('begin -> in_progress', started.status, 'in_progress');
ok('begin records check-in', started.checkInAt === '2025-05-19T10:00:00Z');
const finished = transitionMission(started, 'complete', { at: '2025-05-19T13:00:00Z' });
eq('complete -> done', finished.status, 'done');
ok('complete records check-out', finished.checkOutAt === '2025-05-19T13:00:00Z');
let threw = false;
try { transitionMission(searching, 'begin'); } catch { threw = true; }
ok('cannot begin a mission still searching', threw);

// --- reschedule + reassign ---
const r1 = rescheduleMission(makeMission(), '2025-05-19'); // Marta works Mondays
ok('reschedule to a day the homie works succeeds', r1.ok && r1.mission?.scheduledAt === '2025-05-19');
const r2 = rescheduleMission(makeMission(), '2025-05-17'); // Saturday — Marta off
ok('reschedule to homie day off is blocked', !r2.ok && r2.reason === 'homie_unavailable');
ok('and offers alternative homies for that day', (r2.alternatives?.length ?? 0) >= 1);
const reassigned = reassignHomie(makeMission(), { id: 'h1', firstName: 'Olena' }, '2025-05-17');
ok('reassign switches the homie', reassigned.homie?.id === 'h1' && reassigned.scheduledAt === '2025-05-17');
const frozen = rescheduleMission(makeMission({ status: 'done' }), '2025-05-19');
ok('cannot reschedule a done mission', !frozen.ok && frozen.reason === 'frozen');

// --- next available date ---
ok('Marta: next available from Saturday is Monday', nextAvailableDate(homies.find(h => h.id === 'h2')!, '2025-05-17') === '2025-05-19');
ok('Olena: skips her blocked Thursday to Friday', nextAvailableDate(homies.find(h => h.id === 'h1')!, '2025-05-15') === '2025-05-16');

// --- report ---
console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) {
    fail.forEach(f => console.log('  FAIL: ' + f));
    process.exit(1);
}
console.log('All tests passed.');

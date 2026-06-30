/** Run with: npx -y tsx packages/domain/selectors.test.ts */
import { splitMissions, missionTimeline, workerAction, adminStats } from './selectors';
import type { Mission, MissionStatus } from './missions';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

const m = (id: string, status: MissionStatus, scheduledAt: string): Mission =>
    ({
        id,
        status,
        plan: 'standard',
        params: { rooms: 1, kitchens: 1, bathrooms: 1 },
        addOns: [],
        scheduledAt,
        durationMinutes: 180,
        travelBufferMinutes: 15,
        workerCount: 1,
        address: { id: 'a', name: 'Home', line1: 'x', zipCode: '00-000', city: 'krakow' },
        client: { id: 'c', firstName: 'A' },
        price: 189,
        currency: 'PLN',
    }) as Mission;

const split = splitMissions([
    m('a', 'done', '2025-05-01'),
    m('b', 'homie_found', '2025-05-20'),
    m('c', 'searching_homie', '2025-05-18'),
    m('d', 'canceled', '2025-04-01'),
]);
ok('upcoming excludes done/canceled', split.upcoming.map(x => x.id).join(',') === 'c,b');
ok('past has done + canceled newest first', split.past.map(x => x.id).join(',') === 'a,d');

const tl1 = missionTimeline('homie_found');
ok('homie_found: step1 current', tl1[0].state === 'current' && tl1[1].state === 'upcoming' && tl1[2].state === 'upcoming');
const tl2 = missionTimeline('in_progress');
ok('in_progress: step1 done, step2 current', tl2[0].state === 'done' && tl2[1].state === 'current');
const tl3 = missionTimeline('done');
ok('done: all done', tl3.every(s => s.state === 'done'));
const tl4 = missionTimeline('searching_homie');
ok('searching: nothing done yet', tl4.every(s => s.state === 'upcoming'));

ok('worker accepts a searching mission', workerAction('searching_homie') === 'accept');
ok('worker begins (check-in) an assigned mission', workerAction('homie_found') === 'begin');
ok('worker completes (check-out) an in-progress mission', workerAction('in_progress') === 'complete');
ok('no worker action on a done mission', workerAction('done') === null);

const stats = adminStats([
    m('a', 'done', '2025-05-01'),
    m('b', 'homie_found', '2025-05-20'),
    m('c', 'searching_homie', '2025-05-18'),
    m('e', 'in_progress', '2025-05-19'),
]);
ok('adminStats total', stats.total === 4);
ok('adminStats live = homie_found + in_progress', stats.live === 2);
ok('adminStats searching', stats.searching === 1);
ok('adminStats revenue counts done only', stats.revenue === 189 && stats.done === 1);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All selector tests passed.');

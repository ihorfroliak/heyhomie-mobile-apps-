/** Run with: npx -y tsx packages/analytics/tracker.test.ts */
import { memoryTracker, multiTracker, noopTracker } from './tracker';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

const a = memoryTracker();
a.tracker.track({ name: 'mission_booked', plan: 'standard', minutes: 180, addOns: 0 });
a.tracker.track({ name: 'rating_submitted', missionId: 'm1', stars: 5 });
ok('records events', a.events.length === 2);
ok('keeps event shape', a.events[0].name === 'mission_booked');

const b = memoryTracker();
const both = multiTracker([a.tracker, b.tracker]);
both.track({ name: 'mission_completed', missionId: 'm1' });
ok('multiTracker fans out to all', a.events.length === 3 && b.events.length === 1);

let threw = false;
try {
    noopTracker.track({ name: 'screen_view', screen: 'home' });
    noopTracker.identify('u1');
} catch {
    threw = true;
}
ok('noopTracker is safe', !threw);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All tracker tests passed.');

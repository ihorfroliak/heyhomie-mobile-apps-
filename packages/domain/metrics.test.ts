/** Run with: npx -y tsx packages/domain/metrics.test.ts */
import { missionPayout, monthlyPayout } from './payouts';
import { kpis, revenueByDay, countByCity, countByPlan, workerLeaderboard, repeatRate, utilization, avgAssignmentMinutes, avgRatingByCity, revenueByWeekday, dashboardSummary, withinLastDays } from './analytics';
import type { Mission, MissionStatus } from './missions';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => ok(`${n} (got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)})`, JSON.stringify(got) === JSON.stringify(exp));

const mk = (over: Partial<Mission> & { id: string; status: MissionStatus; scheduledAt: string; price: number }): Mission =>
    ({
        plan: 'standard',
        params: { rooms: 1, kitchens: 1, bathrooms: 1 },
        addOns: [],
        durationMinutes: 180,
        travelBufferMinutes: 15,
        workerCount: 1,
        address: { id: 'a', name: 'Home', line1: 'x', zipCode: '0', city: 'krakow' },
        client: { id: 'c', firstName: 'A' },
        currency: 'PLN',
        ...over,
    }) as Mission;

// --- payouts ---
eq('default payout = 70% rounded', missionPayout({ price: 189 }), 132);
eq('override wins', missionPayout({ price: 189 }, { override: 150 }), 150);
eq('custom share', missionPayout({ price: 200 }, { share: 0.5 }), 100);

const payMissions = [
    mk({ id: 'A', status: 'done', scheduledAt: '2025-05-01', price: 200 }),
    mk({ id: 'B', status: 'done', scheduledAt: '2025-05-10', price: 100 }),
    mk({ id: 'C', status: 'done', scheduledAt: '2025-04-01', price: 300 }), // other month
    mk({ id: 'D', status: 'searching_homie', scheduledAt: '2025-05-12', price: 100 }), // not done
];
const mp = monthlyPayout({ missions: payMissions, year: 2025, month: 5, overrides: { A: 150 }, bonus: 50 });
eq('monthly: only done in month', mp.count, 2);
eq('monthly gross (override 150 + 70)', mp.gross, 220);
eq('monthly total = gross + bonus', mp.total, 270);

// shareFor: per-mission rate (e.g. b2b 60% vs employee 70%); override still wins.
const mpRates = monthlyPayout({
    missions: payMissions,
    year: 2025,
    month: 5,
    overrides: { A: 150 },
    shareFor: m => (m.id === 'B' ? 0.5 : undefined),
});
eq('shareFor applies per mission (override 150 + 50% of 100)', mpRates.gross, 200);
eq('shareFor undefined falls back to default share', monthlyPayout({ missions: payMissions, year: 2025, month: 5, shareFor: () => undefined }).gross, 210);

// --- analytics ---
const set = [
    mk({ id: '1', status: 'done', scheduledAt: '2025-05-01', price: 200, homie: { id: 'h1', firstName: 'Olena' } }),
    mk({ id: '2', status: 'done', scheduledAt: '2025-05-10', price: 100, homie: { id: 'h1', firstName: 'Olena' }, plan: 'general', address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'warsaw' } }),
    mk({ id: '3', status: 'canceled', scheduledAt: '2025-05-02', price: 150 }),
    mk({ id: '4', status: 'searching_homie', scheduledAt: '2025-05-03', price: 180 }),
    mk({ id: '5', status: 'in_progress', scheduledAt: '2025-05-04', price: 220 }),
];
const k = kpis(set);
eq('kpis total', k.total, 5);
eq('kpis done', k.done, 2);
eq('kpis revenue', k.revenue, 300);
eq('kpis avg value', k.avgMissionValue, 150);
eq('kpis live (in_progress)', k.live, 1);
eq('kpis searching', k.searching, 1);
eq('completionRate 2/3', k.completionRate, 0.67);
eq('cancellationRate 1/3', k.cancellationRate, 0.33);

eq('revenueByDay sorted', revenueByDay(set), [{ key: '2025-05-01', value: 200 }, { key: '2025-05-10', value: 100 }]);
eq('countByCity', countByCity(set), [{ key: 'krakow', value: 4 }, { key: 'warsaw', value: 1 }]);
eq('countByPlan', countByPlan(set), [{ key: 'standard', value: 4 }, { key: 'general', value: 1 }]);

const lb = workerLeaderboard(set);
eq('leaderboard one homie', lb.length, 1);
eq('leaderboard payout (140 + 70)', lb[0].payout, 210);
eq('leaderboard missions', lb[0].missions, 2);

// --- repeat rate & utilization ---
const loyaltySet = [
    mk({ id: 'r1', status: 'done', scheduledAt: '2025-05-01', price: 100, client: { id: 'c1', firstName: 'A' } }),
    mk({ id: 'r2', status: 'done', scheduledAt: '2025-05-08', price: 100, client: { id: 'c1', firstName: 'A' } }),
    mk({ id: 'r3', status: 'done', scheduledAt: '2025-05-02', price: 100, client: { id: 'c2', firstName: 'B' } }),
    mk({ id: 'r4', status: 'done', scheduledAt: '2025-05-03', price: 100, client: { id: 'c3', firstName: 'C' } }),
];
eq('repeatRate: 1 of 3 clients returned', repeatRate(loyaltySet), 0.33);

const utilSet = [
    mk({ id: 'u1', status: 'done', scheduledAt: '2025-05-01', price: 100, durationMinutes: 180 }),
    mk({ id: 'u2', status: 'done', scheduledAt: '2025-05-02', price: 100, durationMinutes: 240 }),
];
eq('utilization 420/600', utilization(utilSet, 600), 0.7);
eq('utilization caps at 1', utilization(utilSet, 300), 1);
eq('utilization 0 capacity', utilization(utilSet, 0), 0);

// --- assignment time / rating by city / revenue by weekday ---
const stampSet = [
    mk({ id: 's1', status: 'done', scheduledAt: '2025-05-05', price: 100, createdAt: '2025-05-04T10:00:00Z', assignedAt: '2025-05-04T10:30:00Z', rating: 5, address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'krakow' } }),
    mk({ id: 's2', status: 'done', scheduledAt: '2025-05-06', price: 200, createdAt: '2025-05-04T09:00:00Z', assignedAt: '2025-05-04T10:00:00Z', rating: 4, address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'krakow' } }),
    mk({ id: 's3', status: 'done', scheduledAt: '2025-05-05', price: 150, rating: 5, address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'warsaw' } }),
];
eq('avgAssignmentMinutes (30 + 60)/2', avgAssignmentMinutes(stampSet), 45);
eq('avgRatingByCity', avgRatingByCity(stampSet), [{ key: 'warsaw', value: 5 }, { key: 'krakow', value: 4.5 }]);
// 2025-05-05 is Monday, 2025-05-06 Tuesday
const wk = revenueByWeekday(stampSet);
eq('revenueByWeekday starts Mon', wk[0].key, 'Mon');
eq('revenueByWeekday Mon total (100+150)', wk[0].value, 250);
eq('revenueByWeekday Tue total (200)', wk[1].value, 200);

const summary = dashboardSummary(stampSet, { capacityMinutes: 600 });
ok('dashboardSummary primary present', summary.primary.revenue === 450 && summary.primary.completed === 3);
ok('dashboardSummary secondary present', summary.secondary.avgAssignmentMinutes === 45);
ok('dashboardSummary charts present', summary.charts.avgRatingByCity.length === 2);

// --- period filter ---
const periodSet = [
    mk({ id: 'w1', status: 'done', scheduledAt: '2025-05-16', price: 100 }),
    mk({ id: 'w2', status: 'done', scheduledAt: '2025-05-15', price: 100 }),
    mk({ id: 'w3', status: 'done', scheduledAt: '2025-05-10', price: 100 }),
    mk({ id: 'w4', status: 'done', scheduledAt: '2025-05-01', price: 100 }),
];
eq('withinLastDays(2) from latest (16) keeps 16,15', withinLastDays(periodSet, 2).map(m => m.id), ['w1', 'w2']);
eq('withinLastDays(7) keeps 16,15,10', withinLastDays(periodSet, 7).map(m => m.id), ['w1', 'w2', 'w3']);
eq('withinLastDays(30) keeps all', withinLastDays(periodSet, 30).length, 4);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All metrics tests passed.');

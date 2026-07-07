/** Run with: npx -y tsx packages/domain/report.test.ts */
import { periodLabel, financialReportData, financialReportHtml } from './report';
import { dateRange, emptyExpenses } from './finance';
import type { Mission } from './missions';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

const mk = (over: Partial<Mission>): Mission =>
    ({
        id: 'm', status: 'done', plan: 'standard', params: { rooms: 1, kitchens: 1, bathrooms: 1 }, addOns: [], scheduledAt: '2025-05-10',
        durationMinutes: 180, travelBufferMinutes: 15, workerCount: 1, address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'krakow' },
        client: { id: 'c', firstName: 'A' }, price: 200, currency: 'PLN', ...over,
    }) as Mission;

// labels
ok('quarter label', periodLabel('quarter', '2025-05-15') === 'Q2 2025');
ok('year label', periodLabel('year', '2025-05-15') === '2025');
ok('month label', periodLabel('month', '2025-05-15') === 'May 2025');

// data + html
const missions = [mk({ id: 'a', scheduledAt: '2025-04-10', price: 200 }), mk({ id: 'b', scheduledAt: '2025-05-10', price: 200 })];
const byMonth = { '2025-05': { ...emptyExpenses(), accountant: 300 } };
const range = dateRange('quarter', '2025-05-15');
const data = financialReportData({ label: periodLabel('quarter', '2025-05-15'), missions, byMonth, vat: 0, range });

ok('report data title', data.title === 'Q2 2025');
ok('report revenue net (2×200)', data.report.revenueNet === 400);
ok('report expenses from May only', data.report.expenses === 300);
ok('monthly has 2 months', data.monthly.length === 2);

const html = financialReportHtml(data, { companyName: 'HeyHomie' });
ok('html has title', html.includes('Q2 2025'));
ok('html has net profit label', html.includes('Net profit'));
ok('html is a full document', html.startsWith('<!DOCTYPE html>') && html.includes('</html>'));

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All report tests passed.');

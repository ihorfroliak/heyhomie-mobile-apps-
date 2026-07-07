/** Run with: npx -y tsx packages/domain/tips.test.ts */
import { tipPresets, isValidTip, totalTips, tipsForOrder, tipsForWorker, payoutWithTips, TIP_PERCENTS, MAX_TIP_PLN, type Tip } from './tips';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

// presets
eq('default percents', TIP_PERCENTS, [10, 15, 20]);
eq('presets off a 200 order', tipPresets(200), [{ percent: 10, amount: 20 }, { percent: 15, amount: 30 }, { percent: 20, amount: 40 }]);
eq('presets round to whole PLN', tipPresets(189).map(p => p.amount), [19, 28, 38]);
eq('custom percents supported', tipPresets(100, [5]), [{ percent: 5, amount: 5 }]);

// validation
ok('zero tip (skip) is valid', isValidTip(0, 200));
ok('normal tip valid', isValidTip(30, 200));
ok('negative rejected', !isValidTip(-5, 200));
ok('NaN rejected', !isValidTip(NaN, 200));
ok('absurd tip rejected', !isValidTip(5000, 200));
ok('ceiling scales with big orders', isValidTip(1500, 900)); // 2x order = 1800 >= 1500
ok('MAX applies to small orders', !isValidTip(MAX_TIP_PLN + 1, 50));

// aggregation
const tips: Tip[] = [
    { id: 't1', orderId: 'm1', workerId: 'h1', amount: 20, currency: 'PLN', createdAt: '2025-05-12T13:10:00Z' },
    { id: 't2', orderId: 'm2', workerId: 'h1', amount: 15, currency: 'PLN', createdAt: '2025-05-13T13:10:00Z' },
    { id: 't3', orderId: 'm3', workerId: 'h2', amount: 10, currency: 'PLN', createdAt: '2025-05-14T13:10:00Z' },
];
eq('total tips', totalTips(tips), 45);
eq('tips for order', tipsForOrder(tips, 'm1').map(t => t.id), ['t1']);
eq('tips for worker h1', tipsForWorker(tips, 'h1').map(t => t.id), ['t1', 't2']);
eq('payout adds tips in full', payoutWithTips(500, tipsForWorker(tips, 'h1')), 535);
eq('empty tips total', totalTips([]), 0);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All tips tests passed.');

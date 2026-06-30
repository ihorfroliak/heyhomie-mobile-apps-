/** Run with: npx -y tsx packages/domain/i18n.test.ts */
import { tr, missionStatusLabel, frequencyLabel, formatDuration, formatMoney } from './i18n';

let passed = 0;
const fail: string[] = [];
const eq = (n: string, got: unknown, exp: unknown) => {
    if (JSON.stringify(got) === JSON.stringify(exp)) passed++;
    else fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`);
};

eq('tr picks uk', tr(missionStatusLabel.done, 'uk'), 'Виконано');
eq('tr picks en', tr(missionStatusLabel.in_progress, 'en'), 'In progress');
eq('tr picks pl', tr(missionStatusLabel.searching_homie, 'pl'), 'Szukamy homie');
eq('frequency weekly uk', tr(frequencyLabel.weekly, 'uk'), 'Щотижня');
eq('formatDuration 180', formatDuration(180), '3h 00m');
eq('formatDuration 75', formatDuration(75), '1h 15m');
eq('formatDuration 45', formatDuration(45), '45m');
eq('formatDuration 240', formatDuration(240), '4h 00m');
eq('formatMoney pln rounds', formatMoney(189, 'PLN', 'en').replace(/ /g, ' ').includes('189'), true);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All i18n tests passed.');

import { writeFileSync } from 'fs';
import { demoAnalyticsMissions } from '../packages/api/index';
import { dateRange, financialReportData, periodLabel, type MonthlyExpenses } from '../packages/domain/index';

const e = (o: Partial<MonthlyExpenses>): MonthlyExpenses => ({ accountant: 0, onlineServices: 0, salaries: 0, taxes: 0, socialContributions: 0, contractorPay: 0, other: 0, ...o });

const byMonth: Record<string, MonthlyExpenses> = {
    '2025-04': e({ accountant: 500, onlineServices: 300, taxes: 700, socialContributions: 1600, contractorPay: 2800, other: 300 }),
    '2025-05': e({ accountant: 500, onlineServices: 300, taxes: 800, socialContributions: 1600, contractorPay: 3000, other: 400 }),
    '2025-06': e({ accountant: 500, onlineServices: 350, taxes: 850, socialContributions: 1600, contractorPay: 3200, other: 350 }),
};

const q2 = financialReportData({ label: periodLabel('quarter', '2025-05-15'), missions: demoAnalyticsMissions, byMonth, vat: 0, range: dateRange('quarter', '2025-05-15') });
const year = financialReportData({ label: periodLabel('year', '2025-05-15'), missions: demoAnalyticsMissions, byMonth, vat: 0, range: dateRange('year', '2025-05-15') });

writeFileSync('reports.tmp.json', JSON.stringify({ q2, year }, null, 2));
console.log('reports.tmp.json written');

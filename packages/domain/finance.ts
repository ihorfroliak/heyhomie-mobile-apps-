/**
 * Finance: VAT handling, per-order margin, monthly expenses and a real-time
 * monthly report. Pure functions — the admin screen recomputes on every change.
 *
 * Prices on a mission are the client (gross) price. Under the small-business VAT
 * exemption we bill 0%, so net = gross.
 */
import type { Mission } from './missions';
import { missionPayout } from './payouts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

export type VatRate = 0 | 8 | 23;

/**
 * Revenue threshold above which VAT registration applies. NOTE: confirm the
 * statutory figure with the accountant — the Polish subject exemption is
 * 200,000 PLN as of 2024; [Company] uses this configurable value.
 */
export const VAT_EXEMPTION_THRESHOLD_PLN = 240_000;

export const isVatExempt = (annualRevenuePln: number, threshold = VAT_EXEMPTION_THRESHOLD_PLN): boolean => annualRevenuePln < threshold;

/** Net (ex-VAT) amount from a gross price. At 0% net = gross. */
export const netFromGross = (gross: number, vat: VatRate): number => round2(gross / (1 + vat / 100));

/** Gross (incl-VAT) amount from a net price. */
export const grossFromNet = (net: number, vat: VatRate): number => round2(net * (1 + vat / 100));

export const vatAmount = (gross: number, vat: VatRate): number => round2(gross - netFromGross(gross, vat));

export interface OrderMargin {
    revenueNet: number;
    workerPayout: number;
    marginPln: number;
    marginPct: number;
}

/** Margin of one order = net revenue − what we pay the homie. */
export function orderMargin(gross: number, vat: VatRate, workerPayout: number): OrderMargin {
    const revenueNet = netFromGross(gross, vat);
    const marginPln = round2(revenueNet - workerPayout);
    const marginPct = revenueNet > 0 ? round1((marginPln / revenueNet) * 100) : 0;
    return { revenueNet, workerPayout, marginPln, marginPct };
}

export interface MonthlyExpenses {
    accountant: number;
    onlineServices: number;
    salaries: number;
    taxes: number;
    socialContributions: number; // ZUS
    contractorPay: number; // B2B subcontractor
    other: number;
}

export const emptyExpenses = (): MonthlyExpenses => ({
    accountant: 0,
    onlineServices: 0,
    salaries: 0,
    taxes: 0,
    socialContributions: 0,
    contractorPay: 0,
    other: 0,
});

export const totalExpenses = (e: MonthlyExpenses): number =>
    round2(e.accountant + e.onlineServices + e.salaries + e.taxes + e.socialContributions + e.contractorPay + e.other);

export interface MonthlyReport {
    orders: number;
    revenueGross: number;
    revenueNet: number;
    vat: number;
    avgCheck: number;
    workerPayouts: number;
    grossMargin: number; // revenueNet − workerPayouts
    grossMarginPct: number;
    expenses: number;
    netProfit: number; // grossMargin − expenses (the "delta")
    netProfitPct: number;
}

/**
 * Real-time monthly report over completed missions. Recompute whenever revenue,
 * payouts, expenses or the VAT rate change.
 */
export function monthlyReport(missions: Mission[], expenses: MonthlyExpenses, vat: VatRate = 0): MonthlyReport {
    const done = missions.filter(m => m.status === 'done');
    const revenueGross = round2(done.reduce((s, m) => s + m.price, 0));
    const revenueNet = round2(done.reduce((s, m) => s + netFromGross(m.price, vat), 0));
    const orders = done.length;
    const workerPayouts = round2(done.reduce((s, m) => s + missionPayout(m), 0));
    const grossMargin = round2(revenueNet - workerPayouts);
    const exp = totalExpenses(expenses);
    const netProfit = round2(grossMargin - exp);
    return {
        orders,
        revenueGross,
        revenueNet,
        vat: round2(revenueGross - revenueNet),
        avgCheck: orders ? Math.round(revenueGross / orders) : 0,
        workerPayouts,
        grossMargin,
        grossMarginPct: revenueNet > 0 ? round1((grossMargin / revenueNet) * 100) : 0,
        expenses: exp,
        netProfit,
        netProfitPct: revenueNet > 0 ? round1((netProfit / revenueNet) * 100) : 0,
    };
}

export interface MonthReport {
    month: string; // 'YYYY-MM'
    orders: number;
    revenueNet: number;
    grossMargin: number;
}

/**
 * Per-month revenue/margin for the profit trend. Expenses are not applied here
 * (they are monthly aggregates entered separately) — this is the trading trend.
 */
export function reportsByMonth(missions: Mission[], vat: VatRate = 0): MonthReport[] {
    const map = new Map<string, MonthReport>();
    for (const m of missions) {
        if (m.status !== 'done') continue;
        const month = m.scheduledAt.slice(0, 7);
        const row = map.get(month) ?? { month, orders: 0, revenueNet: 0, grossMargin: 0 };
        const net = netFromGross(m.price, vat);
        row.orders += 1;
        row.revenueNet = round2(row.revenueNet + net);
        row.grossMargin = round2(row.grossMargin + (net - missionPayout(m)));
        map.set(month, row);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type PeriodType = 'month' | 'quarter' | 'year' | 'custom';

export interface DateRange {
    start: string; // YYYY-MM-DD
    end: string; // YYYY-MM-DD
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, mZero: number, day: number) => `${y}-${pad(mZero + 1)}-${pad(day)}`;
const lastDayOf = (y: number, mZero: number) => new Date(Date.UTC(y, mZero + 1, 0)).getUTCDate();

/** Calendar range (month / quarter / year) containing `refIso`. */
export function dateRange(type: 'month' | 'quarter' | 'year', refIso: string): DateRange {
    const d = new Date(`${refIso.slice(0, 10)}T00:00:00Z`);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    if (type === 'year') return { start: ymd(y, 0, 1), end: ymd(y, 11, 31) };
    if (type === 'quarter') {
        const qStart = Math.floor(m / 3) * 3;
        return { start: ymd(y, qStart, 1), end: ymd(y, qStart + 2, lastDayOf(y, qStart + 2)) };
    }
    return { start: ymd(y, m, 1), end: ymd(y, m, lastDayOf(y, m)) };
}

/** Missions whose scheduled date falls within [start, end] (inclusive). */
export function withinRange(missions: Mission[], start: string, end: string): Mission[] {
    return missions.filter(m => {
        const d = m.scheduledAt.slice(0, 10);
        return d >= start && d <= end;
    });
}

/** Aggregate monthly expense records whose month is within the range. */
export function sumExpensesInRange(byMonth: Record<string, MonthlyExpenses>, start: string, end: string): MonthlyExpenses {
    const s = start.slice(0, 7);
    const e = end.slice(0, 7);
    const acc = emptyExpenses();
    for (const [month, exp] of Object.entries(byMonth)) {
        if (month < s || month > e) continue;
        acc.accountant += exp.accountant;
        acc.onlineServices += exp.onlineServices;
        acc.salaries += exp.salaries;
        acc.taxes += exp.taxes;
        acc.socialContributions += exp.socialContributions;
        acc.contractorPay += exp.contractorPay;
        acc.other += exp.other;
    }
    return acc;
}

/** Full finance report for a date range: revenue in range + expenses in range. */
export function financeReportForRange(missions: Mission[], byMonth: Record<string, MonthlyExpenses>, vat: VatRate, range: DateRange): MonthlyReport {
    return monthlyReport(withinRange(missions, range.start, range.end), sumExpensesInRange(byMonth, range.start, range.end), vat);
}

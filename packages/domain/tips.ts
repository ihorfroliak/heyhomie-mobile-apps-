/**
 * Tips — an optional gratuity the client leaves after an order is done. A tip is
 * 100% pass-through to the worker: the platform takes no cut (unlike the payout
 * split in payouts.ts). Pure + tested. Whether the worker app surfaces tips is a
 * product decision (the worker otherwise sees no money), handled in the UI layer.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Tip {
    id: string;
    orderId: string; // the mission/order the tip is for
    workerId?: string; // homie who earned it (derived from the order)
    amount: number; // PLN, always > 0 when recorded
    currency: string; // 'PLN'
    createdAt: string;
}

/** Default suggested tip percentages, Bolt/Uber-style. */
export const TIP_PERCENTS = [10, 15, 20] as const;

/** Absolute cap to guard against fat-finger custom amounts. */
export const MAX_TIP_PLN = 1000;

export interface TipPreset {
    percent: number;
    amount: number; // whole PLN
}

/** Suggested tip amounts as a % of the order price, rounded to whole PLN. */
export function tipPresets(orderPrice: number, percents: readonly number[] = TIP_PERCENTS): TipPreset[] {
    return percents.map(percent => ({ percent, amount: Math.round((orderPrice * percent) / 100) }));
}

/** A tip may be zero (skip) up to a sane ceiling relative to the order. */
export function isValidTip(amount: number, orderPrice: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) return false;
    return amount <= Math.max(MAX_TIP_PLN, orderPrice * 2);
}

/** Total tip money (for admin payout/accounting). */
export const totalTips = (tips: Tip[]): number => round2(tips.reduce((s, t) => s + t.amount, 0));

/** Tips recorded against a specific order. */
export const tipsForOrder = (tips: Tip[], orderId: string): Tip[] => tips.filter(t => t.orderId === orderId);

/** Tips earned by a specific worker. */
export const tipsForWorker = (tips: Tip[], workerId: string): Tip[] => tips.filter(t => t.workerId === workerId);

/**
 * A worker's take-home for a set of missions: their payout share PLUS tips in
 * full. `basePayout` is whatever the payout module already computed (after the
 * platform cut); tips are added on top with no deduction.
 */
export const payoutWithTips = (basePayout: number, tips: Tip[]): number => round2(basePayout + totalTips(tips));

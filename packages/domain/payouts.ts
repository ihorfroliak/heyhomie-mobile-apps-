/**
 * Worker (homie) payout calculation.
 *
 * Default: a homie earns a share of each completed mission's price. An admin can
 * override the final pay for a single mission, and add a monthly bonus/adjustment.
 * Money values are whole units (zł); the backend remains authoritative when live.
 */
import type { Mission, WorkerType } from './missions';

/** Default share of the mission price paid to the homie. */
export const DEFAULT_HOMIE_SHARE = 0.7;

/**
 * Payout share by engagement type. Employees are paid directly; for B2B we pay
 * the subcontractor (who settles with the worker on their own terms), so the
 * platform share differs. Admin-configurable.
 */
export const PAYOUT_RATES: Record<WorkerType, number> = { employee: 0.7, b2b: 0.6 };

export const payoutRateFor = (type: WorkerType): number => PAYOUT_RATES[type];

export interface PayoutOptions {
    /** Final pay set by an admin for this mission — wins over the share calc. */
    override?: number;
    /** Share of price (0–1) if no override. Defaults to DEFAULT_HOMIE_SHARE. */
    share?: number;
}

/** Pay for a single mission. */
export function missionPayout(mission: Pick<Mission, 'price'>, opts: PayoutOptions = {}): number {
    if (opts.override != null) return Math.max(0, Math.round(opts.override));
    const share = opts.share ?? DEFAULT_HOMIE_SHARE;
    return Math.round(mission.price * share);
}

const inMonth = (iso: string, year: number, month1to12: number): boolean => {
    const d = new Date(iso);
    return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month1to12;
};

export interface MonthlyPayoutInput {
    missions: Mission[];
    year: number;
    month: number; // 1–12
    /** Per-mission final-pay overrides, keyed by mission id. */
    overrides?: Record<string, number>;
    /** Monthly bonus or adjustment (can be negative). */
    bonus?: number;
    share?: number;
    /** Per-mission share resolver (e.g. by the homie's worker type). Wins over `share`. */
    shareFor?: (m: Mission) => number | undefined;
}

export interface MonthlyPayout {
    count: number;
    gross: number; // sum of mission payouts
    bonus: number;
    total: number; // gross + bonus
}

/** Total monthly pay for completed missions, with per-mission overrides + a bonus. */
export function monthlyPayout(input: MonthlyPayoutInput): MonthlyPayout {
    const done = input.missions.filter(m => m.status === 'done' && inMonth(m.scheduledAt, input.year, input.month));
    const gross = done.reduce(
        (sum, m) => sum + missionPayout(m, { override: input.overrides?.[m.id], share: input.shareFor?.(m) ?? input.share }),
        0,
    );
    const bonus = input.bonus ?? 0;
    return { count: done.length, gross, bonus, total: gross + bonus };
}

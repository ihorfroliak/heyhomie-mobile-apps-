/**
 * Scheduling for recurring services — generating occurrences and the two kinds
 * of reschedule the product needs, plus the late-cancellation penalty.
 *
 * Two reschedule modes (client- or admin-initiated, same logic):
 *  A. shiftSeries   — move a visit and RE-SYNC the whole cadence from the new
 *                     date (e.g. bump a biweekly visit by a week → the next one
 *                     is +2 weeks from the moved date, not the original).
 *  B. moveOccurrence — nudge a SINGLE visit (an hour/day earlier or later)
 *                     without touching the rest of the cycle.
 * Plus skipOccurrence — cancel one visit from the cycle (…on, on, off, on…).
 *
 * Pure date math on ISO strings; tested.
 */
import type { Frequency } from './missions';

const round2 = (n: number) => Math.round(n * 100) / 100;

const addDays = (iso: string, n: number): string => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString();
};
/**
 * Add months, clamping the day to the target month's length: a monthly visit
 * booked on Jan 31 recurs on Feb 28 (29 in leap years), not Mar 3 — naive
 * setUTCMonth would overflow "Feb 31" into March and silently drift the series.
 */
const addMonths = (iso: string, n: number): string => {
    const d = new Date(iso);
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    const daysInTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, daysInTarget));
    return d.toISOString();
};
const isWeekend = (iso: string): boolean => {
    const day = new Date(iso).getUTCDay();
    return day === 0 || day === 6;
};

/**
 * The next visit date after `iso` for an interval cadence. Returns null for
 * 'once'. twice/thrice-week use approximate intervals; the exact weekday pattern
 * is chosen at booking and confirmed by the backend.
 */
export function nextOccurrence(iso: string, freq: Frequency): string | null {
    switch (freq) {
        case 'weekly':
            return addDays(iso, 7);
        case 'biweekly':
            return addDays(iso, 14);
        case 'monthly':
            return addMonths(iso, 1);
        case 'every_other_day':
            return addDays(iso, 2);
        case 'thrice_week':
            return addDays(iso, 2); // ~3×/week
        case 'twice_week':
            return addDays(iso, 3); // ~2×/week
        case 'every_workday': {
            let next = addDays(iso, 1);
            while (isWeekend(next)) next = addDays(next, 1);
            return next;
        }
        case 'once':
        default:
            return null;
    }
}

/** The first `count` occurrences starting at (and including) `anchorIso`. */
export function generateOccurrences(anchorIso: string, freq: Frequency, count: number): string[] {
    const out = [anchorIso];
    let cur = anchorIso;
    for (let i = 1; i < count; i++) {
        const next = nextOccurrence(cur, freq);
        if (!next) break;
        out.push(next);
        cur = next;
    }
    return out;
}

/**
 * Reschedule mode A. Move the visit at `index` to `newIso`, then regenerate all
 * LATER visits from it by the cadence — full re-sync. Earlier visits untouched.
 */
export function shiftSeries(occurrences: string[], index: number, newIso: string, freq: Frequency): string[] {
    if (index < 0 || index >= occurrences.length) return occurrences;
    const out = occurrences.slice(0, index);
    out.push(newIso);
    let cur = newIso;
    for (let i = index + 1; i < occurrences.length; i++) {
        const next = nextOccurrence(cur, freq);
        if (!next) break;
        out.push(next);
        cur = next;
    }
    return out;
}

/** Reschedule mode B. Move only the visit at `index`; the rest of the cycle stays. */
export function moveOccurrence(occurrences: string[], index: number, newIso: string): string[] {
    return occurrences.map((o, i) => (i === index ? newIso : o));
}

/** Cancel a single visit from the cycle (the others keep their dates). */
export function skipOccurrence(occurrences: string[], index: number): string[] {
    return occurrences.filter((_, i) => i !== index);
}

export const CANCELLATION_WINDOW_HOURS = 24;
export const CANCELLATION_FEE_RATE = 0.5; // 50%

/** Hours between now and a scheduled start (negative if already past). */
export const hoursUntil = (scheduledIso: string, nowIso: string): number =>
    round2((new Date(scheduledIso).getTime() - new Date(nowIso).getTime()) / 3_600_000);

/** A full cancellation is "late" if it lands inside the 24h window. */
export const isLateCancellation = (scheduledIso: string, nowIso: string): boolean =>
    hoursUntil(scheduledIso, nowIso) < CANCELLATION_WINDOW_HOURS;

/**
 * Fee for cancelling a visit. A within-cycle reschedule (moving a single visit
 * to a nearby slot) is exempt — only a FULL cancellation < 24h before start is
 * charged 50%.
 */
export function cancellationFee(scheduledIso: string, nowIso: string, price: number, opts: { isReschedule?: boolean } = {}): number {
    if (opts.isReschedule) return 0;
    return isLateCancellation(scheduledIso, nowIso) ? round2(price * CANCELLATION_FEE_RATE) : 0;
}

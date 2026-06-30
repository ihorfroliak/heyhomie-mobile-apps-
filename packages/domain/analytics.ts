/**
 * Admin efficiency metrics — pure aggregations over missions.
 * Keep it lean: each function answers one operational question.
 */
import type { Mission } from './missions';
import { missionPayout } from './payouts';

export interface Kpis {
    total: number;
    done: number;
    canceled: number;
    live: number; // homie_found | in_progress
    searching: number; // unassigned
    revenue: number; // completed missions
    avgMissionValue: number;
    completionRate: number; // done / (done + canceled), 0–1
    cancellationRate: number;
}

const round1 = (n: number) => Math.round(n * 100) / 100;

export function kpis(missions: Mission[]): Kpis {
    const done = missions.filter(m => m.status === 'done');
    const canceled = missions.filter(m => m.status === 'canceled');
    const settled = done.length + canceled.length;
    const revenue = done.reduce((s, m) => s + m.price, 0);
    return {
        total: missions.length,
        done: done.length,
        canceled: canceled.length,
        live: missions.filter(m => m.status === 'homie_found' || m.status === 'in_progress').length,
        searching: missions.filter(m => m.status === 'searching_homie').length,
        revenue,
        avgMissionValue: done.length ? Math.round(revenue / done.length) : 0,
        completionRate: settled ? round1(done.length / settled) : 0,
        cancellationRate: settled ? round1(canceled.length / settled) : 0,
    };
}

export interface Bucket {
    key: string;
    value: number;
}

/**
 * Missions scheduled within the last `days`. The reference point defaults to the
 * latest mission in the set (so static/demo data still filters meaningfully);
 * pass `refIso` (e.g. today) when wiring live data.
 */
export function withinLastDays(missions: Mission[], days: number, refIso?: string): Mission[] {
    if (missions.length === 0) return [];
    const ref = refIso ?? missions.reduce((max, m) => (m.scheduledAt > max ? m.scheduledAt : max), missions[0].scheduledAt);
    const refMs = new Date(`${ref.slice(0, 10)}T23:59:59Z`).getTime();
    const cutoff = refMs - days * 86_400_000;
    return missions.filter(m => new Date(m.scheduledAt).getTime() >= cutoff);
}

/** Revenue per day from completed missions (sorted ascending). */
export function revenueByDay(missions: Mission[]): Bucket[] {
    const map = new Map<string, number>();
    for (const m of missions) {
        if (m.status !== 'done') continue;
        const day = m.scheduledAt.slice(0, 10);
        map.set(day, (map.get(day) ?? 0) + m.price);
    }
    return [...map.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => a.key.localeCompare(b.key));
}

/** Mission count per city (sorted by count desc). */
export function countByCity(missions: Mission[]): Bucket[] {
    return groupCount(missions.map(m => m.address.city));
}

/** Mission count per plan (standard / general). */
export function countByPlan(missions: Mission[]): Bucket[] {
    return groupCount(missions.map(m => m.plan));
}

function groupCount(keys: string[]): Bucket[] {
    const map = new Map<string, number>();
    for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1);
    return [...map.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}

/** Share of clients who completed more than one mission (loyalty / retention). */
export function repeatRate(missions: Mission[]): number {
    const counts = new Map<string, number>();
    for (const m of missions) {
        if (m.status === 'done') counts.set(m.client.id, (counts.get(m.client.id) ?? 0) + 1);
    }
    if (counts.size === 0) return 0;
    const repeat = [...counts.values()].filter(c => c >= 2).length;
    return round1(repeat / counts.size);
}

/** Worker utilization: worked minutes / available capacity (0–1, capped). */
export function utilization(missions: Mission[], capacityMinutes: number): number {
    if (capacityMinutes <= 0) return 0;
    const worked = missions.filter(m => m.status === 'done').reduce((s, m) => s + m.durationMinutes, 0);
    return round1(Math.min(1, worked / capacityMinutes));
}

/** Average minutes from request to a homie being found (missions with both stamps). */
export function avgAssignmentMinutes(missions: Mission[]): number {
    const deltas = missions
        .filter(m => m.createdAt && m.assignedAt)
        .map(m => (new Date(m.assignedAt as string).getTime() - new Date(m.createdAt as string).getTime()) / 60000);
    if (!deltas.length) return 0;
    return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
}

/** Average rating per city from completed, rated missions (sorted desc). */
export function avgRatingByCity(missions: Mission[]): Bucket[] {
    const acc = new Map<string, { total: number; n: number }>();
    for (const m of missions) {
        if (m.status === 'done' && m.rating != null) {
            const e = acc.get(m.address.city) ?? { total: 0, n: 0 };
            e.total += m.rating;
            e.n += 1;
            acc.set(m.address.city, e);
        }
    }
    return [...acc.entries()].map(([key, e]) => ({ key, value: round1(e.total / e.n) })).sort((a, b) => b.value - a.value);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Completed-mission revenue per weekday, returned Mon→Sun. */
export function revenueByWeekday(missions: Mission[]): Bucket[] {
    const totals = [0, 0, 0, 0, 0, 0, 0];
    for (const m of missions) {
        if (m.status === 'done') totals[new Date(m.scheduledAt).getUTCDay()] += m.price;
    }
    return [1, 2, 3, 4, 5, 6, 0].map(i => ({ key: WEEKDAYS[i], value: totals[i] }));
}

export interface WorkerRow {
    homieId: string;
    firstName: string;
    missions: number;
    payout: number;
}

/** Completed missions and payout per homie (sorted by payout desc). */
export function workerLeaderboard(missions: Mission[]): WorkerRow[] {
    const map = new Map<string, WorkerRow>();
    for (const m of missions) {
        if (m.status !== 'done' || !m.homie) continue;
        const row = map.get(m.homie.id) ?? { homieId: m.homie.id, firstName: m.homie.firstName, missions: 0, payout: 0 };
        row.missions += 1;
        row.payout += missionPayout(m);
        map.set(m.homie.id, row);
    }
    return [...map.values()].sort((a, b) => b.payout - a.payout);
}

export interface DashboardSummary {
    /** Headline numbers — show these prominently. */
    primary: { revenue: number; completed: number; completionRate: number; avgMissionValue: number };
    /** Supporting numbers — keep these in a secondary / collapsible section. */
    secondary: { cancellationRate: number; repeatRate: number; utilization: number; avgAssignmentMinutes: number; live: number; searching: number };
    charts: { revenueByDay: Bucket[]; revenueByWeekday: Bucket[]; countByPlan: Bucket[]; avgRatingByCity: Bucket[]; leaderboard: WorkerRow[] };
}

/**
 * One view-model for the whole admin dashboard. Both the mobile admin app and the
 * web admin render from this — so the numbers stay identical and, once the backend
 * is live, only the data source changes (not the screens).
 */
export function dashboardSummary(missions: Mission[], opts: { capacityMinutes?: number } = {}): DashboardSummary {
    const k = kpis(missions);
    return {
        primary: { revenue: k.revenue, completed: k.done, completionRate: k.completionRate, avgMissionValue: k.avgMissionValue },
        secondary: {
            cancellationRate: k.cancellationRate,
            repeatRate: repeatRate(missions),
            utilization: utilization(missions, opts.capacityMinutes ?? 0),
            avgAssignmentMinutes: avgAssignmentMinutes(missions),
            live: k.live,
            searching: k.searching,
        },
        charts: {
            revenueByDay: revenueByDay(missions),
            revenueByWeekday: revenueByWeekday(missions),
            countByPlan: countByPlan(missions),
            avgRatingByCity: avgRatingByCity(missions),
            leaderboard: workerLeaderboard(missions),
        },
    };
}

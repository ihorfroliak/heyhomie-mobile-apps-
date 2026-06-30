/**
 * Pure view-model selectors shared by the apps' screens.
 */
import type { Mission, MissionStatus } from './missions';

const PAST_STATUSES: MissionStatus[] = ['done', 'canceled', 'unpaid'];

export interface SplitMissions {
    upcoming: Mission[];
    past: Mission[];
}

const byDateAsc = (a: Mission, b: Mission) => a.scheduledAt.localeCompare(b.scheduledAt);
const byDateDesc = (a: Mission, b: Mission) => b.scheduledAt.localeCompare(a.scheduledAt);

/** Split one-off missions into upcoming (soonest first) and past (newest first). */
export function splitMissions(missions: Mission[]): SplitMissions {
    return {
        upcoming: missions.filter(m => !PAST_STATUSES.includes(m.status)).sort(byDateAsc),
        past: missions.filter(m => PAST_STATUSES.includes(m.status)).sort(byDateDesc),
    };
}

export interface AdminStats {
    total: number;
    live: number; // homie_found or in_progress
    searching: number; // unassigned, need attention
    done: number;
    revenue: number; // sum of completed mission prices
}

/** Dashboard summary across a set of missions. */
export function adminStats(missions: Mission[]): AdminStats {
    return missions.reduce<AdminStats>(
        (acc, m) => {
            acc.total += 1;
            if (m.status === 'homie_found' || m.status === 'in_progress') acc.live += 1;
            if (m.status === 'searching_homie') acc.searching += 1;
            if (m.status === 'done') {
                acc.done += 1;
                acc.revenue += m.price;
            }
            return acc;
        },
        { total: 0, live: 0, searching: 0, done: 0, revenue: 0 }
    );
}

export type TimelineState = 'done' | 'current' | 'upcoming';
export type TimelineKey = 'homie_found' | 'in_progress' | 'done';

export interface TimelineStep {
    key: TimelineKey;
    state: TimelineState;
}

/** The single action a worker can take on a mission, given its status. */
export type WorkerAction = 'accept' | 'begin' | 'complete' | null;

export function workerAction(status: MissionStatus): WorkerAction {
    switch (status) {
        case 'searching_homie':
            return 'accept';
        case 'homie_found':
            return 'begin'; // check in & start
        case 'in_progress':
            return 'complete'; // check out & finish
        default:
            return null;
    }
}

const TIMELINE_ORDER: TimelineKey[] = ['homie_found', 'in_progress', 'done'];

/**
 * Status -> progress steps for the mission-detail timeline.
 * `searching_homie` = nothing reached yet; `done` = all complete.
 */
export function missionTimeline(status: MissionStatus): TimelineStep[] {
    if (status === 'done') return TIMELINE_ORDER.map(key => ({ key, state: 'done' as const }));
    const idx = TIMELINE_ORDER.indexOf(status as TimelineKey); // -1 for searching_homie
    return TIMELINE_ORDER.map((key, i) => ({
        key,
        state: i < idx ? 'done' : i === idx ? 'current' : 'upcoming',
    }));
}

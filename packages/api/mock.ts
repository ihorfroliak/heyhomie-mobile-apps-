/**
 * HeyHomie — mock API layer.
 *
 * Lets all three apps run before the real Rails/Go backend is wired. It holds
 * sample data and the business-logic helpers that the UI depends on (status
 * transitions, homie availability, reschedule + reassign). Swap this module for
 * a real HTTP client later — the function signatures stay the same.
 */

import {
    Mission,
    MissionStatus,
    PersonRef,
    isMissionEditable,
} from '../domain';

/* ------------------------------------------------------------------ */
/* People & availability                                               */
/* ------------------------------------------------------------------ */

export type { WorkerType } from '../domain';
import type { WorkerType } from '../domain';

export interface HomieProfile extends PersonRef {
    city: string;
    services: string[]; // e.g. ['cleaning', 'windows']
    /** Engagement type — set by admin when adding the homie. */
    workerType: WorkerType;
    /** Subcontractor id, when workerType === 'b2b'. */
    contractorId?: string;
    /** Weekdays the homie works (0 = Sunday … 6 = Saturday). */
    availableWeekdays: number[];
    /** ISO dates (YYYY-MM-DD) the homie is blocked / already booked. */
    blockedDates: string[];
}

export const homies: HomieProfile[] = [
    { id: 'h1', firstName: 'Olena', lastInitial: 'K', rating: 4.9, city: 'krakow', services: ['cleaning', 'windows'], workerType: 'employee', availableWeekdays: [1, 2, 4, 5, 6], blockedDates: ['2025-05-15'] },
    { id: 'h2', firstName: 'Marta', lastInitial: 'W', rating: 4.8, city: 'krakow', services: ['cleaning'], workerType: 'b2b', contractorId: 'ctr-1', availableWeekdays: [1, 2, 3, 4, 5], blockedDates: [] },
    { id: 'h3', firstName: 'Yulia', lastInitial: 'D', rating: 4.7, city: 'krakow', services: ['cleaning', 'windows'], workerType: 'employee', availableWeekdays: [3, 5, 6], blockedDates: [] },
];

/** Day-of-week (UTC) for an ISO date, robust to a date-only string. */
const weekdayOf = (isoDate: string): number => new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).getUTCDay();

/** Is a specific homie free to work on a given date? */
export function isHomieAvailable(homie: HomieProfile, isoDate: string): boolean {
    const day = weekdayOf(isoDate);
    return homie.availableWeekdays.includes(day) && !homie.blockedDates.includes(isoDate.slice(0, 10));
}

/** First date (within `withinDays`) a homie is available, scanning from `fromIso`. */
export function nextAvailableDate(homie: HomieProfile, fromIso: string, withinDays = 14): string | null {
    const start = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
    for (let i = 0; i < withinDays; i++) {
        const iso = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
        if (isHomieAvailable(homie, iso)) return iso;
    }
    return null;
}

/** Homies in a city offering a service and free on a date — used for assign / reassign. */
export function suggestHomies(city: string, service: string, isoDate: string): HomieProfile[] {
    return homies
        .filter(h => h.city === city && h.services.includes(service) && isHomieAvailable(h, isoDate))
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

/* ------------------------------------------------------------------ */
/* Mission status transitions                                          */
/* ------------------------------------------------------------------ */

export type MissionAction = 'assign' | 'begin' | 'complete' | 'cancel';

/** Allowed status after each action, given the current status. null = not allowed. */
const TRANSITIONS: Record<MissionAction, Partial<Record<MissionStatus, MissionStatus>>> = {
    assign: { searching_homie: 'homie_found' },
    begin: { homie_found: 'in_progress' },
    complete: { in_progress: 'done' },
    cancel: { searching_homie: 'canceled', homie_found: 'canceled' },
};

export class TransitionError extends Error {}

/**
 * Pure status transition with guards. Returns a NEW mission (no mutation).
 * `assign` requires a homie; `complete` records check-out time.
 */
export function transitionMission(mission: Mission, action: MissionAction, payload?: { homie?: PersonRef; at?: string }): Mission {
    const next = TRANSITIONS[action][mission.status];
    if (!next) {
        throw new TransitionError(`Cannot ${action} a mission that is ${mission.status}`);
    }
    const now = payload?.at ?? new Date().toISOString();
    const updated: Mission = { ...mission, status: next };

    if (action === 'assign') {
        if (!payload?.homie) throw new TransitionError('assign requires a homie');
        updated.homie = payload.homie;
    }
    if (action === 'begin') {
        updated.checkInAt = now;
    }
    if (action === 'complete') {
        updated.checkOutAt = now;
    }
    return updated;
}

/* ------------------------------------------------------------------ */
/* Reschedule + reassign                                               */
/* ------------------------------------------------------------------ */

export interface RescheduleResult {
    ok: boolean;
    mission?: Mission;
    /** When the assigned homie is unavailable, alternatives the client can pick. */
    alternatives?: HomieProfile[];
    reason?: 'frozen' | 'homie_unavailable';
}

/**
 * Move a mission to a new date.
 *  - The assigned homie keeps the mission if they are free on the new date.
 *  - If they are not free, we return alternative homies (client can reassign).
 * Editing is blocked once the mission is no longer `searching_homie`/`homie_found`
 * (status freeze from the Rails<->Go sync rules).
 */
export function rescheduleMission(mission: Mission, newDateIso: string, service = 'cleaning'): RescheduleResult {
    if (mission.status !== 'searching_homie' && mission.status !== 'homie_found') {
        return { ok: false, reason: 'frozen' };
    }

    const assigned = mission.homie ? homies.find(h => h.id === mission.homie!.id) : undefined;
    if (assigned && isHomieAvailable(assigned, newDateIso)) {
        return { ok: true, mission: { ...mission, scheduledAt: newDateIso } };
    }

    const alternatives = suggestHomies(mission.address.city, service, newDateIso).filter(h => h.id !== assigned?.id);
    return { ok: false, reason: 'homie_unavailable', alternatives };
}

/** Reassign a mission to a different homie (e.g. after the original is unavailable). */
export function reassignHomie(mission: Mission, homie: PersonRef, newDateIso?: string): Mission {
    if (mission.status !== 'searching_homie' && mission.status !== 'homie_found') {
        throw new TransitionError(`Cannot reassign a mission that is ${mission.status}`);
    }
    return {
        ...mission,
        homie,
        status: 'homie_found',
        ...(newDateIso ? { scheduledAt: newDateIso } : {}),
    };
}

/** Convenience guard re-exported for the UI. */
export const canEditMission = isMissionEditable;

/**
 * Booking funnel. A BookingDraft tracks a client's progress through the booking
 * flow so we can see WHERE orders are abandoned and re-engage. Every draft that
 * doesn't reach 'confirmed' within a threshold is "abandoned" and becomes a lead
 * (see leads.ts). Pure + tested.
 */

export type BookingStage =
    | 'started' // opened booking
    | 'service_selected'
    | 'configured' // rooms/add-ons or delivery details chosen
    | 'contact_entered'
    | 'scheduled' // date/time picked
    | 'confirmed'; // order placed

export const STAGE_ORDER: BookingStage[] = ['started', 'service_selected', 'configured', 'contact_entered', 'scheduled', 'confirmed'];

export const stageIndex = (s: BookingStage): number => STAGE_ORDER.indexOf(s);

export interface BookingDraft {
    id: string;
    clientId?: string;
    contact?: { phone?: string; email?: string };
    cityId?: string;
    serviceId?: string;
    stage: BookingStage;
    updatedAt: string; // ISO of the last step
    estValue?: number; // estimated order value (PLN)
    /** Flower-delivery bookings carry the recipient/slot/note details. */
    delivery?: import('./delivery').DeliveryDetails;
}

export const ABANDON_THRESHOLD_MIN = 30;

export const minutesSince = (iso: string, nowIso: string): number =>
    Math.round((new Date(nowIso).getTime() - new Date(iso).getTime()) / 60000);

/** A draft is abandoned if it stalled below 'confirmed' past the threshold. */
export function isAbandoned(d: BookingDraft, nowIso: string, thresholdMin = ABANDON_THRESHOLD_MIN): boolean {
    return d.stage !== 'confirmed' && minutesSince(d.updatedAt, nowIso) > thresholdMin;
}

export const abandonedDrafts = (drafts: BookingDraft[], nowIso: string, thresholdMin = ABANDON_THRESHOLD_MIN): BookingDraft[] =>
    drafts.filter(d => isAbandoned(d, nowIso, thresholdMin));

export interface FunnelStep {
    stage: BookingStage;
    reached: number; // drafts that reached AT LEAST this stage
}

/** Cumulative funnel — how many drafts got to each stage or beyond. */
export function funnelCounts(drafts: BookingDraft[]): FunnelStep[] {
    return STAGE_ORDER.map(stage => ({
        stage,
        reached: drafts.filter(d => stageIndex(d.stage) >= stageIndex(stage)).length,
    }));
}

/** Confirmed / total (0–1). Named distinctly from marketing.conversionRate. */
export function bookingConversion(drafts: BookingDraft[]): number {
    if (!drafts.length) return 0;
    const confirmed = drafts.filter(d => d.stage === 'confirmed').length;
    return Math.round((confirmed / drafts.length) * 100) / 100;
}

/** The stage with the biggest drop-off to the next one — where to focus. */
export function biggestDropStage(drafts: BookingDraft[]): BookingStage | null {
    const counts = funnelCounts(drafts);
    let worst: BookingStage | null = null;
    let worstDrop = 0;
    for (let i = 0; i < counts.length - 1; i++) {
        const drop = counts[i].reached - counts[i + 1].reached;
        if (drop > worstDrop) {
            worstDrop = drop;
            worst = counts[i].stage;
        }
    }
    return worst;
}

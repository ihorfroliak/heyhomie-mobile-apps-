/**
 * Product + lifecycle events shared by all apps and the web.
 * One typed union so analytics (Google Analytics / Firebase) and in-app
 * notifications speak the same language.
 */
export type AnalyticsEvent =
    | { name: 'screen_view'; screen: string; durationMs?: number }
    /** Heatmap tap — x/y are 0–1 fractions of the screen for device independence. */
    | { name: 'tap'; screen: string; target: string; x?: number; y?: number }
    | { name: 'funnel_step'; stage: string; serviceId?: string }
    | { name: 'booking_abandoned'; stage: string; serviceId?: string }
    | { name: 'lead_captured'; source: string; serviceId?: string }
    | { name: 'mission_booked'; plan: string; minutes: number; addOns: number }
    | { name: 'mission_assigned'; missionId: string; homieId: string }
    | { name: 'mission_started'; missionId: string }
    | { name: 'mission_completed'; missionId: string; rating?: number }
    | { name: 'mission_canceled'; missionId: string }
    | { name: 'mission_rescheduled'; missionId: string; date: string }
    | { name: 'rating_submitted'; missionId: string; stars: number }
    | { name: 'payout_processed'; homieId: string; amount: number }
    | { name: 'message_sent'; from: 'client' | 'worker' | 'admin'; missionId?: string };

export type EventName = AnalyticsEvent['name'];

/** Notification targeted at a user role — derived from the same events. */
export interface AppNotification {
    id: string;
    to: 'client' | 'worker' | 'admin';
    title: string;
    body?: string;
    event?: EventName;
    createdAt: string;
}

/**
 * Product + lifecycle events shared by all apps and the web.
 * One typed union so analytics (Google Analytics / Firebase) and in-app
 * notifications speak the same language.
 */
export type AnalyticsEvent =
    | { name: 'screen_view'; screen: string }
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

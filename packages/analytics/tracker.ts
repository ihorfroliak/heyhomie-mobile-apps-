/**
 * Tracker abstraction. Swap implementations per platform without touching call
 * sites: web -> Google Analytics (gtag), native -> Firebase Analytics, dev ->
 * console, tests -> memory. Wire a real adapter at app startup.
 */
import type { AnalyticsEvent } from './events';

export interface Tracker {
    track(event: AnalyticsEvent): void;
    identify(userId: string, traits?: Record<string, unknown>): void;
}

export const noopTracker: Tracker = {
    track: () => {},
    identify: () => {},
};

/** Logs events — handy in development. */
export function consoleTracker(): Tracker {
    return {
        track: e => console.log('[analytics]', e.name, e),
        identify: (id, traits) => console.log('[analytics] identify', id, traits),
    };
}

/** Records events in memory — used by tests and debug overlays. */
export function memoryTracker(): { events: AnalyticsEvent[]; tracker: Tracker } {
    const events: AnalyticsEvent[] = [];
    return {
        events,
        tracker: {
            track: e => {
                events.push(e);
            },
            identify: () => {},
        },
    };
}

/** Fan-out to several trackers (e.g. GA + console). */
export function multiTracker(trackers: Tracker[]): Tracker {
    return {
        track: e => trackers.forEach(t => t.track(e)),
        identify: (id, traits) => trackers.forEach(t => t.identify(id, traits)),
    };
}

/**
 * Example Google Analytics (GA4) adapter for the web build. Lives here as a
 * reference; instantiate it in the Next.js app where `gtag` is available.
 *
 *   export const gaTracker = (gtag): Tracker => ({
 *     track: (e) => gtag('event', e.name, e),
 *     identify: (id) => gtag('set', { user_id: id }),
 *   });
 *
 * HEATMAPS / session analytics: the typed 'tap' (with 0–1 x/y), 'screen_view'
 * (with durationMs) and 'funnel_step' events feed a heatmap/session provider.
 * Wire a provider adapter the same way, e.g. PostHog, Microsoft Clarity or UXCam
 * for React Native:
 *
 *   export const heatmapTracker = (posthog): Tracker => ({
 *     track: (e) => posthog.capture(e.name, e),   // taps/screens build the heatmap
 *     identify: (id, traits) => posthog.identify(id, traits),
 *   });
 *
 * Combine with multiTracker([gaTracker, heatmapTracker]) so product analytics
 * and heatmaps receive the same event stream.
 */

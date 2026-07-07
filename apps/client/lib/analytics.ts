/**
 * App-level analytics wiring. In development we log to console; in production
 * add a product-analytics + heatmap/session provider adapter here (PostHog,
 * Microsoft Clarity, or UXCam for React Native) via multiTracker — the typed
 * 'tap' / 'screen_view' / 'funnel_step' events then build the heatmaps.
 */
import { consoleTracker, multiTracker, type Tracker, type AnalyticsEvent } from '@heyhomie/analytics';

const tracker: Tracker = multiTracker([
    consoleTracker(),
    // heatmapTracker(posthog),   // ← wire the provider at startup when live
]);

export const track = (event: AnalyticsEvent): void => tracker.track(event);
export const identify = (id: string, traits?: Record<string, unknown>): void => tracker.identify(id, traits);

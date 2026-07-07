/**
 * Marketing data source — Google Ads campaigns + GA4 snapshot.
 *
 * The interface is what the admin screen consumes. `mockMarketingClient` serves
 * demo data offline; swap for real adapters against the Google Ads API and the
 * GA4 Data API when credentials are available (see MARKETING.md).
 */
import type { AdCampaign, AnalyticsSnapshot } from '../domain';
import { demoCampaigns, demoAnalyticsSnapshot } from './demo';

export interface MarketingClient {
    getCampaigns(): Promise<AdCampaign[]>;
    getAnalytics(): Promise<AnalyticsSnapshot>;
}

/** Offline mock implementation. */
export function mockMarketingClient(): MarketingClient {
    return {
        async getCampaigns() {
            return demoCampaigns;
        },
        async getAnalytics() {
            return demoAnalyticsSnapshot;
        },
    };
}

/** Credentials for the live adapters — supplied via environment, never committed. */
export interface MarketingConfig {
    googleAdsCustomerId?: string;
    googleAdsDeveloperToken?: string;
    ga4PropertyId?: string;
    /** OAuth access token (short-lived) obtained server-side. */
    accessToken?: string;
}

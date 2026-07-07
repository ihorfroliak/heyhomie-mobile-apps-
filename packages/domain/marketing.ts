/**
 * Marketing analytics — Google Ads performance, attribution and the derived KPIs
 * that tell the admin how much revenue advertising actually generated.
 *
 * Pure functions. Ad/GA data comes from `packages/api` (mock now; Google Ads API
 * and GA4 Data API when live). Attribution is source-based: a mission carries the
 * `acquisitionSource` of the client it belongs to.
 */
import type { Mission, AcquisitionSource } from './missions';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface AdCampaign {
    id: string;
    name: string;
    source: 'google_ads';
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number; // e.g. bookings attributed by the ad platform
}

/** Return on ad spend = attributed revenue / spend (e.g. 4.0 = 4x). */
export const roas = (attributedRevenue: number, spend: number): number => (spend > 0 ? round2(attributedRevenue / spend) : 0);

/** Customer acquisition cost = spend / new customers. */
export const cac = (spend: number, newCustomers: number): number => (newCustomers > 0 ? round2(spend / newCustomers) : 0);

export const cpc = (spend: number, clicks: number): number => (clicks > 0 ? round2(spend / clicks) : 0);
export const cpa = (spend: number, conversions: number): number => (conversions > 0 ? round2(spend / conversions) : 0);
export const ctr = (clicks: number, impressions: number): number => (impressions > 0 ? round1((clicks / impressions) * 100) : 0);
export const conversionRate = (conversions: number, clicks: number): number => (clicks > 0 ? round1((conversions / clicks) * 100) : 0);

/** Completed-mission revenue attributed to a given acquisition source. */
export function attributedRevenue(missions: Mission[], source: AcquisitionSource): number {
    return round2(missions.filter(m => m.status === 'done' && m.acquisitionSource === source).reduce((s, m) => s + m.price, 0));
}

export interface RevenueShare {
    source: AcquisitionSource;
    revenue: number;
    pct: number; // share of total attributed revenue, 0–100
}

/** Revenue split by acquisition source (paid vs organic vs referral vs direct). */
export function revenueBySource(missions: Mission[]): RevenueShare[] {
    const acc = new Map<AcquisitionSource, number>();
    let total = 0;
    for (const m of missions) {
        if (m.status !== 'done') continue;
        const src = m.acquisitionSource ?? 'direct';
        acc.set(src, (acc.get(src) ?? 0) + m.price);
        total += m.price;
    }
    return [...acc.entries()]
        .map(([source, revenue]) => ({ source, revenue: round2(revenue), pct: total > 0 ? round1((revenue / total) * 100) : 0 }))
        .sort((a, b) => b.revenue - a.revenue);
}

export interface CampaignReport extends AdCampaign {
    attributedRevenue: number;
    roas: number;
    cpc: number;
    cpa: number;
    ctr: number;
    conversionRate: number;
}

export function campaignReport(campaign: AdCampaign, attributedRev: number): CampaignReport {
    return {
        ...campaign,
        attributedRevenue: round2(attributedRev),
        roas: roas(attributedRev, campaign.spend),
        cpc: cpc(campaign.spend, campaign.clicks),
        cpa: cpa(campaign.spend, campaign.conversions),
        ctr: ctr(campaign.clicks, campaign.impressions),
        conversionRate: conversionRate(campaign.conversions, campaign.clicks),
    };
}

/** Google Analytics (GA4) snapshot — display model for the marketing screen. */
export interface AnalyticsSnapshot {
    sessions: number;
    users: number;
    newUsers: number;
    bounceRatePct: number;
    avgSessionSec: number;
    conversions: number;
}

/** Session-to-booking conversion rate from a GA snapshot. */
export const sessionConversionRate = (snap: AnalyticsSnapshot): number => (snap.sessions > 0 ? round1((snap.conversions / snap.sessions) * 100) : 0);

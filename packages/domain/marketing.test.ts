/** Run with: npx -y tsx packages/domain/marketing.test.ts */
import { roas, cac, cpc, cpa, ctr, conversionRate, attributedRevenue, revenueBySource, campaignReport, sessionConversionRate, type AdCampaign } from './marketing';
import type { Mission } from './missions';

let passed = 0;
const fail: string[] = [];
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const mk = (over: Partial<Mission>): Mission =>
    ({
        id: 'm', status: 'done', plan: 'standard', params: { rooms: 1, kitchens: 1, bathrooms: 1 }, addOns: [], scheduledAt: '2025-05-01',
        durationMinutes: 180, travelBufferMinutes: 15, workerCount: 1, address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'krakow' },
        client: { id: 'c', firstName: 'A' }, price: 200, currency: 'PLN', ...over,
    }) as Mission;

// ratios
eq('roas 400/100', roas(400, 100), 4);
eq('cac 500/10', cac(500, 10), 50);
eq('cpc 420/1200', cpc(420, 1200), 0.35);
eq('cpa 420/34', cpa(420, 34), 12.35);
eq('ctr 1200/38000', ctr(1200, 38000), 3.2);
eq('conversionRate 34/1200', conversionRate(34, 1200), 2.8);
eq('roas guards divide-by-zero', roas(100, 0), 0);

// attribution
const missions = [
    mk({ id: 'a', price: 256, acquisitionSource: 'google_ads' }),
    mk({ id: 'b', price: 219, acquisitionSource: 'google_ads' }),
    mk({ id: 'c', price: 200, acquisitionSource: 'google_ads', status: 'canceled' }),
    mk({ id: 'd', price: 189, acquisitionSource: 'organic' }),
    mk({ id: 'e', price: 180, acquisitionSource: 'referral' }),
];
eq('attributed google_ads revenue (done only)', attributedRevenue(missions, 'google_ads'), 475);
const shares = revenueBySource(missions);
eq('revenue split top source', shares[0].source, 'google_ads');
eq('shares sum to ~100%', Math.round(shares.reduce((s, x) => s + x.pct, 0)), 100);

// campaign report
const camp: AdCampaign = { id: 'g1', name: 'K', source: 'google_ads', spend: 100, impressions: 10000, clicks: 400, conversions: 20 };
const rep = campaignReport(camp, 400);
eq('campaign roas', rep.roas, 4);
eq('campaign cpc', rep.cpc, 0.25);
eq('campaign conv rate', rep.conversionRate, 5);

// GA
eq('session conversion rate', sessionConversionRate({ sessions: 1000, users: 800, newUsers: 500, bounceRatePct: 40, avgSessionSec: 90, conversions: 25 }), 2.5);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All marketing tests passed.');

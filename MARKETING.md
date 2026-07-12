> ⚠️ **LEGACY DOCUMENT**
>
> Describes a historical (pre-Build-04) architecture and is preserved for reference only. Current project documentation begins at **[docs/INDEX.md](docs/INDEX.md)**.

# Marketing analytics — Google Ads + GA4

The admin **Marketing** screen shows how much revenue advertising generated
(ROAS, CAC, revenue by source) and a GA4 snapshot. Everything renders from a
single client interface, so going live is swapping the mock for real adapters.

## Data flow

```
admin/marketing.tsx
   ├─ @heyhomie/domain  → roas, cac, cpc, ctr, attributedRevenue, revenueBySource, campaignReport
   └─ @heyhomie/api     → MarketingClient.getCampaigns() / getAnalytics()
                          (mockMarketingClient now → real adapters when live)
```

## Attribution model
A mission carries `acquisitionSource` (`google_ads` | `organic` | `referral` |
`direct`). `attributedRevenue(missions, 'google_ads')` sums completed missions from
paid traffic; ROAS = that revenue ÷ ad spend. Per-campaign revenue is apportioned
by the campaign's share of conversions.

Set `acquisitionSource` when an order is created (from the GA4 client id / UTM /
gclid captured on the web + client apps).

## Going live

### Google Ads API
- Create a Google Ads API developer token; use OAuth2 for the manager/customer
  account. Query campaign metrics with GAQL (spend = `metrics.cost_micros / 1e6`,
  `metrics.clicks`, `metrics.impressions`, `metrics.conversions`).
- Implement `MarketingClient.getCampaigns()` to map the response to `AdCampaign`.

### GA4 Data API
- Enable the Google Analytics Data API on the GA4 property.
- Run a `runReport` for metrics: `sessions`, `totalUsers`, `newUsers`,
  `bounceRate`, `averageSessionDuration`, `conversions`.
- Map to `AnalyticsSnapshot` in `getAnalytics()`.

### Credentials (never committed)
Provide via environment (see `.env.example`), resolved into `MarketingConfig`:

```
GOOGLE_ADS_CUSTOMER_ID=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
GA4_PROPERTY_ID=...
```

OAuth tokens are short-lived and should be obtained **server-side** (a small proxy
endpoint), so the apps never hold long-lived Google credentials.

## Tested
`packages/domain/marketing.test.ts` — 14 tests (ratios, attribution, campaign
report, GA conversion rate).

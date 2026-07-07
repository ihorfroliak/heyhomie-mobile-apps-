import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoCampaigns, demoAnalyticsSnapshot, demoAnalyticsMissions } from '@heyhomie/api';
import {
    attributedRevenue,
    revenueBySource,
    campaignReport,
    roas,
    cac,
    sessionConversionRate,
    formatMoney,
    formatDuration,
    type AcquisitionSource,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const SectionLabel = ({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) => (
    <View style={styles.sectionRow}>
        <Ionicons name={icon} size={14} color={colors.grey} />
        <Text style={styles.sectionText}>{text}</Text>
    </View>
);

const locale: Locale = 'en';
const money = (n: number) => formatMoney(n, 'PLN', locale);

const SOURCE_META: Record<AcquisitionSource, { label: string; color: string }> = {
    google_ads: { label: 'Google Ads', color: colors.blue },
    organic: { label: 'Organic', color: colors.success },
    referral: { label: 'Referral', color: colors.pink },
    direct: { label: 'Direct', color: colors.grey },
};

export default function Marketing() {
    const missions = demoAnalyticsMissions;
    const totalSpend = demoCampaigns.reduce((s, c) => s + c.spend, 0);
    const totalConversions = demoCampaigns.reduce((s, c) => s + c.conversions, 0);
    const adRevenue = attributedRevenue(missions, 'google_ads');
    const overallRoas = roas(adRevenue, totalSpend);
    const overallCac = cac(totalSpend, totalConversions);
    const shares = revenueBySource(missions);
    const maxShare = Math.max(1, ...shares.map(s => s.revenue));
    const snap = demoAnalyticsSnapshot;

    const roasColor = overallRoas >= 3 ? colors.success : overallRoas >= 1 ? colors.warning : colors.danger;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Marketing' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.chip}>
                    <Ionicons name="information-circle-outline" size={12} color={colors.grey} />
                    <Text style={styles.chipText}>Mock data — live via Google Ads API + GA4</Text>
                </View>

                {/* Headline */}
                <View style={styles.grid}>
                    <Hero label="Ad spend" value={money(totalSpend)} />
                    <Hero label="Ad revenue" value={money(adRevenue)} />
                    <Hero label="ROAS" value={`${overallRoas}x`} color={roasColor} />
                    <Hero label="CAC" value={money(overallCac)} />
                </View>

                {/* Revenue by source */}
                <SectionLabel icon="pie-chart-outline" text="Revenue by source" />
                <Card>
                    {shares.map(s => (
                        <View key={s.source} style={styles.srcRow}>
                            <Text style={styles.srcLabel}>{SOURCE_META[s.source].label}</Text>
                            <View style={styles.track}>
                                <View style={[styles.fill, { width: `${(s.revenue / maxShare) * 100}%`, backgroundColor: SOURCE_META[s.source].color }]} />
                            </View>
                            <Text style={styles.srcVal}>
                                {money(s.revenue)} · {s.pct}%
                            </Text>
                        </View>
                    ))}
                </Card>

                {/* Campaigns */}
                <SectionLabel icon="megaphone-outline" text="Google Ads campaigns" />
                {demoCampaigns.map(c => {
                    const rep = campaignReport(c, (adRevenue * c.conversions) / totalConversions);
                    const rColor = rep.roas >= 3 ? colors.success : rep.roas >= 1 ? colors.warning : colors.danger;
                    return (
                        <Card key={c.id} style={styles.card}>
                            <View style={styles.campHead}>
                                <Text style={styles.campName}>{c.name}</Text>
                                <View style={[styles.roasBadge, { backgroundColor: `${rColor}1A` }]}>
                                    <Text style={[styles.roasText, { color: rColor }]}>{rep.roas}x ROAS</Text>
                                </View>
                            </View>
                            <View style={styles.campStats}>
                                <Stat label="Spend" value={money(c.spend)} />
                                <Stat label="Clicks" value={String(c.clicks)} />
                                <Stat label="Conv." value={String(c.conversions)} />
                                <Stat label="CPC" value={money(rep.cpc)} />
                                <Stat label="CTR" value={`${rep.ctr}%`} />
                            </View>
                        </Card>
                    );
                })}

                {/* GA4 */}
                <SectionLabel icon="analytics-outline" text="Google Analytics (GA4)" />
                <Card variant="fill">
                    <View style={styles.gaGrid}>
                        <Stat label="Sessions" value={snap.sessions.toLocaleString()} />
                        <Stat label="Users" value={snap.users.toLocaleString()} />
                        <Stat label="New users" value={snap.newUsers.toLocaleString()} />
                        <Stat label="Conv. rate" value={`${sessionConversionRate(snap)}%`} />
                        <Stat label="Bounce" value={`${snap.bounceRatePct}%`} />
                        <Stat label="Avg session" value={formatDuration(Math.round(snap.avgSessionSec / 60))} />
                    </View>
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}

const Hero = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <Card variant="fill" style={styles.hero}>
        <Text style={styles.heroLabel}>{label}</Text>
        <Text style={[styles.heroValue, color ? { color } : null]}>{value}</Text>
    </Card>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.stat}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: colors.bgLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: spacing.md },
    chipText: { color: colors.grey, fontSize: typography.sizes.caption },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    hero: { width: '47%' },
    heroLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    heroValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 4 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xl, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    srcRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
    srcLabel: { width: 80, color: colors.primary, fontSize: typography.sizes.small },
    track: { flex: 1, height: 10, borderRadius: 6, backgroundColor: colors.bgLight, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 6 },
    srcVal: { width: 96, textAlign: 'right', color: colors.grey, fontSize: typography.sizes.caption },
    card: { marginBottom: spacing.md },
    campHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    campName: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small, flex: 1, marginRight: spacing.sm },
    roasBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    roasText: { fontSize: typography.sizes.caption, fontWeight: '700' },
    campStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    stat: { minWidth: 56 },
    statValue: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    statLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    gaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, rowGap: spacing.md },
});

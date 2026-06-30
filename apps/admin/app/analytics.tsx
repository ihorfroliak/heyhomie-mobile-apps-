import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { demoAnalyticsMissions } from '@heyhomie/api';
import { dashboardSummary, withinLastDays, formatMoney, formatDuration, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Segmented } from '@heyhomie/ui';
import { BarChart, Donut } from '../components/Charts';

const locale: Locale = 'en';
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function Analytics() {
    const [showMore, setShowMore] = useState(false);
    const [period, setPeriod] = useState<'7' | '30' | 'all'>('all');

    const missions = period === 'all' ? demoAnalyticsMissions : withinLastDays(demoAnalyticsMissions, Number(period));
    // Illustrative capacity, scaled to the selected window.
    const capacityDays = period === 'all' ? 30 : Number(period);
    const s = dashboardSummary(missions, { capacityMinutes: 3 * capacityDays * 60 });

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Analytics' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={{ marginBottom: spacing.md }}>
                    <Segmented
                        value={period}
                        onChange={k => setPeriod(k as '7' | '30' | 'all')}
                        options={[
                            { key: '7', label: '7 days' },
                            { key: '30', label: '30 days' },
                            { key: 'all', label: 'All' },
                        ]}
                    />
                </View>

                {/* PRIMARY — headline numbers, prominent */}
                <View style={styles.grid}>
                    <Hero label="Revenue" value={formatMoney(s.primary.revenue, 'PLN', locale)} />
                    <Hero label="Completed" value={String(s.primary.completed)} />
                    <Hero label="Completion" value={pct(s.primary.completionRate)} />
                    <Hero label="Avg value" value={formatMoney(s.primary.avgMissionValue, 'PLN', locale)} />
                </View>

                {/* Charts */}
                <Text style={styles.section}>Revenue by day</Text>
                <Card>
                    <BarChart data={s.charts.revenueByDay} width={300} height={150} color={colors.blue} formatKey={d => d.slice(8)} />
                </Card>

                <Text style={styles.section}>Revenue by weekday</Text>
                <Card>
                    <BarChart data={s.charts.revenueByWeekday} width={300} height={130} color={colors.blue} />
                </Card>

                <View style={styles.twoCol}>
                    <View style={styles.half}>
                        <Text style={styles.section}>Completion</Text>
                        <Card style={{ alignItems: 'center' }}>
                            <View style={styles.donutWrap}>
                                <Donut value={s.primary.completionRate} />
                                <View style={styles.donutCenter}>
                                    <Text style={styles.donutValue}>{pct(s.primary.completionRate)}</Text>
                                </View>
                            </View>
                        </Card>
                    </View>
                    <View style={styles.half}>
                        <Text style={styles.section}>By plan</Text>
                        <Card>
                            <BarChart data={s.charts.countByPlan} width={130} height={110} color={colors.salad} />
                        </Card>
                    </View>
                </View>

                <Text style={styles.section}>Avg rating by city</Text>
                <Card>
                    {s.charts.avgRatingByCity.map(c => (
                        <View key={c.key} style={styles.ratingRow}>
                            <Text style={styles.ratingCity}>{c.key}</Text>
                            <View style={styles.ratingTrack}>
                                <View style={[styles.ratingFill, { width: `${(c.value / 5) * 100}%` }]} />
                            </View>
                            <Text style={styles.ratingVal}>{c.value.toFixed(1)} ★</Text>
                        </View>
                    ))}
                </Card>

                <Text style={styles.section}>Top homies</Text>
                {s.charts.leaderboard.map((w, i) => (
                    <View key={w.homieId} style={styles.lbRow}>
                        <Text style={styles.rank}>{i + 1}.</Text>
                        <Text style={styles.name}>{w.firstName}</Text>
                        <Text style={styles.meta}>{w.missions} missions</Text>
                        <Text style={styles.payout}>{formatMoney(w.payout, 'PLN', locale)}</Text>
                    </View>
                ))}

                {/* SECONDARY — collapsed by default so it doesn't crowd the view */}
                <Pressable style={styles.moreToggle} onPress={() => setShowMore(v => !v)}>
                    <Text style={styles.moreText}>Additional metrics</Text>
                    <Text style={styles.moreChevron}>{showMore ? '⌃' : '⌄'}</Text>
                </Pressable>
                {showMore ? (
                    <View style={styles.moreGrid}>
                        <Mini label="Cancellation rate" value={pct(s.secondary.cancellationRate)} />
                        <Mini label="Repeat clients" value={pct(s.secondary.repeatRate)} />
                        <Mini label="Utilization" value={pct(s.secondary.utilization)} />
                        <Mini label="Avg time to assign" value={formatDuration(s.secondary.avgAssignmentMinutes)} />
                        <Mini label="Live now" value={String(s.secondary.live)} />
                        <Mini label="Searching" value={String(s.secondary.searching)} />
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const Hero = ({ label, value }: { label: string; value: string }) => (
    <Card variant="fill" style={styles.hero}>
        <Text style={styles.heroLabel}>{label}</Text>
        <Text style={styles.heroValue}>{value}</Text>
    </Card>
);

const Mini = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.mini}>
        <Text style={styles.miniValue}>{value}</Text>
        <Text style={styles.miniLabel}>{label}</Text>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    hero: { width: '47%' },
    heroLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    heroValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 4 },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.xl, marginBottom: spacing.sm },
    twoCol: { flexDirection: 'row', gap: spacing.md },
    half: { flex: 1 },
    donutWrap: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
    donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    donutValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
    ratingCity: { width: 64, color: colors.primary, fontSize: typography.sizes.small },
    ratingTrack: { flex: 1, height: 8, borderRadius: 6, backgroundColor: colors.bgLight, overflow: 'hidden' },
    ratingFill: { height: '100%', backgroundColor: colors.warning },
    ratingVal: { width: 48, textAlign: 'right', color: colors.grey, fontSize: typography.sizes.caption },
    lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rank: { color: colors.grey, width: 22, fontSize: typography.sizes.small },
    name: { flex: 1, color: colors.primary, fontWeight: '600', fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginRight: spacing.md },
    payout: { color: colors.success, fontWeight: '700', fontSize: typography.sizes.small },
    moreToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    moreText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '500' },
    moreChevron: { color: colors.grey, fontSize: 16 },
    moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    mini: { width: '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: spacing.md },
    miniValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    miniLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
});

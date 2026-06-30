import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { demoMissions, demoAvailableMissions, demoAnalyticsMissions } from '@heyhomie/api';
import { adminStats, dashboardSummary, formatMoney, formatDuration, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, useLocale } from '@heyhomie/ui';

export default function Dashboard() {
    const locale = useLocale();
    const router = useRouter();
    const [showMore, setShowMore] = useState(false);
    const extra = dashboardSummary([...demoAnalyticsMissions, ...demoAvailableMissions], { capacityMinutes: 3 * 30 * 60 }).secondary;
    const stats = adminStats([...demoMissions, ...demoAvailableMissions]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Dashboard</Text>
                <View style={styles.grid}>
                    <Kpi label="Revenue (done)" value={formatMoney(stats.revenue, 'PLN', locale)} />
                    <Kpi label="Missions" value={String(stats.total)} />
                    <Kpi label="Live now" value={String(stats.live)} />
                    <Kpi label="Avg rating" value="4.8" />
                </View>

                <Text style={styles.section}>Needs attention</Text>
                {stats.searching > 0 ? (
                    <Card style={[styles.alert, { borderColor: colors.danger }]}>
                        <Text style={styles.alertTitle}>{stats.searching} unassigned mission{stats.searching > 1 ? 's' : ''}</Text>
                        <Text style={styles.alertSub}>Searching for a homie — assign now</Text>
                    </Card>
                ) : (
                    <Text style={styles.ok}>All missions assigned.</Text>
                )}

                <Text style={styles.section}>Manage</Text>
                <Pressable onPress={() => router.push('/analytics')}>
                    <Card style={styles.link}>
                        <Text style={styles.linkText}>Analytics &amp; charts</Text>
                        <Text style={styles.linkArrow}>›</Text>
                    </Card>
                </Pressable>
                <Pressable onPress={() => router.push('/pay')}>
                    <Card style={styles.link}>
                        <Text style={styles.linkText}>Worker pay</Text>
                        <Text style={styles.linkArrow}>›</Text>
                    </Card>
                </Pressable>
                <Pressable onPress={() => router.push('/verification')}>
                    <Card style={styles.link}>
                        <Text style={styles.linkText}>Verification queue</Text>
                        <Text style={styles.linkArrow}>›</Text>
                    </Card>
                </Pressable>
                <Pressable onPress={() => router.push('/quality')}>
                    <Card style={styles.link}>
                        <Text style={styles.linkText}>Quality reports</Text>
                        <Text style={styles.linkArrow}>›</Text>
                    </Card>
                </Pressable>

                <Pressable style={styles.moreToggle} onPress={() => setShowMore(v => !v)}>
                    <Text style={styles.moreText}>Additional metrics</Text>
                    <Text style={styles.moreChevron}>{showMore ? '⌃' : '⌄'}</Text>
                </Pressable>
                {showMore ? (
                    <View style={styles.miniGrid}>
                        <Mini label="Cancellation rate" value={`${Math.round(extra.cancellationRate * 100)}%`} />
                        <Mini label="Repeat clients" value={`${Math.round(extra.repeatRate * 100)}%`} />
                        <Mini label="Utilization" value={`${Math.round(extra.utilization * 100)}%`} />
                        <Mini label="Avg time to assign" value={formatDuration(extra.avgAssignmentMinutes)} />
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const Kpi = ({ label, value }: { label: string; value: string }) => (
    <Card variant="fill" style={styles.kpi}>
        <Text style={styles.kLabel}>{label}</Text>
        <Text style={styles.kValue}>{value}</Text>
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
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    kpi: { width: '47%' },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    kValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 4 },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.xl, marginBottom: spacing.sm },
    alert: { borderWidth: 1 },
    alertTitle: { fontWeight: '700', color: colors.primary },
    alertSub: { color: colors.danger, fontSize: typography.sizes.small, marginTop: 2 },
    ok: { color: colors.success, fontSize: typography.sizes.small },
    link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    linkText: { color: colors.primary, fontWeight: '500', fontSize: typography.sizes.small },
    linkArrow: { color: colors.grey, fontSize: 22 },
    moreToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    moreText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '500' },
    moreChevron: { color: colors.grey, fontSize: 16 },
    miniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    mini: { width: '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: spacing.md },
    miniValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    miniLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
});

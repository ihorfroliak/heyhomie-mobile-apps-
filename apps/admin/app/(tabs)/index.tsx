import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoMissions, demoAvailableMissions, demoAnalyticsMissions } from '@heyhomie/api';
import { adminStats, dashboardSummary, formatMoney, formatDuration, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, useLocale } from '@heyhomie/ui';

type IconName = keyof typeof Ionicons.glyphMap;

const MANAGE_LINKS: { href: string; label: string; icon: IconName }[] = [
    { href: '/order-edit/new', label: 'New order (manual)', icon: 'add-circle-outline' },
    { href: '/coverage', label: 'Cities & services', icon: 'map-outline' },
    { href: '/analytics', label: 'Analytics & charts', icon: 'bar-chart-outline' },
    { href: '/pipeline', label: 'Pipeline (funnel · leads)', icon: 'funnel-outline' },
    { href: '/clients', label: 'Clients (CRM)', icon: 'people-outline' },
    { href: '/marketing', label: 'Marketing & ads', icon: 'megaphone-outline' },
    { href: '/finance', label: 'Finance & margins', icon: 'wallet-outline' },
    { href: '/invoices', label: 'Invoices (Stripe · Fakturownia)', icon: 'document-text-outline' },
    { href: '/contracts', label: 'Contracts & HR', icon: 'briefcase-outline' },
    { href: '/pay', label: 'Worker pay', icon: 'cash-outline' },
    { href: '/verification', label: 'Verification queue', icon: 'shield-checkmark-outline' },
    { href: '/quality', label: 'Quality reports', icon: 'ribbon-outline' },
    { href: '/inventory', label: 'Inventory (supplies)', icon: 'cube-outline' },
    { href: '/tickets', label: 'Support tickets', icon: 'chatbubbles-outline' },
];

export default function Dashboard() {
    const locale = useLocale();
    const router = useRouter();
    const [showMore, setShowMore] = useState(false);
    const extra = dashboardSummary([...demoAnalyticsMissions, ...demoAvailableMissions], { capacityMinutes: 3 * 30 * 60 }).secondary;
    const stats = adminStats([...demoMissions, ...demoAvailableMissions]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.hero}>
                <Text style={styles.heroSub}>Good to see you</Text>
                <Text style={styles.heroTitle}>Dashboard</Text>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.grid}>
                    <Kpi icon="cash-outline" label="Revenue (done)" value={formatMoney(stats.revenue, 'PLN', locale)} />
                    <Kpi icon="briefcase-outline" label="Missions" value={String(stats.total)} />
                    <Kpi icon="pulse-outline" label="Live now" value={String(stats.live)} accent={colors.blue} />
                    <Kpi icon="star-outline" label="Avg rating" value="4.8" />
                </View>

                <Text style={styles.section}>Needs attention</Text>
                {stats.searching > 0 ? (
                    <Card style={styles.alert}>
                        <View style={styles.alertRow}>
                            <Ionicons name="alert-circle" size={20} color={colors.danger} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.alertTitle}>{stats.searching} unassigned mission{stats.searching > 1 ? 's' : ''}</Text>
                                <Text style={styles.alertSub}>Searching for a homie — assign now</Text>
                            </View>
                        </View>
                    </Card>
                ) : (
                    <View style={styles.okRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                        <Text style={styles.ok}>All missions assigned.</Text>
                    </View>
                )}

                <Text style={styles.section}>Manage</Text>
                {MANAGE_LINKS.map(l => (
                    <Pressable key={l.href} onPress={() => router.push(l.href)}>
                        <Card style={styles.link}>
                            <View style={styles.linkLeft}>
                                <Ionicons name={l.icon} size={17} color={colors.blue} />
                                <Text style={styles.linkText}>{l.label}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.grey} />
                        </Card>
                    </Pressable>
                ))}

                <Pressable style={styles.moreToggle} onPress={() => setShowMore(v => !v)}>
                    <Text style={styles.moreText}>Additional metrics</Text>
                    <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={colors.grey} />
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

const Kpi = ({ icon, label, value, accent }: { icon: IconName; label: string; value: string; accent?: string }) => (
    <Card variant="fill" style={styles.kpi}>
        <Ionicons name={icon} size={16} color={accent ?? colors.grey} />
        <Text style={styles.kLabel}>{label}</Text>
        <Text style={[styles.kValue, accent ? { color: accent } : null]}>{value}</Text>
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
    hero: { backgroundColor: colors.primary, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
    heroSub: { color: '#9C9BB0', fontSize: typography.sizes.caption },
    heroTitle: { color: colors.white, fontSize: typography.sizes.h2, fontWeight: '700', marginTop: 4 },
    body: { padding: spacing.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: -spacing.xl },
    kpi: { width: '47%' },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 6 },
    kValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 2 },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.xl, marginBottom: spacing.sm },
    alert: { borderWidth: 1, borderColor: colors.danger },
    alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    alertTitle: { fontWeight: '700', color: colors.primary },
    alertSub: { color: colors.danger, fontSize: typography.sizes.small, marginTop: 2 },
    okRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ok: { color: colors.success, fontSize: typography.sizes.small },
    link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    linkLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    linkText: { color: colors.primary, fontWeight: '500', fontSize: typography.sizes.small, flexShrink: 1 },
    moreToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    moreText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '500' },
    miniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    mini: { width: '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: spacing.md },
    miniValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    miniLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
});

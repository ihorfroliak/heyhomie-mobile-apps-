import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoAnalyticsMissions, demoCommLog } from '@heyhomie/api';
import { clientProfile, clientMissions, clientComms, segmentFor, missionStatusLabel, tr, formatMoney, formatDuration, type Segment, type Locale, type CommEvent } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const locale: Locale = 'en';
const REF = '2025-05-16';

const SEG: Record<Segment, { label: string; color: string }> = {
    champion: { label: 'Champion', color: colors.success },
    loyal: { label: 'Loyal', color: colors.blue },
    new: { label: 'New', color: colors.salad },
    at_risk: { label: 'At risk', color: colors.warning },
    lost: { label: 'Lost', color: colors.danger },
};
const CH_ICON: Record<CommEvent['channel'], keyof typeof Ionicons.glyphMap> = { sms: 'chatbubble-outline', email: 'mail-outline', call: 'call-outline' };
const dmy = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function ClientDetail() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const profile = clientProfile(demoAnalyticsMissions, id ?? '');
    const missions = clientMissions(demoAnalyticsMissions, id ?? '');
    const comms = clientComms(demoCommLog, id ?? '');

    if (!profile) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <Stack.Screen options={{ headerShown: true, title: 'Client' }} />
                <Text style={styles.empty}>Client not found.</Text>
            </SafeAreaView>
        );
    }
    const seg = segmentFor(profile, REF);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: profile.firstName }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.header}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {profile.firstName.slice(0, 1)}
                            {profile.lastInitial ?? ''}
                        </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.name}>
                            {profile.firstName} {profile.lastInitial ? `${profile.lastInitial}.` : ''}
                        </Text>
                        <Text style={styles.meta}>{profile.city}</Text>
                    </View>
                    <View style={[styles.segBadge, { backgroundColor: `${SEG[seg].color}1A` }]}>
                        <Text style={[styles.segText, { color: SEG[seg].color }]}>{SEG[seg].label}</Text>
                    </View>
                </View>

                <View style={styles.ltvCard}>
                    <View>
                        <Text style={styles.ltvLabel}>Lifetime value</Text>
                        <Text style={styles.ltvValue}>{formatMoney(profile.totalSpent, 'PLN', locale)}</Text>
                    </View>
                    <Ionicons name="trophy" size={26} color={colors.salad} />
                </View>
                <View style={styles.stats}>
                    <Stat label="Orders" value={String(profile.orders)} />
                    <Stat label="Avg order" value={formatMoney(profile.avgOrder, 'PLN', locale)} />
                    <Stat label="Client since" value={dmy(profile.firstOrderAt)} />
                </View>

                <View style={styles.sectionRow}>
                    <Ionicons name="time-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Order history</Text>
                </View>
                {missions.map(m => (
                    <View key={m.id} style={styles.histRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.histTitle}>
                                {m.plan === 'general' ? 'General' : 'Standard'} · {formatDuration(m.durationMinutes)}
                            </Text>
                            <Text style={styles.meta}>
                                {dmy(m.scheduledAt)} · {tr(missionStatusLabel[m.status], locale)}
                            </Text>
                        </View>
                        <Text style={styles.price}>{formatMoney(m.price, m.currency, locale)}</Text>
                    </View>
                ))}

                <View style={styles.sectionRow}>
                    <Ionicons name="chatbubbles-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Communication</Text>
                </View>
                {comms.length === 0 ? <Text style={styles.meta}>No messages yet.</Text> : null}
                {comms.map(c => (
                    <View key={c.id} style={styles.commRow}>
                        <Ionicons name={CH_ICON[c.channel]} size={18} color={c.direction === 'in' ? colors.blue : colors.grey} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.commText}>{c.summary}</Text>
                            <Text style={styles.meta}>
                                {c.direction === 'in' ? 'Inbound' : 'Outbound'} · {new Date(c.at).toLocaleString()}
                            </Text>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
    <Card variant="fill" style={styles.stat}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
    </Card>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    empty: { padding: spacing.lg, color: colors.grey },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 16 },
    name: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.h3 },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
    segBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    segText: { fontSize: typography.sizes.caption, fontWeight: '700' },
    ltvCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 16, padding: spacing.lg, marginBottom: spacing.md },
    ltvLabel: { color: '#9C9BB0', fontSize: typography.sizes.caption },
    ltvValue: { color: colors.salad, fontSize: typography.sizes.h2, fontWeight: '700', marginTop: 4 },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    stat: { width: '47%' },
    statLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    statValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, marginTop: 2 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xl, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    histTitle: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    price: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    commRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    commText: { color: colors.primary, fontSize: typography.sizes.small },
});

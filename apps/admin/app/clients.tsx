import React from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoAnalyticsMissions } from '@heyhomie/api';
import { clientProfiles, segmentFor, segmentCounts, formatMoney, type Segment, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const locale: Locale = 'en';
const REF = '2025-05-16'; // use today when live

const SEGMENT_META: Record<Segment, { label: string; color: string }> = {
    champion: { label: 'Champion', color: colors.success },
    loyal: { label: 'Loyal', color: colors.blue },
    new: { label: 'New', color: colors.salad },
    at_risk: { label: 'At risk', color: colors.warning },
    lost: { label: 'Lost', color: colors.danger },
};

export default function Clients() {
    const router = useRouter();
    const profiles = clientProfiles(demoAnalyticsMissions);
    const counts = segmentCounts(profiles, REF);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Clients' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.chips}>
                    {(Object.keys(counts) as Segment[])
                        .filter(s => counts[s] > 0)
                        .map(s => (
                            <View key={s} style={[styles.chip, { backgroundColor: `${SEGMENT_META[s].color}1A` }]}>
                                <Text style={[styles.chipText, { color: SEGMENT_META[s].color }]}>
                                    {SEGMENT_META[s].label} · {counts[s]}
                                </Text>
                            </View>
                        ))}
                </View>

                {profiles.map(p => {
                    const seg = segmentFor(p, REF);
                    return (
                        <Pressable key={p.id} onPress={() => router.push(`/client/${p.id}`)}>
                            <Card style={styles.row}>
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>
                                        {p.firstName.slice(0, 1)}
                                        {p.lastInitial ?? ''}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.name}>
                                        {p.firstName} {p.lastInitial ? `${p.lastInitial}.` : ''}
                                    </Text>
                                    <View style={styles.metaRow}>
                                        <Ionicons name="location-outline" size={11} color={colors.grey} />
                                        <Text style={styles.meta}>{p.city} · {p.orders} orders</Text>
                                    </View>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.ltv}>{formatMoney(p.totalSpent, 'PLN', locale)}</Text>
                                    <View style={[styles.seg, { backgroundColor: `${SEGMENT_META[seg].color}1A` }]}>
                                        <Text style={[styles.segText, { color: SEGMENT_META[seg].color }]}>{SEGMENT_META[seg].label}</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={colors.grey} style={{ marginLeft: spacing.sm }} />
                            </Card>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
    chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    chipText: { fontSize: typography.sizes.caption, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 13 },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    ltv: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    seg: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
    segText: { fontSize: 10, fontWeight: '600' },
});

import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { demoMissions, demoAvailableMissions } from '@heyhomie/api';
import { missionStatusLabel, tr, formatDuration, type Locale, type Mission, type MissionStatus } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, StatusBadge, EmptyState, useLocale } from '@heyhomie/ui';

const all: Mission[] = [...demoAvailableMissions, ...demoMissions];

type Filter = 'all' | 'searching_homie' | 'live' | 'done';
const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'searching_homie', label: 'Searching' },
    { key: 'live', label: 'Live' },
    { key: 'done', label: 'Done' },
];

const matches = (m: Mission, f: Filter) =>
    f === 'all' ||
    (f === 'live' ? m.status === 'homie_found' || m.status === 'in_progress' : m.status === (f as MissionStatus));

export default function Missions() {
    const locale = useLocale();
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const list = all.filter(m => matches(m, filter));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Missions</Text>
                <View style={styles.filters}>
                    {FILTERS.map(f => (
                        <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipOn]}>
                            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
                        </Pressable>
                    ))}
                </View>
                {list.length === 0 ? <EmptyState title="No missions" subtitle="Try a different filter." /> : null}
                {list.map(m => (
                    <Pressable key={m.id} onPress={() => router.push(`/mission/${m.id}`)}>
                        <Card style={{ marginBottom: spacing.md }}>
                            <View style={styles.row}>
                                <StatusBadge status={m.status} locale={locale} />
                                <Text style={styles.id}>#{m.id}</Text>
                            </View>
                            <Text style={styles.title}>
                                {m.plan === 'general' ? 'General' : 'Standard'} · {formatDuration(m.durationMinutes)} · {m.address.city}
                            </Text>
                            <Text style={styles.meta}>
                                {m.client.firstName}
                                {m.homie ? ` · ${m.homie.firstName}` : ` · ${tr(missionStatusLabel.searching_homie, locale)}`}
                            </Text>
                        </Card>
                    </Pressable>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.md },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
    chip: { backgroundColor: colors.bgLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    chipOn: { backgroundColor: colors.primary },
    chipText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '500' },
    chipTextOn: { color: colors.white },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    id: { color: colors.grey, fontSize: typography.sizes.caption },
    title: { fontWeight: '600', color: colors.primary, marginTop: 6 },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 2 },
});

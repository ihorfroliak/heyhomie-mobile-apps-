import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoMissions } from '@heyhomie/api';
import { splitMissions, formatDuration, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, MissionCard, useLocale } from '@heyhomie/ui';

export default function Today() {
    const locale = useLocale();
    const router = useRouter();
    const { upcoming, past } = splitMissions(demoMissions);
    const next = upcoming.find(m => m.status === 'homie_found' || m.status === 'in_progress') ?? upcoming[0];
    const doneToday = past.filter(m => m.status === 'done').length;
    const workedMinutes = past.filter(m => m.status === 'done').reduce((s, m) => s + m.durationMinutes, 0);
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' });

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.hero}>
                <Text style={styles.heroSub}>{today}</Text>
                <Text style={styles.heroTitle}>Today · {upcoming.length} mission{upcoming.length === 1 ? '' : 's'}</Text>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.kpis}>
                    <Card variant="fill" style={styles.kpi}>
                        <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.success} />
                        <Text style={styles.kValue}>{doneToday}</Text>
                        <Text style={styles.kLabel}>missions done</Text>
                    </Card>
                    <Card variant="fill" style={styles.kpi}>
                        <Ionicons name="time-outline" size={18} color={colors.blue} />
                        <Text style={styles.kValue}>{formatDuration(workedMinutes)}</Text>
                        <Text style={styles.kLabel}>time worked</Text>
                    </Card>
                </View>

                {next ? (
                    <>
                        <Text style={styles.section}>Next mission</Text>
                        <MissionCard mission={next} locale={locale} showHomie={false} showPrice={false} onPress={() => router.push(`/mission/${next.id}`)} />
                    </>
                ) : (
                    <View style={styles.emptyCard}>
                        <Ionicons name="checkmark-circle-outline" size={28} color={colors.grey} />
                        <Text style={styles.empty}>No missions yet. Check the Missions tab to accept one.</Text>
                    </View>
                )}

                <View style={styles.noteRow}>
                    <Ionicons name="eye-off-outline" size={13} color={colors.grey} />
                    <Text style={styles.note}>You see your schedule and hours — never client prices or payouts.</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    hero: { backgroundColor: colors.primary, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
    heroSub: { color: '#9C9BB0', fontSize: typography.sizes.caption },
    heroTitle: { color: colors.white, fontSize: typography.sizes.h2, fontWeight: '700', marginTop: 4 },
    body: { padding: spacing.lg },
    kpis: { flexDirection: 'row', gap: spacing.md, marginTop: -spacing.xl, marginBottom: spacing.lg },
    kpi: { flex: 1 },
    kValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 6 },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginBottom: spacing.sm },
    emptyCard: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
    empty: { color: colors.grey, fontSize: typography.sizes.small, textAlign: 'center' },
    noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: spacing.lg, justifyContent: 'center' },
    note: { color: colors.grey, fontSize: 11, textAlign: 'center' },
});

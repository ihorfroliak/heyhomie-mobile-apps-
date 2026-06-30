import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { demoMissions } from '@heyhomie/api';
import { formatMoney, splitMissions, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, MissionCard, useLocale } from '@heyhomie/ui';

export default function Today() {
    const locale = useLocale();
    const router = useRouter();
    const { upcoming, past } = splitMissions(demoMissions);
    const next = upcoming.find(m => m.status === 'homie_found' || m.status === 'in_progress') ?? upcoming[0];
    const earnedToday = past.filter(m => m.status === 'done').reduce((s, m) => s + m.price, 0);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Today</Text>
                <Card variant="fill" style={{ marginBottom: spacing.lg }}>
                    <Text style={styles.kLabel}>Earned today</Text>
                    <Text style={styles.kValue}>{formatMoney(earnedToday, 'PLN', locale)}</Text>
                </Card>
                {next ? (
                    <>
                        <Text style={styles.section}>Next mission</Text>
                        <MissionCard mission={next} locale={locale} showHomie={false} onPress={() => router.push(`/mission/${next.id}`)} />
                    </>
                ) : (
                    <Text style={styles.empty}>No missions yet. Check the Missions tab to accept one.</Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    kLabel: { color: colors.grey, fontSize: typography.sizes.small },
    kValue: { fontSize: typography.sizes.h1, fontWeight: '700', color: colors.primary },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginBottom: spacing.sm },
    empty: { color: colors.grey, fontSize: typography.sizes.small },
});

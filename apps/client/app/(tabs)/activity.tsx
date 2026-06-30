import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { demoMissions, demoServices } from '@heyhomie/api';
import { splitMissions, frequencyLabel, tr, formatDuration, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Segmented, MissionCard, useLocale } from '@heyhomie/ui';

export default function Activity() {
    const locale = useLocale();
    const router = useRouter();
    const [tab, setTab] = useState<'orders' | 'services'>('orders');
    const { upcoming, past } = splitMissions(demoMissions);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Activity</Text>
                <Segmented
                    value={tab}
                    onChange={k => setTab(k as 'orders' | 'services')}
                    options={[
                        { key: 'orders', label: 'Orders' },
                        { key: 'services', label: 'Services' },
                    ]}
                />

                {tab === 'orders' ? (
                    <>
                        <Text style={styles.section}>Upcoming</Text>
                        {upcoming.map(m => (
                            <MissionCard key={m.id} mission={m} locale={locale} onPress={() => router.push(`/mission/${m.id}`)} />
                        ))}
                        <Text style={styles.section}>Past</Text>
                        {past.map(m => (
                            <MissionCard key={m.id} mission={m} locale={locale} onPress={() => router.push(`/mission/${m.id}`)} />
                        ))}
                    </>
                ) : (
                    <>
                        <Text style={styles.section}>Recurring services</Text>
                        {demoServices.map(s => (
                            <Card key={s.id} variant="fill" style={{ marginBottom: spacing.md }}>
                                <Text style={styles.title}>Weekly cleaning</Text>
                                <Text style={styles.meta}>
                                    {tr(frequencyLabel[s.frequency], locale)} · {formatDuration(180)} · {s.assignedHomie?.firstName}
                                </Text>
                                {s.upcomingMissions.map(m => (
                                    <Text key={m.id} style={styles.miniRow}>
                                        {new Date(m.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })} · {new Date(m.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                ))}
                            </Card>
                        ))}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 2, marginBottom: spacing.sm },
    miniRow: { color: colors.primary, fontSize: typography.sizes.small, paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border },
});

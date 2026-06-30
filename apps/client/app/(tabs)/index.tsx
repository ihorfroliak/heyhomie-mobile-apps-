import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { demoMissions, demoServices } from '@heyhomie/api';
import { splitMissions, frequencyLabel, tr, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button, MissionCard, useLocale } from '@heyhomie/ui';

export default function Home() {
    const locale = useLocale();
    const router = useRouter();
    const { upcoming } = splitMissions(demoMissions);
    const next = upcoming[0];
    const service = demoServices[0];

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.sub}>Good morning</Text>
                <Text style={styles.hello}>Hi, {next?.client.firstName ?? 'there'}</Text>

                {next ? (
                    <>
                        <Text style={styles.section}>Your next cleaning</Text>
                        <MissionCard mission={next} locale={locale} onPress={() => router.push(`/mission/${next.id}`)} />
                    </>
                ) : null}

                <Button label="Book a cleaning" variant="teal" onPress={() => router.push('/book')} />

                {service ? (
                    <>
                        <Text style={styles.section}>Active service</Text>
                        <Card variant="fill">
                            <Text style={styles.title}>Weekly cleaning</Text>
                            <Text style={styles.meta}>
                                {tr(frequencyLabel[service.frequency], locale)} · {service.assignedHomie?.firstName}
                            </Text>
                        </Card>
                    </>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    sub: { color: colors.grey, fontSize: typography.sizes.small },
    hello: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.xl },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 2 },
});

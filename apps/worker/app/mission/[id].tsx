import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { demoMissions, demoAvailableMissions, transitionMission } from '@heyhomie/api';
import { workerAction, formatDuration, formatMoney, type Locale, type Mission } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, StatusBadge, Button, useLocale } from '@heyhomie/ui';

const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—');

const ACTION_LABEL: Record<string, string> = {
    accept: 'Accept mission',
    begin: 'Check in & start',
    complete: 'Check out & complete',
};

export default function WorkerMissionDetail() {
    const locale = useLocale();
    const { id } = useLocalSearchParams<{ id: string }>();
    const all: Mission[] = [...demoMissions, ...demoAvailableMissions];
    const initial = all.find(m => m.id === id) ?? demoMissions[0];
    const [mission, setMission] = useState<Mission>(initial);

    const action = workerAction(mission.status);

    const run = () => {
        if (action === 'accept') setMission(transitionMission(mission, 'assign', { homie: { id: 'h1', firstName: 'Olena' } }));
        else if (action === 'begin') setMission(transitionMission(mission, 'begin'));
        else if (action === 'complete') setMission(transitionMission(mission, 'complete'));
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Mission' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.row}>
                    <Text style={styles.title}>
                        {mission.plan === 'general' ? 'General' : 'Standard'} cleaning · {formatDuration(mission.durationMinutes)}
                    </Text>
                    <StatusBadge status={mission.status} locale={locale} />
                </View>

                <Card variant="fill" style={{ marginVertical: spacing.md }}>
                    <Kv label="Client" value={`${mission.client.firstName}${mission.client.lastInitial ? ` ${mission.client.lastInitial}.` : ''}`} />
                    <Kv label="Address" value={mission.address.line1} />
                    {mission.address.notes ? <Kv label="Access" value={mission.address.notes} /> : null}
                    <Kv label="Time" value={`${hhmm(mission.scheduledAt)} (${formatDuration(mission.durationMinutes)})`} />
                    <Kv label="Travel" value={`~${mission.travelBufferMinutes} min`} />
                    <Kv label="Payout" value={formatMoney(mission.price, mission.currency, locale)} />
                    {mission.workerCount === 2 ? <Kv label="Team" value="2-person team" /> : null}
                </Card>

                <Card style={{ marginBottom: spacing.lg }}>
                    <Kv label="Check-in" value={hhmm(mission.checkInAt)} />
                    <Kv label="Check-out" value={hhmm(mission.checkOutAt)} />
                </Card>

                {action ? (
                    <Button label={ACTION_LABEL[action]} variant="teal" onPress={run} />
                ) : (
                    <Text style={styles.doneNote}>Mission {mission.status}. Nothing more to do.</Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const Kv = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.kv}>
        <Text style={styles.k}>{label}</Text>
        <Text style={styles.v}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, flex: 1, marginRight: spacing.sm },
    kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    k: { color: colors.grey, fontSize: typography.sizes.small },
    v: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },
    doneNote: { color: colors.grey, fontSize: typography.sizes.small, textAlign: 'center' },
});

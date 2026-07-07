import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoMissions, demoAvailableMissions, transitionMission } from '@heyhomie/api';
import { workerAction, formatDuration, missionTimes, type Mission, type MissionStatus } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, StatusBadge, Button, useLocale } from '@heyhomie/ui';

const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—');

const ACTION_LABEL: Record<string, string> = {
    accept: 'Accept mission',
    begin: 'Check in & start',
    complete: 'Check out & complete',
};

const STEPS: { key: MissionStatus; label: string }[] = [
    { key: 'homie_found', label: 'Assigned' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'done', label: 'Done' },
];
const STEP_ORDER: MissionStatus[] = ['searching_homie', 'homie_found', 'in_progress', 'done'];

const DetailRow = ({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) => (
    <View style={styles.detailRow}>
        <View style={styles.detailLeft}>
            <Ionicons name={icon} size={15} color={colors.grey} />
            <Text style={styles.detailLabel}>{label}</Text>
        </View>
        <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
);

export default function WorkerMissionDetail() {
    const locale = useLocale();
    const { id } = useLocalSearchParams<{ id: string }>();
    const all: Mission[] = [...demoMissions, ...demoAvailableMissions];
    const initial = all.find(m => m.id === id) ?? demoMissions[0];
    const [mission, setMission] = useState<Mission>(initial);

    const action = workerAction(mission.status);
    const currentIndex = STEP_ORDER.indexOf(mission.status);

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

                {currentIndex >= STEP_ORDER.indexOf('homie_found') ? (
                    <View style={styles.timeline}>
                        {STEPS.map((s, i) => {
                            const stepIndex = STEP_ORDER.indexOf(s.key);
                            const reached = currentIndex >= stepIndex;
                            const isLast = i === STEPS.length - 1;
                            return (
                                <View key={s.key}>
                                    <View style={styles.stepRow}>
                                        <View style={[styles.dot, reached && styles.dotOn]}>
                                            {reached ? <Ionicons name="checkmark" size={10} color={colors.white} /> : null}
                                        </View>
                                        <Text style={[styles.stepLabel, reached && styles.stepLabelOn]}>{s.label}</Text>
                                    </View>
                                    {!isLast ? <View style={styles.stepLine} /> : null}
                                </View>
                            );
                        })}
                    </View>
                ) : null}

                <Card variant="fill" style={{ marginTop: spacing.md }}>
                    <DetailRow icon="person-outline" label="Client" value={`${mission.client.firstName}${mission.client.lastInitial ? ` ${mission.client.lastInitial}.` : ''}`} />
                    <DetailRow icon="location-outline" label="Address" value={mission.address.line1} />
                    {mission.address.notes ? <DetailRow icon="key-outline" label="Access" value={mission.address.notes} /> : null}
                    <DetailRow icon="time-outline" label="Planned" value={`${hhmm(mission.scheduledAt)}–${hhmm(missionTimes(mission).scheduledEnd)} (${formatDuration(mission.durationMinutes)})`} />
                    <DetailRow icon="navigate-outline" label="Travel" value={`~${mission.travelBufferMinutes} min`} />
                    {mission.workerCount === 2 ? <DetailRow icon="people-outline" label="Team" value="2-person team" /> : null}
                </Card>

                <Card style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>
                    <DetailRow icon="log-in-outline" label="Check-in" value={hhmm(mission.checkInAt)} />
                    <DetailRow icon="log-out-outline" label="Check-out" value={hhmm(mission.checkOutAt)} />
                </Card>

                {action ? (
                    <Button label={ACTION_LABEL[action]} variant="teal" onPress={run} />
                ) : (
                    <View style={styles.doneRow}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                        <Text style={styles.doneNote}>Mission {mission.status}. Nothing more to do.</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, flex: 1, marginRight: spacing.sm },
    timeline: { marginTop: spacing.lg, paddingLeft: 2 },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    dotOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    stepLabel: { fontSize: typography.sizes.small, color: colors.grey },
    stepLabelOn: { color: colors.primary, fontWeight: '600' },
    stepLine: { width: 1, height: 14, backgroundColor: colors.border, marginLeft: 8, marginVertical: 2 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
    detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    detailLabel: { color: colors.grey, fontSize: typography.sizes.small },
    detailValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },
    doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    doneNote: { color: colors.grey, fontSize: typography.sizes.small, textAlign: 'center' },
});

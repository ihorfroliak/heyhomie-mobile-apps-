import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoMissions } from '@heyhomie/api';
import {
    missionTimeline,
    missionStatusLabel,
    isMissionEditable,
    tr,
    formatDuration,
    formatMoney,
    type Locale,
    type MissionStatus,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, StatusBadge, Button, useLocale } from '@heyhomie/ui';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function MissionDetail() {
    const locale = useLocale();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const mission = demoMissions.find(m => m.id === id) ?? demoMissions[0];
    const steps = missionTimeline(mission.status);
    const editable = isMissionEditable(mission.status) || mission.status === 'homie_found';

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Mission' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>
                        {mission.plan === 'general' ? 'General' : 'Standard'} cleaning · {formatDuration(mission.durationMinutes)}
                    </Text>
                    <StatusBadge status={mission.status} locale={locale} />
                </View>

                <Card variant="fill" style={{ marginBottom: spacing.lg }}>
                    {steps.map((s, i) => (
                        <View key={s.key} style={styles.step}>
                            <View
                                style={[
                                    styles.dot,
                                    s.state === 'done' && { backgroundColor: colors.salad, borderColor: colors.salad },
                                    s.state === 'current' && { backgroundColor: colors.blue, borderColor: colors.blue },
                                ]}
                            >
                                {s.state === 'done' ? <Ionicons name="checkmark" size={9} color={colors.primary} /> : null}
                            </View>
                            <Text style={[styles.stepLabel, s.state === 'upcoming' && { color: colors.grey }]}>
                                {tr(missionStatusLabel[s.key as MissionStatus], locale)}
                                {s.key === 'homie_found' && mission.homie ? ` · ${mission.homie.firstName}` : ''}
                                {s.key === 'in_progress' && mission.homieEtaAt ? ` · ETA ${hhmm(mission.homieEtaAt)}` : ''}
                            </Text>
                        </View>
                    ))}
                </Card>

                <Card>
                    <Row icon="time-outline" label="Time" value={`${hhmm(mission.scheduledAt)} (${formatDuration(mission.durationMinutes)})`} />
                    <Row icon="navigate-outline" label="Travel buffer" value={`~${mission.travelBufferMinutes} min`} />
                    <Row icon="location-outline" label="Address" value={mission.address.line1} />
                    <Row icon="people-outline" label="Homies" value={String(mission.workerCount)} />
                    <Row icon="wallet-outline" label="Total" value={`${formatMoney(mission.price, mission.currency, locale)} · pay after`} />
                </Card>

                {editable ? (
                    <View style={styles.actions}>
                        <Button label="Reschedule" variant="ghost" style={styles.action} onPress={() => router.push(`/mission/${mission.id}`)} />
                        <Button label="Reassign" variant="ghost" style={styles.action} onPress={() => {}} />
                    </View>
                ) : mission.status === 'done' ? (
                    <Button label="Rate your cleaning" variant="teal" onPress={() => router.push(`/rate/${mission.id}`)} />
                ) : (
                    <View style={styles.lockedRow}>
                        <Ionicons name="lock-closed-outline" size={13} color={colors.grey} />
                        <Text style={styles.locked}>This mission can no longer be edited.</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
    return (
        <View style={styles.kv}>
            <View style={styles.kLeft}>
                <Ionicons name={icon} size={15} color={colors.grey} />
                <Text style={styles.k}>{label}</Text>
            </View>
            <Text style={styles.v}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, flex: 1, marginRight: spacing.sm },
    step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border, marginRight: spacing.md, alignItems: 'center', justifyContent: 'center' },
    stepLabel: { fontSize: typography.sizes.small, fontWeight: '500', color: colors.primary },
    kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
    kLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    k: { color: colors.grey, fontSize: typography.sizes.small },
    v: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    action: { flex: 1 },
    lockedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: spacing.lg },
    locked: { color: colors.grey, fontSize: typography.sizes.small, textAlign: 'center' },
});

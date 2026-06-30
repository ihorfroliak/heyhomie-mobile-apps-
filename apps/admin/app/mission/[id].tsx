import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { demoMissions, demoAvailableMissions, suggestHomies, transitionMission } from '@heyhomie/api';
import { isMissionEditable, formatDuration, formatMoney, type Locale, type Mission } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, StatusBadge, Button, useLocale } from '@heyhomie/ui';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function AdminMissionDetail() {
    const locale = useLocale();
    const { id } = useLocalSearchParams<{ id: string }>();
    const all: Mission[] = [...demoAvailableMissions, ...demoMissions];
    const [mission, setMission] = useState<Mission>(all.find(m => m.id === id) ?? demoMissions[0]);

    const editable = isMissionEditable(mission.status);
    const candidates = editable ? suggestHomies(mission.address.city, 'cleaning', mission.scheduledAt.slice(0, 10)) : [];

    const assign = (homie: { id: string; firstName: string }) => setMission(transitionMission(mission, 'assign', { homie }));
    const cancel = () => setMission(transitionMission(mission, 'cancel'));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: `Mission #${mission.id}` }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.row}>
                    <Text style={styles.title}>
                        {mission.plan === 'general' ? 'General' : 'Standard'} · {formatDuration(mission.durationMinutes)}
                    </Text>
                    <StatusBadge status={mission.status} locale={locale} />
                </View>

                <Card variant="fill" style={{ marginVertical: spacing.md }}>
                    <Kv label="Client" value={mission.client.firstName} />
                    <Kv label="When" value={`${mission.scheduledAt.slice(0, 10)} ${hhmm(mission.scheduledAt)}`} />
                    <Kv label="Address" value={mission.address.city} />
                    <Kv label="Price" value={formatMoney(mission.price, mission.currency, locale)} />
                    <Kv label="Homie" value={mission.homie?.firstName ?? '—'} />
                </Card>

                {editable ? (
                    <>
                        <Text style={styles.section}>Available &amp; nearby</Text>
                        {candidates.map(h => (
                            <View key={h.id} style={styles.candidate}>
                                <Text style={styles.cName}>
                                    {h.firstName} · {h.rating?.toFixed(1)} ★
                                </Text>
                                <Button label="Assign" variant="teal" style={styles.assignBtn} onPress={() => assign({ id: h.id, firstName: h.firstName })} />
                            </View>
                        ))}
                        <Button label="Cancel mission" variant="ghost" style={{ marginTop: spacing.lg }} onPress={cancel} />
                    </>
                ) : (
                    <Text style={styles.locked}>Attributes are locked after a homie is found (Rails↔Go sync). Status: {mission.status}.</Text>
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
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    k: { color: colors.grey, fontSize: typography.sizes.small },
    v: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500' },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginBottom: spacing.sm },
    candidate: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
    cName: { color: colors.primary, fontWeight: '500', fontSize: typography.sizes.small },
    assignBtn: { height: 36, paddingHorizontal: 18 },
    locked: { color: colors.grey, fontSize: typography.sizes.small, textAlign: 'center', marginTop: spacing.lg },
});

import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
                    <Kv icon="person-outline" label="Client" value={mission.client.firstName} />
                    <Kv icon="time-outline" label="When" value={`${mission.scheduledAt.slice(0, 10)} ${hhmm(mission.scheduledAt)}`} />
                    <Kv icon="location-outline" label="Address" value={mission.address.city} />
                    <Kv icon="wallet-outline" label="Price" value={formatMoney(mission.price, mission.currency, locale)} />
                    <Kv icon="briefcase-outline" label="Homie" value={mission.homie?.firstName ?? '—'} />
                </Card>

                {editable ? (
                    <>
                        <View style={styles.sectionRow}>
                            <Ionicons name="people-outline" size={14} color={colors.grey} />
                            <Text style={styles.sectionText}>Available &amp; nearby</Text>
                        </View>
                        {candidates.map(h => (
                            <View key={h.id} style={styles.candidate}>
                                <View style={styles.cLeft}>
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{h.firstName.slice(0, 2).toUpperCase()}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.cName}>{h.firstName}</Text>
                                        <View style={styles.cRatingRow}>
                                            <Ionicons name="star" size={11} color={colors.warning} />
                                            <Text style={styles.cRating}>{h.rating?.toFixed(1)}</Text>
                                        </View>
                                    </View>
                                </View>
                                <Button label="Assign" variant="teal" style={styles.assignBtn} onPress={() => assign({ id: h.id, firstName: h.firstName })} />
                            </View>
                        ))}
                        <Button label="Cancel mission" variant="ghost" style={{ marginTop: spacing.lg }} onPress={cancel} />
                    </>
                ) : (
                    <View style={styles.lockedRow}>
                        <Ionicons name="lock-closed-outline" size={13} color={colors.grey} />
                        <Text style={styles.locked}>Attributes are locked after a homie is found (Rails↔Go sync). Status: {mission.status}.</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const Kv = ({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) => (
    <View style={styles.kv}>
        <View style={styles.kLeft}>
            <Ionicons name={icon} size={15} color={colors.grey} />
            <Text style={styles.k}>{label}</Text>
        </View>
        <Text style={styles.v}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    kLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    k: { color: colors.grey, fontSize: typography.sizes.small },
    v: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600' },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    candidate: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
    cLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontSize: 11, fontWeight: '700' },
    cName: { color: colors.primary, fontWeight: '500', fontSize: typography.sizes.small },
    cRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
    cRating: { color: colors.grey, fontSize: typography.sizes.caption },
    assignBtn: { height: 36, paddingHorizontal: 18 },
    lockedRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 5, marginTop: spacing.lg },
    locked: { color: colors.grey, fontSize: typography.sizes.small, textAlign: 'center', flexShrink: 1 },
});

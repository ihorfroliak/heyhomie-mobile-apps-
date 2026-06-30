import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
    addOnsFor,
    estimateMissionMinutes,
    workersFor,
    formatDuration,
    tr,
    TRAVEL_BUFFER_MINUTES,
    type CleaningPlan,
    type AddOnId,
    type SelectedAddOn,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Segmented, Button, useLocale } from '@heyhomie/ui';

function Stepper({ label, hint, value, min = 0, onChange }: { label: string; hint?: string; value: number; min?: number; onChange: (v: number) => void }) {
    return (
        <View style={styles.stepper}>
            <View>
                <Text style={styles.stepLabel}>{label}</Text>
                {hint ? <Text style={styles.stepHint}>{hint}</Text> : null}
            </View>
            <View style={styles.stepCtrl}>
                <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - 1))}>
                    <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{value}</Text>
                <Pressable style={styles.stepBtn} onPress={() => onChange(value + 1)}>
                    <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
            </View>
        </View>
    );
}

const PRESETS = [
    { key: 'studio', label: 'Studio', rooms: 1, kitchens: 1, bathrooms: 1 },
    { key: '1bed', label: '1-bed', rooms: 2, kitchens: 1, bathrooms: 1, popular: true },
    { key: '2bed', label: '2-bed', rooms: 3, kitchens: 1, bathrooms: 1 },
    { key: '3bed', label: '3-bed', rooms: 4, kitchens: 1, bathrooms: 2 },
];

export default function Book() {
    const locale = useLocale();
    const [plan, setPlan] = useState<CleaningPlan>('standard');
    // Smart default: the most common home (1-bed) is preselected so a typical
    // client can go straight to Continue.
    const [rooms, setRooms] = useState(2);
    const [kitchens, setKitchens] = useState(1);
    const [bathrooms, setBathrooms] = useState(1);
    const [selected, setSelected] = useState<Record<string, number>>({});
    const [pets, setPets] = useState(false);

    const available = addOnsFor(plan);
    const availableIds = useMemo(() => new Set(available.map(a => a.id)), [available]);

    const selectedArr: SelectedAddOn[] = Object.entries(selected)
        .filter(([id]) => availableIds.has(id as AddOnId))
        .map(([id, quantity]) => ({ id: id as AddOnId, quantity }));

    const minutes = estimateMissionMinutes({ rooms, kitchens, bathrooms }, selectedArr);
    const workers = workersFor(plan, {});

    const toggle = (id: AddOnId) =>
        setSelected(prev => {
            const next = { ...prev };
            if (next[id]) delete next[id];
            else next[id] = 1;
            return next;
        });
    const setQty = (id: AddOnId, q: number) => setSelected(prev => ({ ...prev, [id]: Math.max(1, q) }));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Book cleaning' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Segmented
                    value={plan}
                    onChange={k => setPlan(k as CleaningPlan)}
                    options={[
                        { key: 'standard', label: 'Standard' },
                        { key: 'general', label: 'General' },
                    ]}
                />

                <Text style={styles.section}>Quick start</Text>
                <View style={styles.presets}>
                    {PRESETS.map(p => {
                        const active = rooms === p.rooms && kitchens === p.kitchens && bathrooms === p.bathrooms;
                        return (
                            <Pressable
                                key={p.key}
                                onPress={() => {
                                    setRooms(p.rooms);
                                    setKitchens(p.kitchens);
                                    setBathrooms(p.bathrooms);
                                }}
                                style={[styles.preset, active && styles.presetOn]}
                            >
                                <Text style={[styles.presetText, active && styles.presetTextOn]}>{p.label}</Text>
                                {p.popular ? <Text style={styles.popular}>popular</Text> : null}
                            </Pressable>
                        );
                    })}
                </View>

                <Text style={styles.section}>Your home</Text>
                <Card variant="fill">
                    <Stepper label="Rooms" hint="30 min each" value={rooms} onChange={setRooms} />
                    <Stepper label="Kitchens" hint="60 min each" value={kitchens} min={1} onChange={setKitchens} />
                    <Stepper label="Bathrooms" hint="60 min each" value={bathrooms} min={1} onChange={setBathrooms} />
                </Card>

                <Text style={styles.section}>Add-ons</Text>
                {available.map(a => {
                    const on = !!selected[a.id];
                    const quantifiable = a.pricing !== 'flat';
                    return (
                        <Pressable key={a.id} onPress={() => toggle(a.id)}>
                            <Card style={[styles.addon, on && styles.addonOn]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.addonName}>{tr(a.label, locale)}</Text>
                                    <Text style={styles.addonMeta}>
                                        +{a.addedMinutesPerUnit} min{quantifiable ? ` · per ${tr(a.unitLabel ?? a.label, locale)}` : ''}
                                    </Text>
                                </View>
                                {on && quantifiable ? (
                                    <View style={styles.stepCtrl}>
                                        <Pressable style={styles.stepBtn} onPress={() => setQty(a.id, (selected[a.id] ?? 1) - 1)}>
                                            <Text style={styles.stepBtnText}>−</Text>
                                        </Pressable>
                                        <Text style={styles.stepValue}>{selected[a.id]}</Text>
                                        <Pressable style={styles.stepBtn} onPress={() => setQty(a.id, (selected[a.id] ?? 1) + 1)}>
                                            <Text style={styles.stepBtnText}>+</Text>
                                        </Pressable>
                                    </View>
                                ) : (
                                    <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                                )}
                            </Card>
                        </Pressable>
                    );
                })}

                <Pressable onPress={() => setPets(p => !p)}>
                    <Card style={[styles.addon, { marginTop: spacing.sm }]}>
                        <Text style={[styles.addonName, { flex: 1 }]}>Pets at home (info only)</Text>
                        <View style={[styles.check, pets && styles.checkOn]}>{pets ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                    </Card>
                </Pressable>

                <Card variant="fill" style={{ marginTop: spacing.lg }}>
                    <View style={styles.sumRow}>
                        <Text style={styles.sumLabel}>Estimated time</Text>
                        <Text style={styles.sumValue}>{formatDuration(minutes)}</Text>
                    </View>
                    <View style={styles.sumRow}>
                        <Text style={styles.sumLabel}>Homies</Text>
                        <Text style={styles.sumValue}>{workers}</Text>
                    </View>
                    <Text style={styles.sumNote}>+{TRAVEL_BUFFER_MINUTES} min travel · price calculated at checkout</Text>
                </Card>

                <Button label="Continue" variant="teal" style={{ marginTop: spacing.lg }} onPress={() => {}} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    presets: { flexDirection: 'row', gap: spacing.sm },
    preset: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    presetOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    presetText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '600' },
    presetTextOn: { color: colors.primary },
    popular: { fontSize: 9, color: colors.primary, marginTop: 2 },
    stepper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    stepLabel: { fontSize: typography.sizes.body, color: colors.primary, fontWeight: '500' },
    stepHint: { fontSize: typography.sizes.caption, color: colors.grey },
    stepCtrl: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    stepBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    stepBtnText: { fontSize: 18, color: colors.primary },
    stepValue: { minWidth: 20, textAlign: 'center', fontSize: typography.sizes.body, fontWeight: '600', color: colors.primary },
    addon: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    addonOn: { borderWidth: 1.5, borderColor: colors.salad },
    addonName: { fontSize: typography.sizes.small, fontWeight: '500', color: colors.primary },
    addonMeta: { fontSize: typography.sizes.caption, color: colors.grey, marginTop: 2 },
    check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    checkMark: { color: colors.primary, fontWeight: '700' },
    sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    sumLabel: { color: colors.grey, fontSize: typography.sizes.small },
    sumValue: { color: colors.primary, fontSize: typography.sizes.h3, fontWeight: '700' },
    sumNote: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 6 },
});

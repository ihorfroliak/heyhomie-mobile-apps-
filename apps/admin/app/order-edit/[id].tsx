import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoMissions, demoAnalyticsMissions, demoAvailableMissions, demoAccounts } from '@heyhomie/api';
import {
    addOnsFor,
    validateBilling,
    validateSignup,
    cancellationFee,
    isLateCancellation,
    displayName,
    tr,
    formatMoney,
    type Mission,
    type AddOnId,
    type BillingDetails,
    type Contact,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const SectionLabel = ({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) => (
    <View style={styles.sectionRow}>
        <Ionicons name={icon} size={14} color={colors.grey} />
        <Text style={styles.sectionText}>{text}</Text>
    </View>
);

const locale: Locale = 'en';
const money = (n: number) => formatMoney(n, 'PLN', locale);
// Demo "now" so the 24h cancellation rule has something to show.
const NOW = '2025-05-19T20:00:00.000Z';

const ALL = [...demoMissions, ...demoAnalyticsMissions, ...demoAvailableMissions];

type RescheduleMode = 'shift' | 'move';

export default function OrderEdit() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const isNew = id === 'new';
    const source = useMemo<Mission | undefined>(() => ALL.find(m => m.id === id), [id]);

    // Client — pick an existing account or add a new minimal one (manual create).
    const [clientId, setClientId] = useState<string>(source?.client.id ?? demoAccounts[0]?.id ?? 'new');
    const [newContact, setNewContact] = useState<Contact>({});
    const [newName, setNewName] = useState('');
    const isNewClient = clientId === 'new';
    const clientBlocks = isNewClient && !validateSignup(newContact).valid;

    const [plan] = useState<'standard' | 'general'>(source?.plan ?? 'standard');
    const [price, setPrice] = useState<number>(source?.price ?? 200);
    const [selected, setSelected] = useState<Record<string, number>>(
        Object.fromEntries((source?.addOns ?? []).map(a => [a.id, a.quantity])),
    );
    const [date, setDate] = useState((source?.scheduledAt ?? '2025-05-25T10:00:00.000Z').slice(0, 10));
    const [time, setTime] = useState((source?.scheduledAt ?? '2025-05-25T10:00:00.000Z').slice(11, 16));
    const [mopPresent, setMopPresent] = useState(source?.equipment?.mopPresent ?? true);
    const [vacuumPresent, setVacuumPresent] = useState(source?.equipment?.vacuumPresent ?? true);

    const [wantInvoice, setWantInvoice] = useState(!!source?.billing);
    const [billing, setBilling] = useState<Partial<BillingDetails>>(source?.billing ?? {});
    const billingCheck = validateBilling(billing);
    const setBill = (k: keyof BillingDetails, v: string) => setBilling(prev => ({ ...prev, [k]: v }));

    const [rescheduleMode, setRescheduleMode] = useState<RescheduleMode>('move');

    const scheduledIso = `${date}T${time}:00.000Z`;
    const available = addOnsFor(plan);
    const toggle = (aid: AddOnId) =>
        setSelected(prev => {
            const next = { ...prev };
            if (next[aid]) delete next[aid];
            else next[aid] = 1;
            return next;
        });

    const late = isLateCancellation(scheduledIso, NOW);
    const fee = cancellationFee(scheduledIso, NOW, price);
    const billingBlocks = wantInvoice && !billingCheck.valid;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: isNew ? 'New order' : `Edit ${id}` }} />
            <ScrollView contentContainerStyle={styles.body}>
                {/* Client — existing account or a new minimal one */}
                <SectionLabel icon="person-outline" text="Client" />
                <View style={styles.clientWrap}>
                    {demoAccounts.map(a => {
                        const on = a.id === clientId;
                        return (
                            <Pressable key={a.id} onPress={() => setClientId(a.id)} style={[styles.clientChip, on && styles.clientChipOn]}>
                                <Text style={[styles.clientText, on && styles.clientTextOn]}>{displayName(a)}</Text>
                            </Pressable>
                        );
                    })}
                    <Pressable onPress={() => setClientId('new')} style={[styles.clientChip, styles.clientChipNew, isNewClient && styles.clientChipOn]}>
                        <Ionicons name="add" size={14} color={isNewClient ? colors.white : colors.blue} />
                        <Text style={[styles.clientText, isNewClient && styles.clientTextOn]}>New</Text>
                    </Pressable>
                </View>
                {isNewClient ? (
                    <Card style={{ marginTop: spacing.sm }}>
                        <TextInput style={styles.tInput} placeholder="Phone (+48…)" placeholderTextColor={colors.grey} keyboardType="phone-pad" value={newContact.phone ?? ''} onChangeText={t => setNewContact(p => ({ ...p, phone: t }))} />
                        <TextInput style={styles.tInput} placeholder="Email (optional)" placeholderTextColor={colors.grey} keyboardType="email-address" value={newContact.email ?? ''} onChangeText={t => setNewContact(p => ({ ...p, email: t }))} />
                        <TextInput style={[styles.tInput, { marginBottom: 0 }]} placeholder="Name (optional — defaults to Friend)" placeholderTextColor={colors.grey} value={newName} onChangeText={setNewName} />
                    </Card>
                ) : null}

                {/* Price — free adjust up or down */}
                <SectionLabel icon="cash-outline" text={`Price (${plan})`} />
                <Card style={styles.rowBetween}>
                    <View style={styles.priceCtrl}>
                        <Pressable style={styles.pBtn} onPress={() => setPrice(p => Math.max(0, p - 10))}>
                            <Text style={styles.pBtnText}>−10</Text>
                        </Pressable>
                        <TextInput
                            style={styles.priceInput}
                            keyboardType="number-pad"
                            value={String(price)}
                            onChangeText={t => setPrice(Number(t.replace(/[^0-9]/g, '')) || 0)}
                        />
                        <Pressable style={styles.pBtn} onPress={() => setPrice(p => p + 10)}>
                            <Text style={styles.pBtnText}>+10</Text>
                        </Pressable>
                    </View>
                    <Text style={styles.priceLabel}>{money(price)}</Text>
                </Card>

                {/* Add-ons — add or remove */}
                <SectionLabel icon="add-circle-outline" text="Add-ons" />
                {available.map(a => {
                    const on = !!selected[a.id];
                    return (
                        <Pressable key={a.id} onPress={() => toggle(a.id)}>
                            <Card style={[styles.addon, on && styles.addonOn]}>
                                <Text style={[styles.addonName, { flex: 1 }]}>{tr(a.label, locale)}</Text>
                                <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}</View>
                            </Card>
                        </Pressable>
                    );
                })}

                {/* Date & time */}
                <SectionLabel icon="calendar-outline" text="Date & time of visit" />
                <View style={styles.rowBetween}>
                    <TextInput style={[styles.tInput, { flex: 1, marginRight: spacing.sm }]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.grey} />
                    <TextInput style={[styles.tInput, { width: 90 }]} value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor={colors.grey} />
                </View>

                {/* Equipment (cleaning) */}
                <SectionLabel icon="home-outline" text="At the apartment" />
                <Card style={styles.switchRow}>
                    <Text style={styles.swLabel}>Mop & bucket available</Text>
                    <Switch value={mopPresent} onValueChange={setMopPresent} trackColor={{ false: colors.border, true: colors.salad }} thumbColor={colors.white} />
                </Card>
                <Card style={styles.switchRow}>
                    <Text style={styles.swLabel}>Vacuum cleaner available</Text>
                    <Switch value={vacuumPresent} onValueChange={setVacuumPresent} trackColor={{ false: colors.border, true: colors.salad }} thumbColor={colors.white} />
                </Card>

                {/* Billing — add/edit even backdated */}
                <SectionLabel icon="document-text-outline" text="Company invoice" />
                <Card style={styles.switchRow}>
                    <Text style={styles.swLabel}>Issue a faktura to a company</Text>
                    <Switch value={wantInvoice} onValueChange={setWantInvoice} trackColor={{ false: colors.border, true: colors.salad }} thumbColor={colors.white} />
                </Card>
                {wantInvoice ? (
                    <Card style={{ marginTop: spacing.sm }}>
                        <TextInput style={styles.tInput} placeholder="Company name" placeholderTextColor={colors.grey} value={billing.companyName ?? ''} onChangeText={t => setBill('companyName', t)} />
                        <TextInput style={styles.tInput} placeholder="NIP (10 digits)" placeholderTextColor={colors.grey} keyboardType="number-pad" value={billing.nip ?? ''} onChangeText={t => setBill('nip', t)} />
                        <TextInput style={styles.tInput} placeholder="Street and number" placeholderTextColor={colors.grey} value={billing.line1 ?? ''} onChangeText={t => setBill('line1', t)} />
                        <View style={styles.rowBetween}>
                            <TextInput style={[styles.tInput, { width: 110 }]} placeholder="00-000" placeholderTextColor={colors.grey} value={billing.zipCode ?? ''} onChangeText={t => setBill('zipCode', t)} />
                            <TextInput style={[styles.tInput, { flex: 1, marginLeft: spacing.sm }]} placeholder="City" placeholderTextColor={colors.grey} value={billing.city ?? ''} onChangeText={t => setBill('city', t)} />
                        </View>
                        {(billing.nip ?? '').length > 0 && !billingCheck.nipValid ? <Text style={styles.err}>Invalid NIP checksum</Text> : null}
                    </Card>
                ) : null}

                {/* Reschedule / cancel */}
                <SectionLabel icon="swap-horizontal-outline" text="Reschedule" />
                <View style={styles.modeRow}>
                    <Pressable style={[styles.modeChip, rescheduleMode === 'move' && styles.modeChipOn]} onPress={() => setRescheduleMode('move')}>
                        <Text style={[styles.modeText, rescheduleMode === 'move' && styles.modeTextOn]}>Move this visit</Text>
                    </Pressable>
                    <Pressable style={[styles.modeChip, rescheduleMode === 'shift' && styles.modeChipOn]} onPress={() => setRescheduleMode('shift')}>
                        <Text style={[styles.modeText, rescheduleMode === 'shift' && styles.modeTextOn]}>Shift series</Text>
                    </Pressable>
                </View>
                <Text style={styles.hint}>
                    {rescheduleMode === 'move'
                        ? 'Moves only this visit to the new date/time above. The rest of the cycle keeps its cadence. No fee.'
                        : 'Moves this visit and re-syncs every later visit from the new date by the original cadence.'}
                </Text>
                <Button label="Apply reschedule" variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => {}} />

                <SectionLabel icon="close-circle-outline" text="Cancel visit" />
                <Card variant="fill" style={late ? styles.warnCard : undefined}>
                    <View style={styles.warnRow}>
                        <Ionicons name={late ? 'alert-circle' : 'information-circle-outline'} size={16} color={late ? colors.danger : colors.grey} />
                        <Text style={[styles.hint, { flex: 1 }, late && styles.warnText]}>
                            {late
                                ? `Less than 24h before the visit — a 50% fee of ${money(fee)} applies.`
                                : 'More than 24h before the visit — no cancellation fee.'}
                        </Text>
                    </View>
                    <Button label={late ? `Cancel with ${money(fee)} fee` : 'Cancel (no fee)'} variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => {}} />
                </Card>

                <Button
                    label={isNew ? 'Create order' : 'Save changes'}
                    variant="teal"
                    disabled={billingBlocks || clientBlocks}
                    style={{ marginTop: spacing.xl }}
                    onPress={() => {}}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    priceCtrl: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.bgLight },
    pBtnText: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.small },
    priceInput: { width: 80, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, textAlign: 'center', color: colors.primary, fontWeight: '700' },
    priceLabel: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.body },
    addon: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    addonOn: { borderWidth: 1.5, borderColor: colors.salad },
    addonName: { fontSize: typography.sizes.small, fontWeight: '500', color: colors.primary },
    check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    tInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, color: colors.primary, marginBottom: spacing.sm },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
    swLabel: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500' },
    err: { color: colors.danger, fontSize: typography.sizes.caption },
    modeRow: { flexDirection: 'row', gap: spacing.sm },
    modeChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    modeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    modeText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '600' },
    modeTextOn: { color: colors.white },
    hint: { color: colors.grey, fontSize: typography.sizes.caption, lineHeight: 16 },
    warnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    warnCard: { backgroundColor: '#FCEBEB' },
    warnText: { color: colors.danger },
    clientWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    clientChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    clientChipNew: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    clientChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    clientText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '600' },
    clientTextOn: { color: colors.white },
});

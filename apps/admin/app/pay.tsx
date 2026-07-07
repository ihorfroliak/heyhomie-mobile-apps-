import React, { useState } from 'react';
import { ScrollView, Text, View, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoAnalyticsMissions, demoTips, homies } from '@heyhomie/api';
import { missionPayout, monthlyPayout, tipsForOrder, totalTips, payoutWithTips, formatMoney, PAYOUT_RATES, type WorkerType, type Mission, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const locale: Locale = 'en';
const YEAR = 2025;
const MONTH = 5;
const done = demoAnalyticsMissions.filter(m => m.status === 'done');

/** homieId -> engagement type, from the roster (contract data when live). */
const TYPE_BY_HOMIE: Record<string, WorkerType> = Object.fromEntries(homies.map(h => [h.id, h.workerType]));
const typeFor = (m: Mission): WorkerType => (m.homie ? (TYPE_BY_HOMIE[m.homie.id] ?? 'employee') : 'employee');

const num = (s: string): number | undefined => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
};

export default function Pay() {
    const [overridesText, setOverridesText] = useState<Record<string, string>>({});
    const [bonusText, setBonusText] = useState('');
    // Payout % per engagement type — admin-editable, seeded from PAYOUT_RATES.
    const [ratesText, setRatesText] = useState<Record<WorkerType, string>>({
        employee: String(PAYOUT_RATES.employee * 100),
        b2b: String(PAYOUT_RATES.b2b * 100),
    });
    const rateOf = (t: WorkerType): number => {
        const pct = num(ratesText[t]);
        return pct != null && pct >= 0 && pct <= 100 ? pct / 100 : PAYOUT_RATES[t];
    };
    const shareFor = (m: Mission) => rateOf(typeFor(m));

    const overrides: Record<string, number> = {};
    for (const [id, t] of Object.entries(overridesText)) {
        const v = num(t);
        if (v != null) overrides[id] = v;
    }

    const result = monthlyPayout({ missions: done, year: YEAR, month: MONTH, overrides, bonus: num(bonusText) ?? 0, shareFor });
    const monthTips = done.flatMap(m => tipsForOrder(demoTips, m.id));
    const tipsTotal = totalTips(monthTips);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Worker pay' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.sub}>Adjust the final pay per mission. Leave blank to use the rate for the homie's engagement type.</Text>

                <View style={styles.sectionRow}>
                    <Ionicons name="options-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Payout rates by engagement type</Text>
                </View>
                <Card style={{ marginBottom: spacing.md }}>
                    {(['employee', 'b2b'] as WorkerType[]).map(t => (
                        <View key={t} style={styles.rateRow}>
                            <Text style={styles.rateLabel}>{t === 'employee' ? 'Employee (umowa zlecenia)' : 'B2B (subcontractor)'}</Text>
                            <View style={styles.rateCtrl}>
                                <TextInput
                                    style={styles.rateInput}
                                    keyboardType="number-pad"
                                    value={ratesText[t]}
                                    onChangeText={v => setRatesText(prev => ({ ...prev, [t]: v }))}
                                />
                                <Text style={styles.ratePct}>%</Text>
                            </View>
                        </View>
                    ))}
                </Card>

                {done.map(m => {
                    const t = typeFor(m);
                    const def = missionPayout(m, { share: rateOf(t) });
                    const tip = totalTips(tipsForOrder(demoTips, m.id));
                    const initials = m.homie?.firstName ? m.homie.firstName.slice(0, 2).toUpperCase() : '?';
                    return (
                        <Card key={m.id} style={styles.row}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{initials}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.title}>
                                    {m.homie?.firstName} · {m.scheduledAt.slice(0, 10)}
                                </Text>
                                <Text style={styles.meta}>
                                    {m.plan} · {t === 'b2b' ? 'B2B' : 'UZ'} {Math.round(rateOf(t) * 100)}% · price {formatMoney(m.price, 'PLN', locale)} · default {formatMoney(def, 'PLN', locale)}
                                </Text>
                                {tip > 0 ? (
                                    <View style={styles.tipRow}>
                                        <Ionicons name="heart" size={11} color={colors.success} />
                                        <Text style={styles.tipText}>tip {formatMoney(tip, 'PLN', locale)}</Text>
                                    </View>
                                ) : null}
                            </View>
                            <TextInput
                                style={styles.input}
                                keyboardType="number-pad"
                                placeholder={String(def)}
                                placeholderTextColor={colors.grey}
                                value={overridesText[m.id] ?? ''}
                                onChangeText={t => setOverridesText(prev => ({ ...prev, [m.id]: t }))}
                            />
                        </Card>
                    );
                })}

                <View style={styles.sectionRow}>
                    <Ionicons name="add-circle-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Monthly bonus / adjustment</Text>
                </View>
                <TextInput
                    style={[styles.input, { width: '100%' }]}
                    keyboardType="numbers-and-punctuation"
                    placeholder="0"
                    placeholderTextColor={colors.grey}
                    value={bonusText}
                    onChangeText={setBonusText}
                />

                <Card variant="fill" style={{ marginTop: spacing.lg }}>
                    <Line label={`Missions (${result.count})`} value={formatMoney(result.gross, 'PLN', locale)} />
                    <Line label="Bonus" value={formatMoney(result.bonus, 'PLN', locale)} />
                    <Line label="Tips (100% to worker)" value={formatMoney(tipsTotal, 'PLN', locale)} />
                    <View style={styles.divider} />
                    <Line label="Total incl. tips" value={formatMoney(payoutWithTips(result.total, monthTips), 'PLN', locale)} strong />
                </Card>

                <Button label="Save pay" variant="teal" style={{ marginTop: spacing.lg }} onPress={() => {}} />
            </ScrollView>
        </SafeAreaView>
    );
}

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <View style={styles.line}>
        <Text style={[styles.lineLabel, strong && styles.strong]}>{label}</Text>
        <Text style={[styles.lineValue, strong && styles.strong]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    sub: { color: colors.grey, fontSize: typography.sizes.small, marginBottom: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontSize: 11, fontWeight: '700' },
    title: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
    tipRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    tipText: { color: colors.success, fontSize: typography.sizes.caption, fontWeight: '600' },
    input: { width: 80, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, color: colors.primary, textAlign: 'right' },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
    rateLabel: { color: colors.primary, fontSize: typography.sizes.small, flex: 1 },
    rateCtrl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rateInput: { width: 56, height: 36, borderWidth: 1, borderColor: colors.border, borderRadius: 8, textAlign: 'right', paddingHorizontal: 8, color: colors.primary, fontWeight: '700' },
    ratePct: { color: colors.grey, fontSize: typography.sizes.small },
    line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    lineLabel: { color: colors.grey, fontSize: typography.sizes.small },
    lineValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500' },
    strong: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.body },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
});

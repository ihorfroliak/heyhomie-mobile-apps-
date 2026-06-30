import React, { useState } from 'react';
import { ScrollView, Text, View, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { demoAnalyticsMissions } from '@heyhomie/api';
import { missionPayout, monthlyPayout, formatMoney, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const locale: Locale = 'en';
const YEAR = 2025;
const MONTH = 5;
const done = demoAnalyticsMissions.filter(m => m.status === 'done');

const num = (s: string): number | undefined => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
};

export default function Pay() {
    const [overridesText, setOverridesText] = useState<Record<string, string>>({});
    const [bonusText, setBonusText] = useState('');

    const overrides: Record<string, number> = {};
    for (const [id, t] of Object.entries(overridesText)) {
        const v = num(t);
        if (v != null) overrides[id] = v;
    }

    const result = monthlyPayout({ missions: done, year: YEAR, month: MONTH, overrides, bonus: num(bonusText) ?? 0 });

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Worker pay' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.sub}>Adjust the final pay per mission. Leave blank to use the default (70% of price).</Text>

                {done.map(m => {
                    const def = missionPayout(m);
                    return (
                        <Card key={m.id} style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.title}>
                                    {m.homie?.firstName} · {m.scheduledAt.slice(0, 10)}
                                </Text>
                                <Text style={styles.meta}>
                                    {m.plan} · price {formatMoney(m.price, 'PLN', locale)} · default {formatMoney(def, 'PLN', locale)}
                                </Text>
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

                <Text style={styles.section}>Monthly bonus / adjustment</Text>
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
                    <View style={styles.divider} />
                    <Line label="Total payout" value={formatMoney(result.total, 'PLN', locale)} strong />
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
    title: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
    input: { width: 80, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, color: colors.primary, textAlign: 'right' },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    lineLabel: { color: colors.grey, fontSize: typography.sizes.small },
    lineValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500' },
    strong: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.body },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
});

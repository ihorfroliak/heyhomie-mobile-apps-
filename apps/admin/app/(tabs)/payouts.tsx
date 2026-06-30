import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMoney, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button, useLocale } from '@heyhomie/ui';

const queue = [
    { id: 'h1', name: 'Olena K.', iban: '•• 3421', amount: 1340 },
    { id: 'h2', name: 'Marta W.', iban: '•• 7788', amount: 980 },
    { id: 'h3', name: 'Yulia D.', iban: '•• 1102', amount: 760 },
];

export default function Payouts() {
    const locale = useLocale();
    const total = queue.reduce((s, q) => s + q.amount, 0);
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Payouts</Text>
                <Card variant="fill" style={{ marginBottom: spacing.lg }}>
                    <Text style={styles.kLabel}>Pending this run</Text>
                    <Text style={styles.kValue}>{formatMoney(total, 'PLN', locale)}</Text>
                    <Text style={styles.note}>{queue.length} homies · paid on the 1st & 15th</Text>
                </Card>
                {queue.map(q => (
                    <View key={q.id} style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.name}>{q.name}</Text>
                            <Text style={styles.meta}>IBAN {q.iban}</Text>
                        </View>
                        <Text style={styles.amount}>{formatMoney(q.amount, 'PLN', locale)}</Text>
                        <Button label="Process" variant="ghost" style={styles.btn} onPress={() => {}} />
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    kLabel: { color: colors.grey, fontSize: typography.sizes.small },
    kValue: { fontSize: typography.sizes.h1, fontWeight: '700', color: colors.primary },
    note: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    amount: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    btn: { height: 36, paddingHorizontal: 14 },
});

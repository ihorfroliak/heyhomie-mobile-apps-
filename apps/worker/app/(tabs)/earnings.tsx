import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { demoMissions } from '@heyhomie/api';
import { formatMoney, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, useLocale } from '@heyhomie/ui';

const done = demoMissions.filter(m => m.status === 'done');

export default function Earnings() {
    const locale = useLocale();
    const balance = done.reduce((s, m) => s + m.price, 0) + 1151; // demo carry-over
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Earnings</Text>
                <Card variant="fill" style={{ marginBottom: spacing.md, alignItems: 'center' }}>
                    <Text style={styles.kLabel}>Available balance</Text>
                    <Text style={styles.kValue}>{formatMoney(balance, 'PLN', locale)}</Text>
                </Card>
                <Card style={{ marginBottom: spacing.lg }}>
                    <View style={styles.row}>
                        <Text style={styles.meta}>Next payout</Text>
                        <Text style={styles.strong}>15 May</Text>
                    </View>
                    <Text style={styles.note}>Payouts run on the 1st & 15th of each month.</Text>
                </Card>
                <Text style={styles.section}>Recent</Text>
                {done.map(m => (
                    <View key={m.id} style={styles.tx}>
                        <Text style={styles.meta}>{m.plan === 'general' ? 'General' : 'Standard'} · {m.client.firstName}</Text>
                        <Text style={styles.strong}>+{formatMoney(m.price, m.currency, locale)}</Text>
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
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginBottom: spacing.sm },
    tx: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    meta: { color: colors.grey, fontSize: typography.sizes.small },
    strong: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.small },
    note: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 4 },
});

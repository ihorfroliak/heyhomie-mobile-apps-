import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { demoAvailableMissions } from '@heyhomie/api';
import { formatDuration, formatMoney, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button, useLocale } from '@heyhomie/ui';

const dmy = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export default function Missions() {
    const locale = useLocale();
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Available missions</Text>
                {demoAvailableMissions.map(m => (
                    <Card key={m.id} style={{ marginBottom: spacing.md }}>
                        <View style={styles.row}>
                            <Text style={styles.title}>
                                {m.plan === 'general' ? 'General' : 'Standard'} cleaning · {formatDuration(m.durationMinutes)}
                            </Text>
                            <Text style={styles.pay}>{formatMoney(m.price, m.currency, locale)}</Text>
                        </View>
                        <Text style={styles.meta}>
                            {m.address.line1} · {dmy(m.scheduledAt)} {hhmm(m.scheduledAt)}
                        </Text>
                        <Text style={styles.meta}>+{m.travelBufferMinutes} min travel · {m.workerCount === 2 ? '2-person team' : '1 homie'}</Text>
                        <Button label="Accept" variant="teal" style={{ marginTop: spacing.md }} onPress={() => {}} />
                    </Card>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, flex: 1, marginRight: spacing.sm },
    pay: { fontSize: typography.sizes.body, fontWeight: '700', color: colors.success },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 4 },
});

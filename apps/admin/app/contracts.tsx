import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoContracts } from '@heyhomie/api';
import { contractStatus, contractCounts, expiringSoon, hasPayrollObligations, type ContractStatus } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const REF = '2025-05-16';
const STATUS: Record<ContractStatus, { label: string; color: string }> = {
    active: { label: 'Active', color: colors.success },
    pending: { label: 'Pending', color: colors.warning },
    expired: { label: 'Expired', color: colors.grey },
    terminated: { label: 'Terminated', color: colors.danger },
};

export default function Contracts() {
    const counts = contractCounts(demoContracts, REF);
    const expiring = expiringSoon(demoContracts, REF, 30);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Contracts & HR' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.chips}>
                    {(Object.keys(counts) as ContractStatus[])
                        .filter(s => counts[s] > 0)
                        .map(s => (
                            <View key={s} style={[styles.chip, { backgroundColor: `${STATUS[s].color}1A` }]}>
                                <Text style={[styles.chipText, { color: STATUS[s].color }]}>
                                    {STATUS[s].label} · {counts[s]}
                                </Text>
                            </View>
                        ))}
                </View>

                {expiring.length > 0 ? (
                    <Card style={styles.alert}>
                        <View style={styles.alertRow}>
                            <Ionicons name="alert-circle" size={20} color={colors.warning} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.alertTitle}>{expiring.length} contract(s) expiring within 30 days</Text>
                                <Text style={styles.alertSub}>{expiring.map(c => c.homieName).join(', ')}</Text>
                            </View>
                        </View>
                    </Card>
                ) : null}

                {demoContracts.map(c => {
                    const st = contractStatus(c, REF);
                    const initials = c.homieName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
                    return (
                        <Card key={c.id} style={styles.card}>
                            <View style={styles.row}>
                                <View style={styles.nameRow}>
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{initials}</Text>
                                    </View>
                                    <Text style={styles.name}>{c.homieName}</Text>
                                </View>
                                <View style={[styles.badge, { backgroundColor: `${STATUS[st].color}1A` }]}>
                                    <Text style={[styles.badgeText, { color: STATUS[st].color }]}>{STATUS[st].label}</Text>
                                </View>
                            </View>
                            <Text style={[styles.meta, { marginTop: 6 }]}>
                                {c.type === 'b2b' ? 'B2B (subcontractor)' : 'Umowa zlecenia'} · {c.startDate}
                                {c.endDate ? ` → ${c.endDate}` : ' → indefinite'}
                            </Text>
                            <View style={styles.docRow}>
                                <Ionicons name="document-outline" size={12} color={colors.grey} />
                                <Text style={styles.meta}>
                                    {c.documents.length} document(s) · payout {Math.round((c.ratePct ?? 0) * 100)}%
                                    {hasPayrollObligations(c.type) ? ' · ZUS/tax on us' : ' · contractor invoices'}
                                </Text>
                            </View>
                        </Card>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
    chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    chipText: { fontSize: typography.sizes.caption, fontWeight: '600' },
    alert: { borderWidth: 1, borderColor: colors.warning, marginBottom: spacing.md },
    alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    alertTitle: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    alertSub: { color: colors.warning, fontSize: typography.sizes.caption, marginTop: 2 },
    card: { marginBottom: spacing.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontSize: 10, fontWeight: '700' },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontSize: typography.sizes.caption, fontWeight: '700' },
});

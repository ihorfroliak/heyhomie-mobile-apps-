import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { demoMissions, demoTips } from '@heyhomie/api';
import { splitMissions, missionTimes, tipsForOrder, totalTips, formatDuration, formatMoney } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—');
const dmy = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
const money = (n: number) => formatMoney(n, 'PLN', 'en');

export default function WorkLog() {
    const { past } = splitMissions(demoMissions);
    const done = past.filter(m => m.status === 'done');
    const totalMinutes = done.reduce((s, m) => s + m.durationMinutes, 0);
    // Tips are the one money the worker sees — 100% theirs. Payouts/rates stay hidden.
    const myTips = done.flatMap(m => tipsForOrder(demoTips, m.id));
    const tipsTotal = totalTips(myTips);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Work log</Text>
                <View style={styles.kpis}>
                    <Card variant="fill" style={styles.kpi}>
                        <Ionicons name="time-outline" size={16} color={colors.grey} />
                        <Text style={styles.kLabel}>Time worked</Text>
                        <Text style={styles.kValue}>{formatDuration(totalMinutes)}</Text>
                    </Card>
                    <Card style={[styles.kpi, styles.tipKpi]}>
                        <Ionicons name="heart" size={16} color={colors.success} />
                        <Text style={[styles.kLabel, { color: colors.success }]}>Tips received</Text>
                        <Text style={[styles.kValue, { color: colors.success }]}>{money(tipsTotal)}</Text>
                    </Card>
                </View>

                {done.map(m => {
                    const t = missionTimes(m);
                    const tip = totalTips(tipsForOrder(demoTips, m.id));
                    return (
                        <Card key={m.id} style={styles.card}>
                            <Text style={styles.title}>
                                {m.plan === 'general' ? 'General' : 'Standard'} · {dmy(m.scheduledAt)}
                            </Text>
                            <View style={styles.times}>
                                <View style={styles.col}>
                                    <Text style={styles.colLabel}>Planned</Text>
                                    <Text style={styles.colValue}>
                                        {hhmm(t.scheduledStart)}–{hhmm(t.scheduledEnd)}
                                    </Text>
                                </View>
                                <View style={styles.col}>
                                    <Text style={styles.colLabel}>Actual</Text>
                                    <Text style={styles.colValue}>
                                        {hhmm(t.actualStart)}–{hhmm(t.actualEnd)}
                                    </Text>
                                </View>
                            </View>
                            {tip > 0 ? (
                                <View style={styles.tipRow}>
                                    <Ionicons name="heart" size={13} color={colors.success} />
                                    <Text style={styles.tip}>Tip from client: +{money(tip)}</Text>
                                </View>
                            ) : null}
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
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    kpis: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
    kpi: { flex: 1 },
    tipKpi: { backgroundColor: '#E1F5EE' },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 6 },
    kValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 2 },
    card: { marginBottom: spacing.md },
    tipRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
    tip: { color: colors.success, fontWeight: '700', fontSize: typography.sizes.small },
    title: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small, marginBottom: spacing.sm },
    times: { flexDirection: 'row', gap: spacing.lg },
    col: { flex: 1 },
    colLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    colValue: { color: colors.primary, fontSize: typography.sizes.body, fontWeight: '500', marginTop: 2 },
});

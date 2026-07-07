import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoAnalyticsMissions, missionPayout } from '@heyhomie/api';
import {
    financeReportForRange,
    dateRange,
    reportsByMonth,
    withinRange,
    totalExpenses,
    orderMargin,
    formatMoney,
    financialReportData,
    periodLabel,
    type MonthlyExpenses,
    type VatRate,
    type PeriodType,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Segmented } from '@heyhomie/ui';
import { BarChart } from '../components/Charts';
import { expenses as expensesStore } from '../lib/store';
import { exportFinancialReportPdf } from '../lib/exportPdf';

const SectionLabel = ({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) => (
    <View style={styles.sectionRow}>
        <Ionicons name={icon} size={14} color={colors.grey} />
        <Text style={styles.sectionText}>{text}</Text>
    </View>
);

const locale: Locale = 'en';
const money = (n: number) => formatMoney(n, 'PLN', locale);
const REF = '2025-05-16'; // latest demo date; use today when live

const SEED: Record<string, MonthlyExpenses> = {
    '2025-04': { accountant: 500, onlineServices: 300, salaries: 0, taxes: 700, socialContributions: 1600, contractorPay: 2800, other: 300 },
    '2025-05': { accountant: 500, onlineServices: 300, salaries: 0, taxes: 800, socialContributions: 1600, contractorPay: 3000, other: 400 },
    '2025-06': { accountant: 500, onlineServices: 350, salaries: 0, taxes: 850, socialContributions: 1600, contractorPay: 3200, other: 350 },
};

const EXPENSE_FIELDS: { key: keyof MonthlyExpenses; label: string }[] = [
    { key: 'accountant', label: 'Accountant' },
    { key: 'onlineServices', label: 'Online services' },
    { key: 'salaries', label: 'Salaries' },
    { key: 'socialContributions', label: 'Social (ZUS)' },
    { key: 'taxes', label: 'Taxes' },
    { key: 'contractorPay', label: 'Contractor (B2B)' },
    { key: 'other', label: 'Other' },
];

export default function Finance() {
    const [period, setPeriod] = useState<PeriodType>('month');
    const [vat, setVat] = useState<VatRate>(0);
    const [customStart, setCustomStart] = useState('2025-01-01');
    const [customEnd, setCustomEnd] = useState('2025-12-31');
    const [byMonth, setByMonth] = useState<Record<string, MonthlyExpenses>>(SEED);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        expensesStore.loadAll().then(stored => setByMonth(prev => ({ ...prev, ...stored })));
    }, []);

    const range = period === 'custom' ? { start: customStart, end: customEnd } : dateRange(period, REF);
    const report = financeReportForRange(demoAnalyticsMissions, byMonth, vat, range);

    const inRange = (m: string) => m >= range.start.slice(0, 7) && m <= range.end.slice(0, 7);
    const expTrend = Object.keys(byMonth).filter(inRange).sort().map(m => ({ key: m.slice(5), value: totalExpenses(byMonth[m]) }));
    const revTrend = reportsByMonth(withinRange(demoAnalyticsMissions, range.start, range.end), vat).map(t => ({ key: t.month.slice(5), value: t.revenueNet }));

    const refMonth = REF.slice(0, 7);
    const current = byMonth[refMonth] ?? SEED[refMonth];
    const setField = (key: keyof MonthlyExpenses, text: string) => {
        setSaved(false);
        setByMonth(prev => ({ ...prev, [refMonth]: { ...current, [key]: Number(text.replace(/[^\d.]/g, '')) || 0 } }));
    };
    const save = async () => {
        await expensesStore.saveMonth(refMonth, byMonth[refMonth] ?? current);
        setSaved(true);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Finance' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Segmented
                    value={period}
                    onChange={k => setPeriod(k as PeriodType)}
                    options={[
                        { key: 'month', label: 'Month' },
                        { key: 'quarter', label: 'Quarter' },
                        { key: 'year', label: 'Year' },
                        { key: 'custom', label: 'Custom' },
                    ]}
                />
                {period === 'custom' ? (
                    <View style={styles.customRow}>
                        <TextInput style={styles.dateInput} value={customStart} onChangeText={setCustomStart} placeholder="YYYY-MM-DD" placeholderTextColor={colors.grey} />
                        <Text style={styles.dash}>→</Text>
                        <TextInput style={styles.dateInput} value={customEnd} onChangeText={setCustomEnd} placeholder="YYYY-MM-DD" placeholderTextColor={colors.grey} />
                    </View>
                ) : (
                    <Text style={styles.rangeNote}>
                        {range.start} → {range.end}
                    </Text>
                )}

                <View style={styles.vatRow}>
                    {([0, 8, 23] as VatRate[]).map(r => (
                        <Text key={r} onPress={() => setVat(r)} style={[styles.vat, vat === r && styles.vatOn]}>
                            VAT {r}%
                        </Text>
                    ))}
                </View>

                <Pressable
                    style={styles.exportBtn}
                    onPress={() =>
                        exportFinancialReportPdf(
                            financialReportData({ label: periodLabel(period, REF, range), missions: demoAnalyticsMissions, byMonth, vat, range })
                        )
                    }
                >
                    <Ionicons name="download-outline" size={15} color={colors.primary} />
                    <Text style={styles.exportText}>Export PDF · {periodLabel(period, REF, range)}</Text>
                </Pressable>

                {/* Headline */}
                <View style={styles.grid}>
                    <Hero label="Revenue (net)" value={money(report.revenueNet)} />
                    <Hero label="Expenses" value={money(report.expenses)} />
                    <Hero label="Net profit" value={money(report.netProfit)} color={report.netProfit >= 0 ? colors.success : colors.danger} />
                    <Hero label="Orders" value={String(report.orders)} />
                </View>

                {/* Charts */}
                {expTrend.length > 1 ? (
                    <>
                        <SectionLabel icon="trending-down-outline" text="Expenses by month" />
                        <Card>
                            <BarChart data={expTrend} width={300} height={130} color={colors.pink} />
                        </Card>
                    </>
                ) : null}
                {revTrend.length > 1 ? (
                    <>
                        <SectionLabel icon="trending-up-outline" text="Revenue by month" />
                        <Card>
                            <BarChart data={revTrend} width={300} height={130} color={colors.blue} />
                        </Card>
                    </>
                ) : null}

                {/* Breakdown */}
                <SectionLabel icon="list-outline" text="Breakdown" />
                <Card variant="fill">
                    <Row label="Revenue (gross)" value={money(report.revenueGross)} />
                    <Row label="VAT" value={money(report.vat)} />
                    <Row label="Worker payouts" value={`− ${money(report.workerPayouts)}`} />
                    <Row label="Gross margin" value={`${money(report.grossMargin)} · ${report.grossMarginPct}%`} strong />
                    <Row label="Expenses" value={`− ${money(report.expenses)}`} />
                    <View style={styles.divider} />
                    <Row label="Net profit (delta)" value={`${money(report.netProfit)} · ${report.netProfitPct}%`} strong color={report.netProfit >= 0 ? colors.success : colors.danger} />
                </Card>

                {/* Editable current-month expenses */}
                <SectionLabel icon="create-outline" text={`Expenses — ${refMonth}`} />
                <Card>
                    {EXPENSE_FIELDS.map(f => (
                        <View key={f.key} style={styles.expRow}>
                            <Text style={styles.expLabel}>{f.label}</Text>
                            <TextInput style={styles.input} keyboardType="numeric" value={String(current[f.key] || '')} onChangeText={t => setField(f.key, t)} placeholder="0" placeholderTextColor={colors.grey} />
                        </View>
                    ))}
                    <Pressable style={styles.saveBtn} onPress={save}>
                        {saved ? <Ionicons name="checkmark" size={15} color={colors.primary} /> : null}
                        <Text style={styles.saveText}>{saved ? 'Saved' : 'Save month'}</Text>
                    </Pressable>
                </Card>

                {/* Per-order margin */}
                <SectionLabel icon="pie-chart-outline" text="Margin per order" />
                <Card variant="fill">
                    {withinRange(demoAnalyticsMissions, range.start, range.end)
                        .filter(m => m.status === 'done')
                        .slice(0, 5)
                        .map(m => {
                            const mg = orderMargin(m.price, vat, missionPayout(m));
                            return (
                                <View key={m.id} style={styles.expRow}>
                                    <Text style={styles.expLabel}>
                                        {m.address.city} · {money(m.price)}
                                    </Text>
                                    <Text style={[styles.marginVal, { color: mg.marginPln >= 0 ? colors.success : colors.danger }]}>
                                        {money(mg.marginPln)} · {mg.marginPct}%
                                    </Text>
                                </View>
                            );
                        })}
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}

const Hero = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <Card variant="fill" style={styles.hero}>
        <Text style={styles.heroLabel}>{label}</Text>
        <Text style={[styles.heroValue, color ? { color } : null]}>{value}</Text>
    </Card>
);

const Row = ({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) => (
    <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, strong && { fontWeight: '700' }, color ? { color } : null]}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    customRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    dateInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: colors.primary },
    dash: { color: colors.grey },
    rangeNote: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: spacing.sm },
    vatRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    vat: { flex: 1, textAlign: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.grey, fontWeight: '600', fontSize: typography.sizes.caption },
    vatOn: { backgroundColor: colors.salad, borderColor: colors.salad, color: colors.primary },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
    hero: { width: '47%' },
    heroLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    heroValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 4 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xl, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    rowLabel: { color: colors.grey, fontSize: typography.sizes.small },
    rowValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
    expRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    expLabel: { color: colors.primary, fontSize: typography.sizes.small, flex: 1 },
    input: { width: 96, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, textAlign: 'right', color: colors.primary },
    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: spacing.md, backgroundColor: colors.salad, borderRadius: 10, paddingVertical: 11 },
    saveText: { color: colors.primary, fontWeight: '700' },
    marginVal: { fontSize: typography.sizes.small, fontWeight: '700' },
    exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10 },
    exportText: { color: colors.primary, fontWeight: '600', fontSize: typography.sizes.small },
});

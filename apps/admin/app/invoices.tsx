import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoInvoices } from '@heyhomie/api';
import { invoiceStatus, invoiceSummary, jpkSummary, jpkXml, formatMoney, type InvoiceStatus, type InvoiceSource, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';
import { exportInvoicePdf, exportJpkXml } from '../lib/exportPdf';

const locale: Locale = 'en';
const REF = '2025-05-16';
const money = (n: number) => formatMoney(n, 'PLN', locale);

const STATUS: Record<InvoiceStatus, { label: string; color: string }> = {
    paid: { label: 'Paid', color: colors.success },
    unpaid: { label: 'Unpaid', color: colors.warning },
    overdue: { label: 'Overdue', color: colors.danger },
};
const SOURCE: Record<InvoiceSource, string> = { stripe: 'Stripe', fakturownia: 'Fakturownia' };

type Filter = 'all' | InvoiceSource;

export default function Invoices() {
    const [filter, setFilter] = useState<Filter>('all');
    const [busy, setBusy] = useState<string | null>(null);
    const list = demoInvoices.filter(i => filter === 'all' || i.source === filter);
    const s = invoiceSummary(demoInvoices, REF);

    const onExportJpk = async () => {
        setBusy('jpk');
        try {
            const summary = jpkSummary(demoInvoices, '2025-05-01', '2025-05-31');
            await exportJpkXml(jpkXml(summary), '2025-05');
        } finally {
            setBusy(null);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Invoices' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.grid}>
                    <Kpi icon="document-text-outline" label="Net" value={money(s.net)} />
                    <Kpi icon="pricetag-outline" label="VAT" value={money(s.vat)} />
                    <Kpi icon="wallet-outline" label="Gross" value={money(s.gross)} />
                    <Kpi icon="alert-circle-outline" label="Overdue" value={money(s.overdue)} color={s.overdue > 0 ? colors.danger : colors.primary} />
                </View>
                <View style={styles.statusRow}>
                    <View style={styles.statusDot}><View style={[styles.dot, { backgroundColor: colors.success }]} /><Text style={[styles.statusPill, { color: colors.success }]}>Paid {money(s.paid)}</Text></View>
                    <View style={styles.statusDot}><View style={[styles.dot, { backgroundColor: colors.warning }]} /><Text style={[styles.statusPill, { color: colors.warning }]}>Unpaid {money(s.unpaid)}</Text></View>
                    <View style={styles.statusDot}><View style={[styles.dot, { backgroundColor: colors.danger }]} /><Text style={[styles.statusPill, { color: colors.danger }]}>Overdue {money(s.overdue)}</Text></View>
                </View>

                <Pressable style={styles.jpkBtn} onPress={onExportJpk} disabled={busy === 'jpk'}>
                    <Ionicons name="download-outline" size={15} color={colors.primary} />
                    <Text style={styles.jpkText}>{busy === 'jpk' ? 'Preparing…' : 'Export JPK_V7 (May 2025) — draft'}</Text>
                </Pressable>

                <View style={styles.filters}>
                    {(['all', 'stripe', 'fakturownia'] as Filter[]).map(f => (
                        <Pressable key={f} onPress={() => setFilter(f)} style={[styles.fchip, filter === f && styles.fchipOn]}>
                            <Text style={[styles.fchipText, filter === f && styles.fchipTextOn]}>{f === 'all' ? 'All' : SOURCE[f]}</Text>
                        </Pressable>
                    ))}
                </View>

                {list.map(inv => {
                    const st = invoiceStatus(inv, REF);
                    return (
                        <Card key={inv.id} style={styles.card}>
                            <View style={styles.row}>
                                <Text style={styles.num}>{inv.number}</Text>
                                <View style={[styles.badge, { backgroundColor: `${STATUS[st].color}1A` }]}>
                                    <Text style={[styles.badgeText, { color: STATUS[st].color }]}>{STATUS[st].label}</Text>
                                </View>
                            </View>
                            <View style={styles.metaRow}>
                                <Ionicons name="person-outline" size={12} color={colors.grey} />
                                <Text style={styles.meta}>
                                    {inv.clientName} · {SOURCE[inv.source]} · {inv.issueDate}
                                    {inv.dueDate ? ` · due ${inv.dueDate}` : ''}
                                </Text>
                            </View>
                            <View style={styles.amounts}>
                                <Text style={styles.amtMeta}>net {money(inv.net)} · VAT {money(inv.vat)}</Text>
                                <Text style={styles.gross}>{money(inv.gross)}</Text>
                            </View>
                            <Pressable
                                style={styles.pdfBtn}
                                disabled={busy === inv.id}
                                onPress={async () => {
                                    setBusy(inv.id);
                                    try { await exportInvoicePdf(inv); } finally { setBusy(null); }
                                }}
                            >
                                <Ionicons name="document-outline" size={13} color={colors.primary} />
                                <Text style={styles.pdfText}>{busy === inv.id ? 'Preparing…' : 'Export PDF'}</Text>
                            </Pressable>
                        </Card>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

const Kpi = ({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color?: string }) => (
    <Card variant="fill" style={styles.kpi}>
        <Ionicons name={icon} size={15} color={color ?? colors.grey} />
        <Text style={styles.kLabel}>{label}</Text>
        <Text style={[styles.kValue, color ? { color } : null]}>{value}</Text>
    </Card>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    kpi: { width: '47%' },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 6 },
    kValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, marginTop: 2 },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
    statusDot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    statusPill: { fontSize: typography.sizes.caption, fontWeight: '600' },
    filters: { flexDirection: 'row', gap: 8, marginTop: spacing.lg, marginBottom: spacing.sm },
    fchip: { backgroundColor: colors.bgLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    fchipOn: { backgroundColor: colors.primary },
    fchipText: { color: colors.grey, fontSize: typography.sizes.caption, fontWeight: '600' },
    fchipTextOn: { color: colors.white },
    card: { marginBottom: spacing.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    num: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    amounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    amtMeta: { color: colors.grey, fontSize: typography.sizes.caption },
    gross: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    badgeText: { fontSize: typography.sizes.caption, fontWeight: '700' },
    jpkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md, backgroundColor: colors.bgLight, borderRadius: 10, paddingVertical: spacing.md },
    jpkText: { color: colors.primary, fontWeight: '600', fontSize: typography.sizes.small },
    pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    pdfText: { color: colors.primary, fontWeight: '600', fontSize: typography.sizes.caption },
});

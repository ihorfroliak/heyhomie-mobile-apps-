import React, { useSyncExternalStore } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoDrafts, demoLeads, orderGateway } from '@heyhomie/api';
import {
    funnelCounts,
    bookingConversion,
    abandonedDrafts,
    biggestDropStage,
    allLeads,
    leadCounts,
    serviceName,
    cityName,
    formatPhone,
    tr,
    DELIVERY_SLOTS,
    PAYMENT_STATUS_LABEL,
    paymentStatusTone,
    type PaymentTone,
    type BookingStage,
    type BookingDraft,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const locale: Locale = 'en';
// Demo "now" so the funnel/abandoned math has something to show.
const NOW = '2025-05-16T12:00:00.000Z';

const STAGE_LABEL: Record<BookingStage, string> = {
    started: 'Opened booking',
    service_selected: 'Picked a service',
    configured: 'Configured',
    contact_entered: 'Entered contact',
    scheduled: 'Picked a slot',
    confirmed: 'Confirmed',
};

const contactLine = (c?: { phone?: string; email?: string }) =>
    c?.phone ? formatPhone(c.phone) : (c?.email ?? 'no contact');

const TONE_COLOR: Record<PaymentTone, string> = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    neutral: colors.grey,
};

/** Full delivery block for a flower booking — recipient, address, when, note. */
const DeliveryBlock = ({ d }: { d: NonNullable<BookingDraft['delivery']> }) => {
    const slot = DELIVERY_SLOTS.find(s => s.id === d.slot);
    return (
        <View style={styles.deliveryBlock}>
            <View style={styles.dRow}>
                <Ionicons name="person-outline" size={13} color={colors.grey} />
                <Text style={styles.dText}>
                    {d.recipientName}
                    {d.recipientPhone ? ` · ${formatPhone(d.recipientPhone)}` : ''}
                </Text>
            </View>
            <View style={styles.dRow}>
                <Ionicons name="location-outline" size={13} color={colors.grey} />
                <Text style={styles.dText}>{d.line1}, {cityName(d.city, locale)}</Text>
            </View>
            <View style={styles.dRow}>
                <Ionicons name="calendar-outline" size={13} color={colors.grey} />
                <Text style={styles.dText}>
                    {d.date}{slot ? ` · ${tr(slot.label, locale)} (${slot.window})` : ''}
                </Text>
            </View>
            {d.note ? (
                <View style={styles.dRow}>
                    <Ionicons name="chatbox-ellipses-outline" size={13} color={colors.grey} />
                    <Text style={[styles.dText, styles.dNote]} numberOfLines={3}>"{d.note}"</Text>
                </View>
            ) : null}
        </View>
    );
};

export default function Pipeline() {
    // Live orders + leads through the gateway (one query against the real backend
    // when live). The funnel/abandoned analytics run on the demo seed, which is
    // the only source carrying multi-stage funnel data.
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot);
    const storeLeads = useSyncExternalStore(orderGateway.subscribe, orderGateway.leadsSnapshot);

    const steps = funnelCounts(demoDrafts);
    const top = steps[0]?.reached || 1;
    const conv = bookingConversion(demoDrafts);
    const drop = biggestDropStage(demoDrafts);
    const abandoned = abandonedDrafts(demoDrafts, NOW);
    const leads = allLeads([...demoLeads, ...storeLeads], demoDrafts, NOW);
    const lCounts = leadCounts(leads);
    // Live orders, newest first — the admin's order view via the gateway.
    const liveBookings = orders.slice().reverse();

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Pipeline' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.grid}>
                    <Kpi icon="trending-up-outline" label="Conversion" value={`${Math.round(conv * 100)}%`} />
                    <Kpi icon="alert-circle-outline" label="Abandoned" value={String(abandoned.length)} color={abandoned.length ? colors.danger : colors.primary} />
                    <Kpi icon="person-add-outline" label="Open leads" value={String(lCounts.new + lCounts.contacted)} />
                </View>

                <View style={styles.sectionRow}>
                    <Ionicons name="funnel-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Booking funnel</Text>
                </View>
                <Card>
                    {steps.map(s => {
                        const pct = Math.round((s.reached / top) * 100);
                        const isDrop = s.stage === drop;
                        return (
                            <View key={s.stage} style={styles.funnelRow}>
                                <Text style={styles.funnelLabel}>{STAGE_LABEL[s.stage]}</Text>
                                <View style={styles.track}>
                                    <View style={[styles.fill, { width: `${pct}%`, backgroundColor: isDrop ? colors.danger : colors.blue }]} />
                                </View>
                                <Text style={styles.funnelVal}>{s.reached}</Text>
                            </View>
                        );
                    })}
                    {drop ? (
                        <View style={styles.noteRow}>
                            <Ionicons name="bulb-outline" size={13} color={colors.grey} />
                            <Text style={styles.note}>Biggest drop-off after "{STAGE_LABEL[drop]}" — focus re-engagement here.</Text>
                        </View>
                    ) : null}
                </Card>

                <View style={styles.sectionRow}>
                    <Ionicons name="flash-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Live bookings · {liveBookings.length}</Text>
                </View>
                {liveBookings.length === 0 ? (
                    <Text style={styles.note}>Client submissions appear here instantly.</Text>
                ) : null}
                {liveBookings.map(o => {
                    const pay = o.payment;
                    const tone = pay ? TONE_COLOR[paymentStatusTone(pay.status)] : colors.grey;
                    return (
                        <Card key={o.id} style={styles.card}>
                            <View style={styles.rowBetween}>
                                <Text style={styles.itemTitle}>{o.serviceId ? serviceName(o.serviceId, locale) : 'Booking'}</Text>
                                <View style={styles.livePill}>
                                    <Ionicons name="checkmark" size={10} color={colors.success} />
                                    <Text style={styles.livePillText}>Confirmed</Text>
                                </View>
                            </View>
                            <View style={styles.metaRow}>
                                <Ionicons name="location-outline" size={12} color={colors.grey} />
                                <Text style={styles.meta}>
                                    {o.cityId ? cityName(o.cityId, locale) : '—'} · {contactLine(o.contact)} · {new Date(o.updatedAt).toLocaleString()}
                                </Text>
                            </View>
                            {o.delivery ? <DeliveryBlock d={o.delivery} /> : null}
                            {pay ? (
                                <View style={styles.payLine}>
                                    <View style={styles.payStatus}>
                                        <Ionicons name={pay.method === 'pay_later' ? 'mail-outline' : 'card-outline'} size={13} color={tone} />
                                        <Text style={[styles.payStatusText, { color: tone }]}>
                                            {pay.method === 'pay_later' ? 'Pay later' : 'Card'} · {tr(PAYMENT_STATUS_LABEL[pay.status], locale)}
                                        </Text>
                                    </View>
                                    {pay.status !== 'paid' && pay.status !== 'refunded' ? (
                                        <Pressable style={styles.markPaidBtn} onPress={() => orderGateway.markPaid(o.id)}>
                                            <Ionicons name="checkmark" size={12} color={colors.white} />
                                            <Text style={styles.markPaidText}>Mark paid</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            ) : null}
                        </Card>
                    );
                })}

                <View style={styles.sectionRow}>
                    <Ionicons name="time-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Abandoned orders</Text>
                </View>
                {abandoned.length === 0 ? <Text style={styles.note}>None right now.</Text> : null}
                {abandoned.map(d => (
                    <Card key={d.id} style={styles.card}>
                        <View style={styles.rowBetween}>
                            <Text style={styles.itemTitle}>{d.serviceId ? serviceName(d.serviceId, locale) : 'Booking'}</Text>
                            <View style={styles.stagePill}>
                                <Text style={styles.stagePillText}>{STAGE_LABEL[d.stage]}</Text>
                            </View>
                        </View>
                        <View style={styles.metaRow}>
                            <Ionicons name="location-outline" size={12} color={colors.grey} />
                            <Text style={styles.meta}>{d.cityId ? cityName(d.cityId, locale) : '—'} · {contactLine(d.contact)}</Text>
                        </View>
                        <Pressable style={styles.followBtn} onPress={() => {}}>
                            <Ionicons name={d.contact?.phone || d.contact?.email ? 'send-outline' : 'ban-outline'} size={13} color={colors.primary} />
                            <Text style={styles.followText}>{d.contact?.phone || d.contact?.email ? 'Send follow-up' : 'No contact to reach'}</Text>
                        </Pressable>
                    </Card>
                ))}

                <View style={styles.sectionRow}>
                    <Ionicons name="person-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Leads · {leads.length}</Text>
                </View>
                {leads.map(l => (
                    <Card key={l.id} style={styles.card}>
                        <View style={styles.rowBetween}>
                            <View style={styles.leadLeft}>
                                <View style={styles.leadAvatar}>
                                    <Ionicons name="person" size={13} color={colors.blue} />
                                </View>
                                <Text style={styles.itemTitle}>{contactLine(l.contact)}</Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: `${statusColor(l.status)}1A` }]}>
                                <Text style={[styles.statusText, { color: statusColor(l.status) }]}>{l.status}</Text>
                            </View>
                        </View>
                        <Text style={styles.meta}>
                            {l.source.replace('_', ' ')}
                            {l.serviceInterest ? ` · ${serviceName(l.serviceInterest, locale)}` : ''}
                            {l.cityId ? ` · ${cityName(l.cityId, locale)}` : ''}
                        </Text>
                    </Card>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const statusColor = (s: string) =>
    s === 'converted' ? colors.success : s === 'lost' ? colors.grey : s === 'contacted' ? colors.warning : colors.blue;

const Kpi = ({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color?: string }) => (
    <Card variant="fill" style={styles.kpi}>
        <Ionicons name={icon} size={16} color={color ?? colors.grey} />
        <Text style={styles.kLabel}>{label}</Text>
        <Text style={[styles.kValue, color ? { color } : null]}>{value}</Text>
    </Card>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    grid: { flexDirection: 'row', gap: spacing.md },
    kpi: { flex: 1 },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 6 },
    kValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 2 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xl, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    funnelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    funnelLabel: { width: 110, fontSize: typography.sizes.caption, color: colors.primary },
    track: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.bgLight, overflow: 'hidden', marginHorizontal: spacing.sm },
    fill: { height: '100%', borderRadius: 7 },
    funnelVal: { width: 24, textAlign: 'right', fontSize: typography.sizes.caption, color: colors.grey, fontWeight: '700' },
    noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: spacing.sm },
    note: { color: colors.grey, fontSize: typography.sizes.caption, lineHeight: 16, flexShrink: 1 },
    card: { marginBottom: spacing.sm },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    itemTitle: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small, flex: 1, marginRight: spacing.sm },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    stagePill: { backgroundColor: colors.bgLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    stagePillText: { fontSize: 10, color: colors.grey, fontWeight: '700' },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${colors.success}1A`, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    livePillText: { fontSize: 10, fontWeight: '700', color: colors.success },
    payLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
    payStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    payStatusText: { fontSize: typography.sizes.caption, fontWeight: '600' },
    markPaidBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    markPaidText: { color: colors.white, fontSize: typography.sizes.caption, fontWeight: '700' },
    deliveryBlock: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
    dRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    dText: { color: colors.primary, fontSize: typography.sizes.caption, flexShrink: 1 },
    dNote: { fontStyle: 'italic', color: colors.grey },
    leadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    leadAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center' },
    statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    statusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    followBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    followText: { color: colors.primary, fontWeight: '600', fontSize: typography.sizes.caption },
});

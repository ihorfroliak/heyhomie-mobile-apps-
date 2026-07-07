import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoMissions, demoServices, orderGateway } from '@heyhomie/api';
import { splitMissions, frequencyLabel, serviceName, tr, PAYMENT_STATUS_LABEL, paymentStatusTone, type PaymentTone, formatDuration, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Segmented, MissionCard, useLocale } from '@heyhomie/ui';

const TONE_COLOR: Record<PaymentTone, string> = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    neutral: colors.grey,
};

export default function Activity() {
    const locale = useLocale();
    const router = useRouter();
    const [tab, setTab] = useState<'orders' | 'services'>('orders');
    const { upcoming, past } = splitMissions(demoMissions);
    // Freshly booked orders (with joined payment) from the gateway, live.
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Activity</Text>
                <Segmented
                    value={tab}
                    onChange={k => setTab(k as 'orders' | 'services')}
                    options={[
                        { key: 'orders', label: 'Orders' },
                        { key: 'services', label: 'Services' },
                    ]}
                />

                {tab === 'orders' ? (
                    <>
                        {orders.length > 0 ? (
                            <>
                                <View style={styles.sectionRow}>
                                    <Ionicons name="sparkles-outline" size={14} color={colors.grey} />
                                    <Text style={styles.sectionText}>Just booked</Text>
                                </View>
                                {orders.slice().reverse().map(o => {
                                    const pay = o.payment;
                                    const tone = pay ? TONE_COLOR[paymentStatusTone(pay.status)] : colors.grey;
                                    // "Pay now" only once the post-cleaning link has actually been emailed.
                                    const canPay = pay?.status === 'link_sent';
                                    return (
                                        <Card key={o.id} style={styles.justBooked}>
                                            <View style={styles.jbRow}>
                                                <Text style={styles.jbTitle}>{o.serviceId ? serviceName(o.serviceId, locale) : 'Booking'}</Text>
                                                <View style={styles.jbBadge}>
                                                    <Ionicons name="checkmark" size={10} color={colors.success} />
                                                    <Text style={styles.jbBadgeText}>Confirmed</Text>
                                                </View>
                                            </View>
                                            <View style={styles.metaRow}>
                                                <Ionicons name="hourglass-outline" size={12} color={colors.grey} />
                                                <Text style={styles.meta}>Confirmation sent · awaiting a homie</Text>
                                            </View>
                                            {pay ? (
                                                <View style={styles.payLine}>
                                                    <View style={styles.payStatus}>
                                                        <Ionicons name={pay.method === 'card' ? 'card-outline' : 'time-outline'} size={13} color={tone} />
                                                        <Text style={[styles.payStatusText, { color: tone }]}>
                                                            {pay.method === 'pay_later' ? 'Pay later' : 'Card'} · {tr(PAYMENT_STATUS_LABEL[pay.status], locale)}
                                                        </Text>
                                                    </View>
                                                    {canPay ? (
                                                        <Pressable style={styles.payNowBtn} onPress={() => void orderGateway.settleOrder(o.id)}>
                                                            <Text style={styles.payNowText}>Pay now</Text>
                                                        </Pressable>
                                                    ) : null}
                                                </View>
                                            ) : null}
                                        </Card>
                                    );
                                })}
                            </>
                        ) : null}
                        <View style={styles.sectionRow}>
                            <Ionicons name="calendar-outline" size={14} color={colors.grey} />
                            <Text style={styles.sectionText}>Upcoming</Text>
                        </View>
                        {upcoming.map(m => (
                            <MissionCard key={m.id} mission={m} locale={locale} onPress={() => router.push(`/mission/${m.id}`)} />
                        ))}
                        <View style={styles.sectionRow}>
                            <Ionicons name="checkmark-done-outline" size={14} color={colors.grey} />
                            <Text style={styles.sectionText}>Past</Text>
                        </View>
                        {past.map(m => (
                            <MissionCard key={m.id} mission={m} locale={locale} onPress={() => router.push(`/mission/${m.id}`)} />
                        ))}
                    </>
                ) : (
                    <>
                        <View style={styles.sectionRow}>
                            <Ionicons name="repeat-outline" size={14} color={colors.grey} />
                            <Text style={styles.sectionText}>Recurring services</Text>
                        </View>
                        {demoServices.map(s => (
                            <Card key={s.id} variant="fill" style={{ marginBottom: spacing.md }}>
                                <Text style={styles.title}>Weekly cleaning</Text>
                                <View style={styles.metaRow}>
                                    <Ionicons name="person-outline" size={12} color={colors.grey} />
                                    <Text style={styles.meta}>
                                        {tr(frequencyLabel[s.frequency], locale)} · {formatDuration(180)} · {s.assignedHomie?.firstName}
                                    </Text>
                                </View>
                                {s.upcomingMissions.map(m => (
                                    <View key={m.id} style={styles.miniRow}>
                                        <Ionicons name="calendar-outline" size={12} color={colors.primary} />
                                        <Text style={styles.miniRowText}>
                                            {new Date(m.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })} · {new Date(m.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                        </Text>
                                    </View>
                                ))}
                            </Card>
                        ))}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, marginBottom: spacing.sm },
    meta: { color: colors.grey, fontSize: typography.sizes.small },
    miniRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
    miniRowText: { color: colors.primary, fontSize: typography.sizes.small },
    justBooked: { marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.salad },
    jbRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    jbTitle: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    jbBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${colors.success}1A`, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    jbBadgeText: { fontSize: 10, fontWeight: '700', color: colors.success },
    payLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
    payStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    payStatusText: { fontSize: typography.sizes.caption, fontWeight: '600' },
    payNowBtn: { backgroundColor: colors.salad, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
    payNowText: { color: colors.primary, fontSize: typography.sizes.caption, fontWeight: '700' },
});

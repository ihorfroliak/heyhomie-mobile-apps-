import React, { useSyncExternalStore } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderGateway, type OrderStatus } from '@heyhomie/api';
import { serviceName } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button, useLocale } from '@heyhomie/ui';

// Admin order detail — LIVE from the gateway, with the full set of operator
// actions the frozen OrderGateway exposes: confirm / cancel / complete / settle /
// mark-paid. Fire-and-reconcile: the action posts, the stream re-emits truth.
const STATUS_LABEL: Record<OrderStatus, string> = {
    confirmed: 'Confirmed', completed: 'Completed — awaiting payment', paid: 'Paid', canceled: 'Canceled',
};

const DetailRow = ({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) => (
    <View style={styles.detailRow}>
        <View style={styles.detailLeft}><Ionicons name={icon} size={15} color={colors.grey} /><Text style={styles.detailLabel}>{label}</Text></View>
        <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
);

export default function AdminOrderDetail() {
    const locale = useLocale();
    const { id } = useLocalSearchParams<{ id: string }>();
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot);
    const order = orders.find(o => o.id === id) ?? orderGateway.getOrder(id ?? '');

    if (!order) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <Stack.Screen options={{ headerShown: true, title: 'Order' }} />
                <View style={styles.missing}><Ionicons name="alert-circle-outline" size={26} color={colors.grey} /><Text style={styles.missingText}>This order is no longer available.</Text></View>
            </SafeAreaView>
        );
    }

    const now = () => new Date().toISOString();
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Order' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.row}>
                    <Text style={styles.title}>{order.serviceId ? serviceName(order.serviceId, locale) : 'Cleaning order'}</Text>
                    <Text style={styles.status}>{STATUS_LABEL[order.status]}</Text>
                </View>

                <Card variant="fill" style={{ marginTop: spacing.md }}>
                    <DetailRow icon="pricetag-outline" label="Reference" value={`#${order.id.slice(0, 8)}`} />
                    <DetailRow icon="location-outline" label="City" value={order.cityId ?? '—'} />
                    {order.contact?.phone ? <DetailRow icon="call-outline" label="Contact" value={order.contact.phone} /> : null}
                    {order.contact?.email ? <DetailRow icon="mail-outline" label="Email" value={order.contact.email} /> : null}
                    {order.payment ? <DetailRow icon="card-outline" label="Payment" value={order.payment.status} /> : null}
                </Card>

                <Text style={styles.actionsH}>Actions</Text>
                <View style={styles.actions}>
                    {order.status === 'confirmed' ? (
                        <>
                            <Button label="Mark completed" variant="teal" onPress={() => { void orderGateway.completeOrder(order.id, now()); }} />
                            <Button label="Cancel order" variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => { void orderGateway.cancelOrder(order.id); }} />
                        </>
                    ) : order.status === 'completed' ? (
                        <>
                            <Button label="Settle payment" variant="teal" onPress={() => { void orderGateway.settleOrder(order.id, now()); }} />
                            <Button label="Mark paid (manual)" variant="ghost" style={{ marginTop: spacing.sm }} onPress={() => { void orderGateway.markPaid(order.id); }} />
                        </>
                    ) : order.status === 'canceled' ? (
                        <View style={styles.info}><Ionicons name="refresh-outline" size={18} color={colors.blue} /><Text style={styles.infoText}>Canceled. Re-confirm to reopen.</Text>
                            <Button label="Re-confirm" variant="ghost" style={{ marginTop: spacing.sm, alignSelf: 'stretch' }} onPress={() => { void orderGateway.confirmOrder(order.id); }} /></View>
                    ) : (
                        <View style={styles.info}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={[styles.infoText, { color: colors.success }]}>Paid and settled — nothing to do.</Text></View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, flex: 1, marginRight: spacing.sm },
    status: { fontSize: typography.sizes.small, fontWeight: '600', color: colors.grey },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
    detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    detailLabel: { color: colors.grey, fontSize: typography.sizes.small },
    detailValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },
    actionsH: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.xl, marginBottom: spacing.sm },
    actions: { gap: 0 },
    info: { alignItems: 'center', gap: 6, paddingVertical: spacing.md },
    infoText: { color: colors.grey, fontSize: typography.sizes.small, textAlign: 'center' },
    missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    missingText: { color: colors.grey, fontSize: typography.sizes.small },
});

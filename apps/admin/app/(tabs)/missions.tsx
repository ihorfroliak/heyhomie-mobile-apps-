import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderGateway, type OrderStatus } from '@heyhomie/api';
import { serviceName } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, EmptyState, useLocale } from '@heyhomie/ui';

// Admin order list — LIVE from the gateway (Local offline / HTTP when a backend is
// wired). Uses the contract's OrderStatus, not the demo Mission model.
const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
    confirmed: { label: 'Confirmed', tone: colors.blue },
    completed: { label: 'Completed', tone: colors.warning },
    paid: { label: 'Paid', tone: colors.success },
    canceled: { label: 'Canceled', tone: colors.grey },
};

type Filter = 'all' | OrderStatus;
const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'completed', label: 'Completed' },
    { key: 'paid', label: 'Paid' },
    { key: 'canceled', label: 'Canceled' },
];

export default function Orders() {
    const locale = useLocale();
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot);
    const list = orders.filter(o => filter === 'all' || o.status === filter).slice().reverse();

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Orders</Text>
                <View style={styles.filters}>
                    {FILTERS.map(f => (
                        <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipOn]}>
                            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
                        </Pressable>
                    ))}
                </View>
                {list.length === 0 ? <EmptyState title="No orders" subtitle="They appear here as clients book." /> : null}
                {list.map(o => {
                    const s = STATUS[o.status];
                    return (
                        <Pressable key={o.id} onPress={() => router.push(`/order/${o.id}`)}>
                            <Card style={{ marginBottom: spacing.md }}>
                                <View style={styles.row}>
                                    <View style={[styles.badge, { backgroundColor: `${s.tone}1A` }]}>
                                        <Text style={[styles.badgeText, { color: s.tone }]}>{s.label}</Text>
                                    </View>
                                    <Text style={styles.id}>#{o.id.slice(0, 8)}</Text>
                                </View>
                                <Text style={styles.title}>{o.serviceId ? serviceName(o.serviceId, locale) : 'Cleaning order'}</Text>
                                <View style={styles.metaRow}>
                                    <Ionicons name="location-outline" size={13} color={colors.grey} />
                                    <Text style={styles.meta}>{o.cityId ?? '—'}</Text>
                                    {o.contact?.phone ? (
                                        <>
                                            <Ionicons name="call-outline" size={13} color={colors.grey} style={{ marginLeft: 8 }} />
                                            <Text style={styles.meta}>{o.contact.phone}</Text>
                                        </>
                                    ) : null}
                                    <Ionicons name="chevron-forward" size={16} color={colors.grey} style={{ marginLeft: 'auto' }} />
                                </View>
                            </Card>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.md },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
    chip: { backgroundColor: colors.bgLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    chipOn: { backgroundColor: colors.primary },
    chipText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '500' },
    chipTextOn: { color: colors.white },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    id: { color: colors.grey, fontSize: typography.sizes.caption, fontVariant: ['tabular-nums'] },
    title: { fontWeight: '700', color: colors.primary, marginTop: 8, fontSize: typography.sizes.h3 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    meta: { color: colors.grey, fontSize: typography.sizes.small },
});

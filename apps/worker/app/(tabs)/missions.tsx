import React, { useSyncExternalStore } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderGateway, type Order, type OrderStatus } from '@heyhomie/api';
import { serviceName } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, useLocale } from '@heyhomie/ui';

// Worker-facing status label + tone. The worker never sees prices/payouts — only
// what a job needs: what to do and where. (Preserves the app's privacy stance.)
const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
    confirmed: { label: 'To do', tone: colors.blue },
    completed: { label: 'Done, awaiting payment', tone: colors.warning },
    paid: { label: 'Paid', tone: colors.success },
    canceled: { label: 'Canceled', tone: colors.grey },
};

function JobCard({ order, onPress }: { order: Order; onPress: () => void }) {
    const locale = useLocale();
    const s = STATUS[order.status];
    return (
        <Pressable onPress={onPress}>
            <Card style={{ marginBottom: spacing.md }}>
                <View style={styles.row}>
                    <Text style={styles.title}>{order.serviceId ? serviceName(order.serviceId, locale) : 'Cleaning job'}</Text>
                    <View style={[styles.badge, { backgroundColor: `${s.tone}1A` }]}>
                        <Text style={[styles.badgeText, { color: s.tone }]}>{s.label}</Text>
                    </View>
                </View>
                <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={13} color={colors.grey} />
                    <Text style={styles.meta}>{order.cityId ?? 'Location on the job'}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.grey} style={{ marginLeft: 'auto' }} />
                </View>
            </Card>
        </Pressable>
    );
}

export default function Jobs() {
    const router = useRouter();
    // Live jobs for this worker's tenant, straight from the gateway (Local or HTTP).
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot);
    const active = orders.filter(o => o.status === 'confirmed' || o.status === 'completed');
    const done = orders.filter(o => o.status === 'paid');

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Your jobs</Text>

                <View style={styles.sectionRow}>
                    <Ionicons name="briefcase-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Active</Text>
                </View>
                {active.length > 0 ? (
                    active.slice().reverse().map(o => <JobCard key={o.id} order={o} onPress={() => router.push(`/job/${o.id}`)} />)
                ) : (
                    <View style={styles.empty}>
                        <Ionicons name="checkmark-circle-outline" size={26} color={colors.grey} />
                        <Text style={styles.emptyText}>No active jobs right now.</Text>
                    </View>
                )}

                {done.length > 0 ? (
                    <>
                        <View style={styles.sectionRow}>
                            <Ionicons name="checkmark-done-outline" size={14} color={colors.grey} />
                            <Text style={styles.sectionText}>Completed</Text>
                        </View>
                        {done.slice().reverse().map(o => <JobCard key={o.id} order={o} onPress={() => router.push(`/job/${o.id}`)} />)}
                    </>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.md },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, flex: 1, marginRight: spacing.sm },
    badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
    meta: { color: colors.grey, fontSize: typography.sizes.small },
    empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
    emptyText: { color: colors.grey, fontSize: typography.sizes.small },
});

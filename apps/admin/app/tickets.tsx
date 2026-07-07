import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoTickets } from '@heyhomie/api';
import { ticketCounts, nextTicketStatus, setTicketStatus, type Ticket, type TicketPriority, type TicketStatus } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const PRIORITY: Record<TicketPriority, string> = { high: colors.danger, normal: colors.warning, low: colors.grey };
const STATUS: Record<TicketStatus, string> = { open: colors.danger, pending: colors.warning, resolved: colors.success };

export default function Tickets() {
    // Local mock state — swap to API mutations (updateTicket) when the backend is wired.
    const [tickets, setTickets] = useState<Ticket[]>(demoTickets);
    const [showResolved, setShowResolved] = useState(false);
    const counts = ticketCounts(tickets);

    const advance = (t: Ticket) => setTickets(prev => setTicketStatus(prev, t.id, nextTicketStatus(t.status)));

    // Unresolved first, then newest first.
    const visible = tickets
        .filter(t => showResolved || t.status !== 'resolved')
        .sort((a, b) => {
            const resolvedDiff = Number(a.status === 'resolved') - Number(b.status === 'resolved');
            return resolvedDiff !== 0 ? resolvedDiff : b.createdAt.localeCompare(a.createdAt);
        });

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Support' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.chips}>
                    <Chip label="Open" value={counts.open} color={colors.danger} />
                    <Chip label="Pending" value={counts.pending} color={colors.warning} />
                    <Chip label="Resolved" value={counts.resolved} color={colors.success} />
                </View>

                <View style={styles.filterRow}>
                    <Text style={styles.section}>{showResolved ? 'All tickets' : 'Needs response'}</Text>
                    <Pressable onPress={() => setShowResolved(v => !v)}>
                        <Text style={styles.toggle}>{showResolved ? 'Hide resolved' : 'Show resolved'}</Text>
                    </Pressable>
                </View>

                {visible.map(t => (
                    <Card key={t.id} style={styles.card}>
                        <View style={styles.row}>
                            <Text style={styles.subject}>{t.subject}</Text>
                            <View style={[styles.pri, { backgroundColor: `${PRIORITY[t.priority]}1A` }]}>
                                <Text style={[styles.priText, { color: PRIORITY[t.priority] }]}>{t.priority}</Text>
                            </View>
                        </View>
                        <View style={styles.metaRow}>
                            <Ionicons name={t.author === 'client' ? 'person-outline' : 'briefcase-outline'} size={12} color={colors.grey} />
                            <Text style={styles.meta}>
                                {t.author === 'client' ? 'Client' : 'Homie'}: {t.authorName} · {new Date(t.createdAt).toLocaleDateString()}
                            </Text>
                        </View>
                        <Pressable style={styles.statusBtn} onPress={() => advance(t)}>
                            <View style={[styles.dot, { backgroundColor: STATUS[t.status] }]} />
                            <Text style={[styles.statusText, { color: STATUS[t.status] }]}>{t.status}</Text>
                            <Ionicons name="arrow-forward" size={11} color={colors.grey} />
                            <Text style={styles.statusHint}>mark {nextTicketStatus(t.status)}</Text>
                        </Pressable>
                    </Card>
                ))}
                {visible.length === 0 ? (
                    <View style={styles.doneRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                        <Text style={styles.meta}>All caught up.</Text>
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const Chip = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <View style={[styles.chip, { backgroundColor: `${color}1A` }]}>
        <Text style={[styles.chipText, { color }]}>
            {label} · {value}
        </Text>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    chips: { flexDirection: 'row', gap: spacing.sm },
    chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    chipText: { fontSize: typography.sizes.caption, fontWeight: '600' },
    filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    toggle: { fontSize: typography.sizes.caption, color: colors.primary, fontWeight: '600', marginBottom: spacing.sm },
    card: { marginBottom: spacing.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    subject: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small, flex: 1, marginRight: spacing.sm },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    pri: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
    priText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: typography.sizes.caption, fontWeight: '700', textTransform: 'capitalize' },
    statusHint: { fontSize: typography.sizes.caption, color: colors.grey },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

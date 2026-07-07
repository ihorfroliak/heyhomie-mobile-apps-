import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

interface Pending {
    id: string;
    name: string;
    submitted: string;
    city: string;
}

const initialQueue: Pending[] = [
    { id: 'p1', name: 'Sofia Petrenko', submitted: '2 days ago', city: 'krakow' },
    { id: 'p2', name: 'Dmytro K.', submitted: 'today', city: 'warsaw' },
];

export default function Verification() {
    const [queue, setQueue] = useState<Pending[]>(initialQueue);
    const resolve = (id: string) => setQueue(q => q.filter(p => p.id !== id));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Verification' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>{queue.length} pending</Text>
                {queue.length === 0 ? (
                    <View style={styles.emptyRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                        <Text style={styles.empty}>Queue is clear.</Text>
                    </View>
                ) : null}
                {queue.map(p => (
                    <Card key={p.id} style={{ marginBottom: spacing.md }}>
                        <View style={styles.row}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>
                                    {p.name
                                        .split(' ')
                                        .map(n => n[0])
                                        .join('')
                                        .slice(0, 2)}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.name}>{p.name}</Text>
                                <View style={styles.metaRow}>
                                    <Ionicons name="time-outline" size={11} color={colors.grey} />
                                    <Text style={styles.meta}>Submitted {p.submitted} · {p.city}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.docs}>
                            <View style={styles.doc}>
                                <Ionicons name="card-outline" size={18} color={colors.grey} />
                                <Text style={styles.docText}>ID</Text>
                            </View>
                            <View style={styles.doc}>
                                <Ionicons name="home-outline" size={18} color={colors.grey} />
                                <Text style={styles.docText}>Address</Text>
                            </View>
                        </View>
                        <View style={styles.actions}>
                            <Button label="Reject" variant="ghost" style={styles.act} onPress={() => resolve(p.id)} />
                            <Button label="Approve" variant="teal" style={styles.act} onPress={() => resolve(p.id)} />
                        </View>
                    </Card>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    empty: { color: colors.success, fontSize: typography.sizes.small },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 12 },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    docs: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
    doc: { flex: 1, height: 56, borderRadius: 8, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center', gap: 4 },
    docText: { color: colors.grey, fontSize: typography.sizes.caption },
    actions: { flexDirection: 'row', gap: spacing.md },
    act: { flex: 1, height: 40 },
});

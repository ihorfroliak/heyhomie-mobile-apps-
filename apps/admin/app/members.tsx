import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, type MemberSummary } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

/**
 * Members (Build 25) — owner view of the tenant roster with disable / enable /
 * delete. Owner-only actions are enforced server-side (403 otherwise). The owner
 * row has no actions (cannot act on self / the last owner). No password hashes.
 */
export default function Members() {
    const [items, setItems] = useState<MemberSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            setItems(await auth.listMembers());
        } catch {
            setError('Could not load members.');
            setItems([]);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const run = async (fn: () => Promise<void>, failMsg: string) => {
        try { await fn(); await load(); } catch { setError(failMsg); }
    };

    const confirmDelete = (m: MemberSummary) => {
        Alert.alert('Delete member', `Permanently delete ${m.email}? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void run(() => auth.deleteUser(m.id), 'Could not delete that member.') },
        ]);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Members' }} />
            <ScrollView contentContainerStyle={styles.body}>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {items === null ? (
                    <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
                ) : (
                    items.map(m => (
                        <Card key={m.id} style={{ marginBottom: spacing.md }}>
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.email}>{m.email}</Text>
                                    <Text style={styles.meta}>{m.role}{m.status === 'disabled' ? ' · disabled' : ''}</Text>
                                </View>
                                {m.role !== 'owner' ? (
                                    <View style={styles.actions}>
                                        {m.status === 'disabled' ? (
                                            <Pressable style={styles.action} onPress={() => void run(() => auth.enableUser(m.id), 'Could not enable that member.')}>
                                                <Ionicons name="play-circle-outline" size={20} color={colors.success} />
                                            </Pressable>
                                        ) : (
                                            <Pressable style={styles.action} onPress={() => void run(() => auth.disableUser(m.id), 'Could not disable that member.')}>
                                                <Ionicons name="pause-circle-outline" size={20} color={colors.warning} />
                                            </Pressable>
                                        )}
                                        <Pressable style={styles.action} onPress={() => confirmDelete(m)}>
                                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                        </Pressable>
                                    </View>
                                ) : (
                                    <Text style={styles.ownerTag}>owner</Text>
                                )}
                            </View>
                        </Card>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    error: { color: colors.danger, fontSize: typography.sizes.small, marginBottom: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    email: { fontSize: typography.sizes.body, fontWeight: '700', color: colors.primary },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 2, textTransform: 'capitalize' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    action: { padding: 4 },
    ownerTag: { color: colors.grey, fontSize: typography.sizes.caption, fontWeight: '700', textTransform: 'uppercase' },
});

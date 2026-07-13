import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, type InvitationSummary } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const TONE: Record<InvitationSummary['status'], string> = {
    pending: colors.blue,
    accepted: colors.success,
    revoked: colors.grey,
    expired: colors.warning,
};

/**
 * Invitations list (Build 24) — owner/admin view of the tenant's invites with a
 * revoke action on pending ones. Never shows token hashes (the API omits them).
 */
export default function Invitations() {
    const [items, setItems] = useState<InvitationSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            setItems(await auth.listInvitations());
        } catch {
            setError('Could not load invitations.');
            setItems([]);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const revoke = async (id: string) => {
        try {
            await auth.revokeInvitation(id);
            await load();
        } catch {
            setError('Could not revoke that invitation.');
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Invitations' }} />
            <ScrollView contentContainerStyle={styles.body}>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {items === null ? (
                    <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
                ) : items.length === 0 ? (
                    <View style={styles.empty}>
                        <Ionicons name="mail-outline" size={26} color={colors.grey} />
                        <Text style={styles.emptyText}>No invitations yet.</Text>
                    </View>
                ) : (
                    items.map(inv => (
                        <Card key={inv.id} style={{ marginBottom: spacing.md }}>
                            <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.email}>{inv.email}</Text>
                                    <Text style={styles.meta}>{inv.role === 'admin' ? 'Admin' : 'Worker'}</Text>
                                </View>
                                <Text style={[styles.status, { color: TONE[inv.status] }]}>{inv.status}</Text>
                            </View>
                            {inv.status === 'pending' ? (
                                <Pressable style={styles.revoke} onPress={() => revoke(inv.id)}>
                                    <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                                    <Text style={styles.revokeText}>Revoke</Text>
                                </Pressable>
                            ) : null}
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
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 2 },
    status: { fontSize: typography.sizes.small, fontWeight: '700', textTransform: 'capitalize' },
    revoke: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.md, alignSelf: 'flex-start' },
    revokeText: { color: colors.danger, fontSize: typography.sizes.small, fontWeight: '600' },
    empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
    emptyText: { color: colors.grey, fontSize: typography.sizes.small },
});

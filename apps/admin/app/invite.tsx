import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';
import { Button, Card } from '@heyhomie/ui';

type InviteRole = 'admin' | 'worker';

/**
 * Invite Member (Build 23) — owner-only (the server enforces it via the token).
 * Produces a one-time invite token the owner shares with the new member out-of-band.
 * Tenant internals are never shown; only email + role + the opaque token.
 */
export default function InviteMember() {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<InviteRole>('worker');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await auth.invite(email.trim().toLowerCase(), role);
            setToken(res.inviteToken);
        } catch {
            setError('Could not create the invitation. Only the owner can invite, and the email must be new.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Stack.Screen options={{ headerShown: true, title: 'Invite member' }} />
            <View style={styles.body}>
                {token ? (
                    <Card variant="fill">
                        <Text style={styles.h2}>Invitation ready</Text>
                        <Text style={styles.sub}>Share this one-time code with {email}. It expires and can be used once.</Text>
                        <Text selectable style={styles.token}>{token}</Text>
                        <Button label="Invite another" variant="teal" style={{ marginTop: spacing.lg }} onPress={() => { setToken(null); setEmail(''); }} />
                    </Card>
                ) : (
                    <>
                        <Text style={styles.h1}>Invite a member</Text>
                        <Text style={styles.sub}>They join your team and see only your jobs.</Text>
                        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.grey} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
                        <Text style={styles.label}>Role</Text>
                        <View style={styles.roleRow}>
                            {(['worker', 'admin'] as InviteRole[]).map(r => (
                                <Pressable key={r} onPress={() => setRole(r)} style={[styles.role, role === r && styles.roleOn]}>
                                    <Ionicons name={r === 'admin' ? 'shield-outline' : 'briefcase-outline'} size={16} color={role === r ? colors.primary : colors.grey} />
                                    <Text style={[styles.roleText, role === r && styles.roleTextOn]}>{r === 'admin' ? 'Admin' : 'Worker'}</Text>
                                </Pressable>
                            ))}
                        </View>
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        <Button label={busy ? 'Creating...' : 'Create invitation'} variant="teal" disabled={busy || !email} style={{ marginTop: spacing.lg }} onPress={submit} />
                    </>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { flex: 1, justifyContent: 'center', padding: spacing.xl },
    h1: { fontSize: typography.sizes.h1, fontWeight: '700', color: colors.primary },
    h2: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    sub: { color: colors.grey, fontSize: typography.sizes.small, marginTop: spacing.xs, marginBottom: spacing.lg },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: typography.sizes.body, color: colors.primary, marginBottom: spacing.md },
    label: { color: colors.grey, fontSize: typography.sizes.small, marginBottom: spacing.sm },
    roleRow: { flexDirection: 'row', gap: spacing.md },
    role: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    roleOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    roleText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '600' },
    roleTextOn: { color: colors.primary },
    error: { color: colors.danger, fontSize: typography.sizes.small, marginTop: spacing.md },
    token: { fontSize: typography.sizes.body, fontWeight: '700', color: colors.primary, marginTop: spacing.md, padding: 12, backgroundColor: colors.white, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
});

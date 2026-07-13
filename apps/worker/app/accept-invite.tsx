import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { auth } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';
import { Button } from '@heyhomie/ui';

/**
 * Accept Invitation (Build 23). The invitee pastes the one-time code from their
 * owner and sets a password once; on success they are logged in as a member of
 * that tenant and land on their jobs. Email/role/tenant come from the invite —
 * never entered here (can't be spoofed).
 */
export default function AcceptInvite() {
    const router = useRouter();
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await auth.acceptInvite(code.trim(), password);
            router.replace('/');
        } catch {
            setError('This invitation is invalid, already used, or expired.');
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Stack.Screen options={{ headerShown: true, title: 'Accept invitation' }} />
            <View style={styles.body}>
                <Text style={styles.h1}>Join your team</Text>
                <Text style={styles.sub}>Paste the invite code you were given and choose a password.</Text>
                <TextInput style={styles.input} placeholder="Invitation code" placeholderTextColor={colors.grey} autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} />
                <TextInput style={styles.input} placeholder="Choose a password (min 8)" placeholderTextColor={colors.grey} secureTextEntry value={password} onChangeText={setPassword} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label={busy ? 'Joining...' : 'Accept & sign in'} variant="teal" disabled={busy || !code || password.length < 8} style={{ marginTop: spacing.lg }} onPress={submit} />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { flex: 1, justifyContent: 'center', padding: spacing.xl },
    h1: { fontSize: typography.sizes.h1, fontWeight: '700', color: colors.primary },
    sub: { color: colors.grey, fontSize: typography.sizes.small, marginTop: spacing.xs, marginBottom: spacing.xl },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: typography.sizes.body, color: colors.primary, marginBottom: spacing.md },
    error: { color: colors.danger, fontSize: typography.sizes.small, marginBottom: spacing.sm },
});

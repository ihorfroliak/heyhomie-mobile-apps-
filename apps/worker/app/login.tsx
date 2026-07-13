import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { auth } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';
import { Button } from '@heyhomie/ui';

/**
 * Worker login (Build 22). Same shared `auth` client as client/admin; worker
 * accounts are provisioned server-side. Role/tenant stay server-side — the app
 * only holds an opaque token and sees its tenant's jobs.
 */
export default function Login() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await auth.login(email.trim().toLowerCase(), password);
            router.replace('/');
        } catch {
            setError('Invalid email or password.');
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.body}>
                <Text style={styles.h1}>HeyHomie for Pros</Text>
                <Text style={styles.sub}>Sign in to see your jobs.</Text>
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.grey} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
                <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.grey} secureTextEntry value={password} onChangeText={setPassword} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label={busy ? 'Signing in...' : 'Sign in'} variant="teal" disabled={busy || !email || !password} style={{ marginTop: spacing.lg }} onPress={submit} />
                <Pressable onPress={() => router.push('/accept-invite')} style={styles.linkWrap}>
                    <Text style={styles.link}>Have an invitation? Accept it</Text>
                </Pressable>
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
    linkWrap: { marginTop: spacing.lg, alignItems: 'center' },
    link: { color: colors.blue, fontSize: typography.sizes.small },
});

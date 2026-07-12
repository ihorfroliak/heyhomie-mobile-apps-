import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { auth } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';
import { Button } from '@heyhomie/ui';

/**
 * Register screen (Build 21). Self-registration provisions a business account
 * (server creates a new tenant + admin). On success the app is authenticated,
 * so replace straight to the protected root.
 */
export default function Register() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await auth.register(email.trim().toLowerCase(), password);
            router.replace('/');
        } catch {
            setError('Could not create the account. The email may already be registered.');
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Stack.Screen options={{ headerShown: true, title: 'Create account' }} />
            <View style={styles.body}>
                <Text style={styles.h1}>Create your account</Text>
                <Text style={styles.sub}>Use at least 8 characters for your password.</Text>
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.grey} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
                <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.grey} secureTextEntry value={password} onChangeText={setPassword} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button label={busy ? 'Creating...' : 'Create account'} variant="teal" disabled={busy || !email || password.length < 8} style={{ marginTop: spacing.lg }} onPress={submit} />
                <Pressable onPress={() => router.replace('/login')} style={styles.linkWrap}>
                    <Text style={styles.link}>Already have an account? Sign in</Text>
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

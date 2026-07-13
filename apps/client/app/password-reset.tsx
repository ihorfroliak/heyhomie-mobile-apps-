import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { auth } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';
import { Button } from '@heyhomie/ui';

/**
 * Password reset (Build 24). Two steps in one screen: request a reset (the server
 * responds identically whether the email exists — no enumeration), then confirm
 * with the emailed code + a new password. A successful reset revokes every
 * session, so the user is sent back to login.
 */
export default function PasswordReset() {
    const router = useRouter();
    const [step, setStep] = useState<'request' | 'confirm'>('request');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const request = async () => {
        setBusy(true);
        setError(null);
        try {
            await auth.requestPasswordReset(email.trim().toLowerCase());
            setStep('confirm'); // identical outcome regardless of whether the email exists
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const confirm = async () => {
        setBusy(true);
        setError(null);
        try {
            await auth.confirmPasswordReset(code.trim(), password);
            router.replace('/login');
        } catch {
            setError('That reset code is invalid or expired.');
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Stack.Screen options={{ headerShown: true, title: 'Reset password' }} />
            <View style={styles.body}>
                {step === 'request' ? (
                    <>
                        <Text style={styles.h1}>Forgot your password?</Text>
                        <Text style={styles.sub}>Enter your email and we will send a reset code.</Text>
                        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.grey} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        <Button label={busy ? 'Sending...' : 'Send reset code'} variant="teal" disabled={busy || !email} style={{ marginTop: spacing.lg }} onPress={request} />
                    </>
                ) : (
                    <>
                        <Text style={styles.h1}>Enter your code</Text>
                        <Text style={styles.sub}>If an account exists for {email}, a reset code was sent. Enter it with a new password.</Text>
                        <TextInput style={styles.input} placeholder="Reset code" placeholderTextColor={colors.grey} autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} />
                        <TextInput style={styles.input} placeholder="New password (min 8)" placeholderTextColor={colors.grey} secureTextEntry value={password} onChangeText={setPassword} />
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        <Button label={busy ? 'Resetting...' : 'Reset password'} variant="teal" disabled={busy || !code || password.length < 8} style={{ marginTop: spacing.lg }} onPress={confirm} />
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
    sub: { color: colors.grey, fontSize: typography.sizes.small, marginTop: spacing.xs, marginBottom: spacing.xl },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: typography.sizes.body, color: colors.primary, marginBottom: spacing.md },
    error: { color: colors.danger, fontSize: typography.sizes.small, marginBottom: spacing.sm },
});

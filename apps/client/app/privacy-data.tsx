import React, { useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { makeDataRequest, type DataRequestType } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const USER_ID = 'c1'; // demo

export default function PrivacyData() {
    const [message, setMessage] = useState<string | null>(null);
    const [confirmErase, setConfirmErase] = useState(false);

    const submit = (type: DataRequestType) => {
        const req = makeDataRequest(type, USER_ID);
        // When live: POST this to the backend (GDPR/RODO request log).
        if (type === 'export') setMessage("We received your request. We'll email a copy of your data within 30 days.");
        if (type === 'erasure') setMessage('Your account is scheduled for deletion. You will receive a confirmation.');
        void req;
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Privacy & data' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.intro}>Under the GDPR / RODO you can access, export or delete your personal data at any time.</Text>

                <Card style={styles.card}>
                    <Text style={styles.title}>Export my data</Text>
                    <Text style={styles.meta}>Get a copy of your account, orders and missions.</Text>
                    <Button label="Request data export" variant="ghost" style={{ marginTop: spacing.md }} onPress={() => submit('export')} />
                </Card>

                <Card style={styles.card}>
                    <Text style={[styles.title, { color: colors.danger }]}>Delete my account</Text>
                    <Text style={styles.meta}>Permanently erase your account and personal data (right to erasure). This cannot be undone.</Text>
                    {!confirmErase ? (
                        <Button label="Delete account" variant="ghost" style={[styles.danger, { marginTop: spacing.md }]} onPress={() => setConfirmErase(true)} />
                    ) : (
                        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                            <Text style={styles.confirm}>Are you sure? This is permanent.</Text>
                            <Button label="Yes, delete my account" variant="ghost" style={styles.danger} onPress={() => submit('erasure')} />
                            <Button label="Cancel" variant="ghost" onPress={() => setConfirmErase(false)} />
                        </View>
                    )}
                </Card>

                {message ? (
                    <Card variant="fill" style={{ marginTop: spacing.md }}>
                        <Text style={styles.ok}>{message}</Text>
                    </Card>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    intro: { color: colors.grey, fontSize: typography.sizes.small, marginBottom: spacing.lg },
    card: { marginBottom: spacing.md },
    title: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.body },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 4 },
    danger: { borderColor: colors.danger },
    confirm: { color: colors.danger, fontSize: typography.sizes.small },
    ok: { color: colors.success, fontSize: typography.sizes.small },
});

import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { recordConsent, hasRequiredConsents } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Button } from '@heyhomie/ui';

const VERSION = '2025-07-01';

function Check({ label, value, onToggle, required }: { label: string; value: boolean; onToggle: () => void; required?: boolean }) {
    return (
        <Pressable style={styles.row} onPress={onToggle}>
            <View style={[styles.box, value && styles.boxOn]}>{value ? <Text style={styles.tick}>✓</Text> : null}</View>
            <Text style={styles.label}>
                {label}
                {required ? <Text style={{ color: colors.pink }}> *</Text> : null}
            </Text>
        </Pressable>
    );
}

export default function Consent() {
    const router = useRouter();
    const [terms, setTerms] = useState(false);
    const [privacy, setPrivacy] = useState(false);
    const [marketing, setMarketing] = useState(false);

    const records = [recordConsent('terms', terms, VERSION), recordConsent('privacy', privacy, VERSION), recordConsent('marketing', marketing, VERSION)];
    const canContinue = hasRequiredConsents(records);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Before you start' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.intro}>Please review and accept to continue. Required items are marked with *.</Text>

                <Check label="I accept the Terms of Service" value={terms} onToggle={() => setTerms(v => !v)} required />
                <Check label="I have read the Privacy Policy" value={privacy} onToggle={() => setPrivacy(v => !v)} required />
                <Check label="Send me offers and tips (optional)" value={marketing} onToggle={() => setMarketing(v => !v)} />

                <Button label="Continue" variant="teal" disabled={!canContinue} style={{ marginTop: spacing.xl }} onPress={() => router.back()} />
                <Text style={styles.note}>You can change marketing preferences anytime in Profile → Privacy &amp; data.</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    intro: { color: colors.grey, fontSize: typography.sizes.small, marginBottom: spacing.lg },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12 },
    box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    boxOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    tick: { color: colors.primary, fontWeight: '700' },
    label: { flex: 1, color: colors.primary, fontSize: typography.sizes.small },
    note: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: spacing.md, textAlign: 'center' },
});

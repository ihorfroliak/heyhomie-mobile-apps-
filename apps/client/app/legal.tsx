import React, { useState } from 'react';
import { ScrollView, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const DOCS = [
    {
        key: 'privacy',
        title: 'Privacy Policy',
        summary: 'How we collect, use and protect your data, your GDPR / RODO rights, and how to contact us.',
    },
    {
        key: 'terms',
        title: 'Terms of Service',
        summary: 'The rules for booking, missions, pricing, cancellation and our responsibilities.',
    },
];

export default function Legal() {
    const [open, setOpen] = useState<string | null>(null);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Legal' }} />
            <ScrollView contentContainerStyle={styles.body}>
                {DOCS.map(d => (
                    <Pressable key={d.key} onPress={() => setOpen(open === d.key ? null : d.key)}>
                        <Card style={styles.card}>
                            <Text style={styles.title}>{d.title}</Text>
                            <Text style={styles.summary}>{d.summary}</Text>
                            {open === d.key ? <Text style={styles.full}>The full, current version is available in the app store listing and at heyhomie.io/{d.key}.</Text> : null}
                        </Card>
                    </Pressable>
                ))}
                <Text style={styles.note}>Available in Polish, English and Ukrainian.</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    card: { marginBottom: spacing.md },
    title: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.body },
    summary: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 4 },
    full: { color: colors.primary, fontSize: typography.sizes.small, marginTop: spacing.sm },
    note: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: spacing.sm },
});

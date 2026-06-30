import React from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, useLocale, useSetLocale } from '@heyhomie/ui';
import type { Locale } from '@heyhomie/domain';

const rows = ['Addresses', 'Payment methods', 'Terms & privacy', 'Log out'];
const languages: { key: Locale; label: string }[] = [
    { key: 'pl', label: 'Polski' },
    { key: 'en', label: 'English' },
    { key: 'uk', label: 'Українська' },
];

export default function Profile() {
    const locale = useLocale();
    const setLocale = useSetLocale();

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Profile</Text>
                <Card variant="fill" style={{ marginBottom: spacing.lg, alignItems: 'center' }}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>MR</Text>
                    </View>
                    <Text style={styles.name}>Marek Rutkowski</Text>
                    <Text style={styles.meta}>+48 600 000 000</Text>
                </Card>

                <Text style={styles.section}>Language</Text>
                <View style={styles.langRow}>
                    {languages.map(l => (
                        <Pressable key={l.key} onPress={() => setLocale(l.key)} style={[styles.lang, locale === l.key && styles.langOn]}>
                            <Text style={[styles.langText, locale === l.key && styles.langTextOn]}>{l.label}</Text>
                        </Pressable>
                    ))}
                </View>

                {rows.map(r => (
                    <Text key={r} style={[styles.row, r === 'Log out' && { color: colors.danger }]}>
                        {r}
                    </Text>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 20 },
    name: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, marginTop: spacing.sm },
    meta: { color: colors.grey, fontSize: typography.sizes.small },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginBottom: spacing.sm },
    langRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    lang: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    langOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    langText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '500' },
    langTextOn: { color: colors.primary },
    row: { fontSize: typography.sizes.body, color: colors.primary, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
});

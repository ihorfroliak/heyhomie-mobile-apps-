import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const services = ['Cleaning', 'Windows', 'Upholstery'];
const langs = ['Polski', 'Українська', 'English'];

export default function Profile() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Profile</Text>
                <Card variant="fill" style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>OL</Text>
                    </View>
                    <Text style={styles.name}>Olena Kovalenko</Text>
                    <View style={styles.verifiedRow}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        <Text style={styles.verified}>Verified homie</Text>
                    </View>
                </Card>
                <View style={styles.statsRow}>
                    <Stat value="4.9" label="rating" />
                    <Stat value="128" label="missions" />
                    <Stat value="2024" label="since" />
                </View>
                <Text style={styles.section}>Services</Text>
                <Tags items={services} />
                <Text style={styles.section}>Languages</Text>
                <Tags items={langs} />
            </ScrollView>
        </SafeAreaView>
    );
}

const Stat = ({ value, label }: { value: string; label: string }) => (
    <View style={styles.stat}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

const Tags = ({ items }: { items: string[] }) => (
    <View style={styles.tags}>
        {items.map(t => (
            <Text key={t} style={styles.tag}>
                {t}
            </Text>
        ))}
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 20 },
    name: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, marginTop: spacing.sm },
    verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    verified: { color: colors.success, fontWeight: '600', fontSize: typography.sizes.small },
    statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
    stat: { flex: 1, alignItems: 'center', backgroundColor: colors.bgLight, borderRadius: 12, paddingVertical: spacing.md },
    statValue: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.h3 },
    statLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: { backgroundColor: colors.bgLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, fontSize: typography.sizes.small, color: colors.primary },
});

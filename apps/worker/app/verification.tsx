import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

type StepState = 'done' | 'current';
const steps: { label: string; sub: string; state: StepState }[] = [
    { label: 'Personal details', sub: 'Completed', state: 'done' },
    { label: 'Documents uploaded', sub: 'ID & address confirmed', state: 'done' },
    { label: 'Background check', sub: 'In review by our team', state: 'current' },
];

export default function Verification() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Verification' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Card variant="fill" style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                    <Text style={styles.pending}>⏳ Verification in review</Text>
                    <Text style={styles.note}>We'll notify you within 24 hours.</Text>
                </Card>

                <Text style={styles.section}>Your steps</Text>
                {steps.map((s, i) => (
                    <View key={s.label} style={styles.step}>
                        <View style={[styles.dot, s.state === 'done' ? styles.dotDone : styles.dotCurrent]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>{s.label}</Text>
                            <Text style={styles.sub}>{s.sub}</Text>
                        </View>
                    </View>
                ))}

                <Button label="Start accepting missions" variant="primary" disabled style={{ marginTop: spacing.lg }} onPress={() => {}} />
                <Text style={styles.foot}>Meanwhile you can set your availability in the Schedule tab.</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    pending: { color: colors.warning, fontWeight: '700', fontSize: typography.sizes.body },
    note: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 6 },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginBottom: spacing.sm },
    step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    dot: { width: 14, height: 14, borderRadius: 7, marginRight: spacing.md },
    dotDone: { backgroundColor: colors.salad },
    dotCurrent: { backgroundColor: colors.warning },
    label: { fontWeight: '500', color: colors.primary, fontSize: typography.sizes.small },
    sub: { color: colors.grey, fontSize: typography.sizes.caption },
    foot: { color: colors.grey, fontSize: typography.sizes.caption, textAlign: 'center', marginTop: spacing.md },
});

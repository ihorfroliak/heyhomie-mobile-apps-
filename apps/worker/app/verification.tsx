import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { recordConsent, hasRequiredConsents } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const VERSION = '2025-07-01';

type StepState = 'done' | 'current';
const steps: { label: string; sub: string; state: StepState }[] = [
    { label: 'Personal details', sub: 'Completed', state: 'done' },
    { label: 'Documents uploaded', sub: 'ID & address confirmed', state: 'done' },
    { label: 'Background check', sub: 'In review by our team', state: 'current' },
];

function Check({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
    return (
        <Pressable style={styles.check} onPress={onToggle}>
            <View style={[styles.box, value && styles.boxOn]}>{value ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}</View>
            <Text style={styles.checkLabel}>
                {label}
                <Text style={{ color: colors.pink }}> *</Text>
            </Text>
        </Pressable>
    );
}

export default function Verification() {
    const [terms, setTerms] = useState(false);
    const [privacy, setPrivacy] = useState(false);
    const consented = hasRequiredConsents([recordConsent('terms', terms, VERSION), recordConsent('privacy', privacy, VERSION)]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Verification' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Card variant="fill" style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                    <View style={styles.pendingRow}>
                        <Ionicons name="time-outline" size={16} color={colors.warning} />
                        <Text style={styles.pending}>Verification in review</Text>
                    </View>
                    <Text style={styles.note}>We'll notify you within 24 hours.</Text>
                </Card>

                <View style={styles.sectionRow}>
                    <Ionicons name="list-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Your steps</Text>
                </View>
                {steps.map(s => (
                    <View key={s.label} style={styles.step}>
                        <View style={[styles.dot, s.state === 'done' ? styles.dotDone : styles.dotCurrent]}>
                            {s.state === 'done' ? <Ionicons name="checkmark" size={9} color={colors.primary} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>{s.label}</Text>
                            <Text style={styles.sub}>{s.sub}</Text>
                        </View>
                    </View>
                ))}

                <View style={styles.sectionRow}>
                    <Ionicons name="document-text-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Agreements</Text>
                </View>
                <Check label="I accept the Homie Terms" value={terms} onToggle={() => setTerms(v => !v)} />
                <Check label="I have read the Privacy Policy" value={privacy} onToggle={() => setPrivacy(v => !v)} />

                <Button label="Start accepting missions" variant="primary" disabled={!consented} style={{ marginTop: spacing.lg }} onPress={() => {}} />
                <Text style={styles.foot}>
                    {consented ? 'Approval pending — you can already set your availability in Schedule.' : 'Accept both agreements to continue.'}
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pending: { color: colors.warning, fontWeight: '700', fontSize: typography.sizes.body },
    note: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 6 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    dot: { width: 14, height: 14, borderRadius: 7, marginRight: spacing.md, alignItems: 'center', justifyContent: 'center' },
    dotDone: { backgroundColor: colors.salad },
    dotCurrent: { backgroundColor: colors.warning },
    label: { fontWeight: '500', color: colors.primary, fontSize: typography.sizes.small },
    sub: { color: colors.grey, fontSize: typography.sizes.caption },
    check: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
    box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    boxOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    checkLabel: { flex: 1, color: colors.primary, fontSize: typography.sizes.small },
    foot: { color: colors.grey, fontSize: typography.sizes.caption, textAlign: 'center', marginTop: spacing.md },
});

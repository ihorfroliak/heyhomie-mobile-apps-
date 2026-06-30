import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const flagged = [{ id: '#1033', stars: 2, text: 'Floor not cleaned', photos: 2, homie: 'Roman B.' }];
const lowRatings = [{ id: '#1031', stars: 3, text: 'Came late.', client: 'Anna', city: 'warsaw' }];

const Stars = ({ n }: { n: number }) => (
    <Text style={styles.stars}>
        {'★'.repeat(n)}
        <Text style={{ color: colors.border }}>{'★'.repeat(5 - n)}</Text>
    </Text>
);

export default function Quality() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Quality' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.section}>Flagged — photo reports</Text>
                {flagged.map(f => (
                    <Card key={f.id} style={[styles.card, { borderColor: colors.danger, borderWidth: 1 }]}>
                        <View style={styles.row}>
                            <Stars n={f.stars} />
                            <Text style={styles.id}>{f.id}</Text>
                        </View>
                        <Text style={styles.text}>"{f.text}" · {f.homie}</Text>
                        <View style={styles.tiles}>
                            {Array.from({ length: f.photos }).map((_, i) => (
                                <View key={i} style={styles.tile}>
                                    <Text style={styles.tileText}>🖼</Text>
                                </View>
                            ))}
                        </View>
                        <View style={styles.actions}>
                            <Button label="Contact client" variant="ghost" style={styles.act} onPress={() => {}} />
                            <Button label="Review homie" variant="ghost" style={styles.act} onPress={() => {}} />
                        </View>
                    </Card>
                ))}

                <Text style={styles.section}>Low ratings</Text>
                {lowRatings.map(r => (
                    <Card key={r.id} style={styles.card}>
                        <View style={styles.row}>
                            <Stars n={r.stars} />
                            <Text style={styles.id}>{r.id}</Text>
                        </View>
                        <Text style={styles.text}>
                            "{r.text}" — {r.client} · {r.city}
                        </Text>
                    </Card>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.md, marginBottom: spacing.sm },
    card: { marginBottom: spacing.md },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stars: { color: colors.warning, fontSize: typography.sizes.body },
    id: { color: colors.grey, fontSize: typography.sizes.caption },
    text: { color: colors.primary, fontSize: typography.sizes.small, marginTop: 6 },
    tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    tile: { width: 56, height: 48, borderRadius: 8, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center' },
    tileText: { fontSize: 18 },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    act: { flex: 1, height: 38 },
});

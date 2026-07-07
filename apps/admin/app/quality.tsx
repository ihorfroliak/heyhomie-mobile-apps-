import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const flagged = [{ id: '#1033', stars: 2, text: 'Floor not cleaned', photos: 2, homie: 'Roman B.' }];
const lowRatings = [{ id: '#1031', stars: 3, text: 'Came late.', client: 'Anna', city: 'warsaw' }];

const Stars = ({ n }: { n: number }) => (
    <View style={styles.starsRow}>
        {[0, 1, 2, 3, 4].map(i => (
            <Ionicons key={i} name="star" size={14} color={i < n ? colors.warning : colors.border} />
        ))}
    </View>
);

export default function Quality() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Quality' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.sectionRow}>
                    <Ionicons name="flag-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Flagged — photo reports</Text>
                </View>
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
                                    <Ionicons name="image-outline" size={20} color={colors.grey} />
                                </View>
                            ))}
                        </View>
                        <View style={styles.actions}>
                            <Button label="Contact client" variant="ghost" style={styles.act} onPress={() => {}} />
                            <Button label="Review homie" variant="ghost" style={styles.act} onPress={() => {}} />
                        </View>
                    </Card>
                ))}

                <View style={styles.sectionRow}>
                    <Ionicons name="star-half-outline" size={14} color={colors.grey} />
                    <Text style={styles.sectionText}>Low ratings</Text>
                </View>
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
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.md, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    card: { marginBottom: spacing.md },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    starsRow: { flexDirection: 'row', gap: 1 },
    id: { color: colors.grey, fontSize: typography.sizes.caption },
    text: { color: colors.primary, fontSize: typography.sizes.small, marginTop: 6 },
    tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    tile: { width: 56, height: 48, borderRadius: 8, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center' },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    act: { flex: 1, height: 38 },
});

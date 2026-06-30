import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { demoMissions } from '@heyhomie/api';
import { type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const locale: Locale = 'en';

export default function Rate() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const mission = demoMissions.find(m => m.id === id) ?? demoMissions[0];

    const [stars, setStars] = useState(0);
    const [photos, setPhotos] = useState(0);
    const [comment, setComment] = useState('');

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Rate your cleaning' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Card variant="fill" style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                    <Text style={styles.name}>{mission.homie?.firstName ?? 'Your homie'}</Text>
                    <Text style={styles.meta}>
                        {mission.plan === 'general' ? 'General' : 'Standard'} cleaning · {mission.scheduledAt.slice(0, 10)}
                    </Text>
                </Card>

                <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map(n => (
                        <Pressable key={n} onPress={() => setStars(n)}>
                            <Text style={[styles.star, n <= stars && styles.starOn]}>★</Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={styles.section}>Something done wrong? Add photos</Text>
                <View style={styles.tiles}>
                    {[0, 1, 2].map(i => (
                        <Pressable key={i} style={styles.tile} onPress={() => setPhotos(p => Math.min(3, p + 1))}>
                            <Text style={styles.tilePlus}>{i < photos ? '🖼' : '+'}</Text>
                        </Pressable>
                    ))}
                </View>

                <TextInput
                    style={styles.input}
                    placeholder="Leave a comment…"
                    placeholderTextColor={colors.grey}
                    value={comment}
                    onChangeText={setComment}
                    multiline
                />

                <Button
                    label="Submit review"
                    variant="teal"
                    disabled={stars === 0}
                    style={{ marginTop: spacing.lg }}
                    onPress={() => router.back()}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    name: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 2 },
    stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: spacing.md },
    star: { fontSize: 40, color: colors.border },
    starOn: { color: colors.warning },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    tiles: { flexDirection: 'row', gap: spacing.md },
    tile: { flex: 1, height: 64, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
    tilePlus: { fontSize: 22, color: colors.grey },
    input: { marginTop: spacing.lg, minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.primary, textAlignVertical: 'top' },
});

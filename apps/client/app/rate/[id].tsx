import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoMissions } from '@heyhomie/api';
import { tipPresets, isValidTip, formatMoney, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const locale: Locale = 'en';
const money = (n: number) => formatMoney(n, 'PLN', locale);

export default function Rate() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const mission = demoMissions.find(m => m.id === id) ?? demoMissions[0];

    const [stars, setStars] = useState(0);
    const [photos, setPhotos] = useState(0);
    const [comment, setComment] = useState('');

    // Tip — optional, 100% to the homie. Presets are % of the order price.
    const presets = tipPresets(mission.price);
    const [tip, setTip] = useState(0);
    const [customOpen, setCustomOpen] = useState(false);
    const [customText, setCustomText] = useState('');
    const customAmount = Number(customText.replace(',', '.'));
    const customValid = customText.length > 0 && isValidTip(customAmount, mission.price) && customAmount > 0;
    const effectiveTip = customOpen ? (customValid ? customAmount : 0) : tip;

    const choosePreset = (amount: number) => {
        setCustomOpen(false);
        setTip(amount);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Rate your cleaning' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Card variant="fill" style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(mission.homie?.firstName ?? 'H').slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.name}>{mission.homie?.firstName ?? 'Your homie'}</Text>
                    <Text style={styles.meta}>
                        {mission.plan === 'general' ? 'General' : 'Standard'} cleaning · {mission.scheduledAt.slice(0, 10)}
                    </Text>
                </Card>

                <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map(n => (
                        <Pressable key={n} onPress={() => setStars(n)}>
                            <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={34} color={n <= stars ? colors.warning : colors.border} />
                        </Pressable>
                    ))}
                </View>

                <Text style={styles.section}>Something done wrong? Add photos</Text>
                <View style={styles.tiles}>
                    {[0, 1, 2].map(i => (
                        <Pressable key={i} style={styles.tile} onPress={() => setPhotos(p => Math.min(3, p + 1))}>
                            <Ionicons name={i < photos ? 'image' : 'add'} size={22} color={i < photos ? colors.blue : colors.grey} />
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

                <Text style={styles.section}>Leave a tip? 100% goes to {mission.homie?.firstName ?? 'your homie'}</Text>
                <View style={styles.tipRow}>
                    <Pressable
                        style={[styles.tipChip, !customOpen && tip === 0 && styles.tipChipOn]}
                        onPress={() => choosePreset(0)}
                    >
                        <Text style={[styles.tipChipText, !customOpen && tip === 0 && styles.tipChipTextOn]}>No tip</Text>
                    </Pressable>
                    {presets.map(p => {
                        const on = !customOpen && tip === p.amount && p.amount > 0;
                        return (
                            <Pressable key={p.percent} style={[styles.tipChip, on && styles.tipChipOn]} onPress={() => choosePreset(p.amount)}>
                                <Text style={[styles.tipChipText, on && styles.tipChipTextOn]}>{p.percent}%</Text>
                                <Text style={[styles.tipChipSub, on && styles.tipChipTextOn]}>{money(p.amount)}</Text>
                            </Pressable>
                        );
                    })}
                    <Pressable style={[styles.tipChip, customOpen && styles.tipChipOn]} onPress={() => setCustomOpen(true)}>
                        <Text style={[styles.tipChipText, customOpen && styles.tipChipTextOn]}>Custom</Text>
                    </Pressable>
                </View>
                {customOpen ? (
                    <TextInput
                        style={styles.tipInput}
                        placeholder="Amount in zł"
                        placeholderTextColor={colors.grey}
                        value={customText}
                        onChangeText={setCustomText}
                        keyboardType="numeric"
                    />
                ) : null}
                {effectiveTip > 0 ? (
                    <View style={styles.tipConfirmRow}>
                        <Ionicons name="heart" size={13} color={colors.success} />
                        <Text style={styles.tipConfirm}>Tip: {money(effectiveTip)}</Text>
                    </View>
                ) : null}

                <Button
                    label={effectiveTip > 0 ? `Submit review + ${money(effectiveTip)} tip` : 'Submit review'}
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
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 15 },
    name: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 2 },
    stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: spacing.md },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    tiles: { flexDirection: 'row', gap: spacing.md },
    tile: { flex: 1, height: 64, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
    input: { marginTop: spacing.lg, minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.primary, textAlignVertical: 'top' },
    tipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tipChip: { minWidth: 64, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    tipChipOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    tipChipText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '600' },
    tipChipTextOn: { color: colors.primary },
    tipChipSub: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 1 },
    tipInput: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, color: colors.primary },
    tipConfirmRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.md },
    tipConfirm: { color: colors.success, fontWeight: '700', fontSize: typography.sizes.small },
});

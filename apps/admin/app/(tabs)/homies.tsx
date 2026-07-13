import React from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { homies } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';

const API_URL = process.env.EXPO_PUBLIC_ORDERS_API_URL;

export default function Homies() {
    const router = useRouter();
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.headRow}>
                    <Text style={styles.h1}>Homies</Text>
                    {API_URL ? (
                        <Pressable style={styles.invite} onPress={() => router.push('/invite')}>
                            <Ionicons name="person-add-outline" size={15} color={colors.primary} />
                            <Text style={styles.inviteText}>Invite</Text>
                        </Pressable>
                    ) : null}
                </View>
                {homies.map(h => (
                    <View key={h.id} style={styles.row}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{h.firstName.slice(0, 1)}{h.lastInitial ?? ''}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.name}>
                                {h.firstName} {h.lastInitial ? `${h.lastInitial}.` : ''}
                            </Text>
                            <Text style={styles.meta}>
                                {h.city} · {h.services.join(', ')} · {h.workerType === 'b2b' ? 'B2B (contractor)' : 'Employee'}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <View style={styles.verifiedRow}>
                                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                                <Text style={styles.verified}>Verified</Text>
                            </View>
                            <View style={styles.ratingRow}>
                                <Ionicons name="star" size={11} color={colors.warning} />
                                <Text style={styles.rating}>{h.rating?.toFixed(1)}</Text>
                            </View>
                        </View>
                    </View>
                ))}
                <View style={styles.row}>
                    <View style={[styles.avatar, { backgroundColor: colors.warning }]}>
                        <Text style={styles.avatarText}>SP</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.name}>Sofia P.</Text>
                        <Text style={styles.meta}>krakow · new</Text>
                    </View>
                    <Text style={[styles.verified, { color: colors.warning }]}>Pending</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
    invite: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.salad, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    inviteText: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 12 },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
    verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    verified: { color: colors.success, fontSize: typography.sizes.caption, fontWeight: '600' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    rating: { color: colors.grey, fontSize: typography.sizes.caption },
});

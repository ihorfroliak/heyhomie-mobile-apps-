import React from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { homies } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';

export default function Homies() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Homies</Text>
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
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
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

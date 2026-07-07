import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { colors, spacing, typography, radii } from '@heyhomie/design';
import { formatDuration, formatMoney, type Mission, type Locale } from '@heyhomie/domain';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const dmy = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });

interface Props {
    mission: Mission;
    locale?: Locale;
    onPress?: () => void;
    showHomie?: boolean;
    /** Hide the price — the worker app shows time, not money. */
    showPrice?: boolean;
}

/** Reusable mission summary, shared across Home, Activity and detail screens. */
export function MissionCard({ mission, locale = 'en', onPress, showHomie = true, showPrice = true }: Props) {
    const homie = mission.homie;
    const initials = homie ? homie.firstName.slice(0, 2).toUpperCase() : undefined;

    return (
        <Pressable onPress={onPress} style={{ marginBottom: spacing.md }}>
            <Card>
                <View style={styles.headRow}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                        <Text style={styles.title}>
                            {mission.plan === 'general' ? 'General' : 'Standard'} cleaning · {formatDuration(mission.durationMinutes)}
                        </Text>
                        <View style={styles.metaRow}>
                            <Ionicons name="calendar-outline" size={13} color={colors.grey} />
                            <Text style={styles.meta}>{dmy(mission.scheduledAt)} · {hhmm(mission.scheduledAt)}</Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Ionicons name="location-outline" size={13} color={colors.grey} />
                            <Text style={styles.meta} numberOfLines={1}>{mission.address.line1}</Text>
                        </View>
                    </View>
                    <StatusBadge status={mission.status} locale={locale} />
                </View>

                {showHomie && homie ? (
                    <View style={styles.homieRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{initials}</Text>
                        </View>
                        <Text style={styles.homieName}>{homie.firstName}</Text>
                        {homie.rating ? (
                            <View style={styles.ratingRow}>
                                <Ionicons name="star" size={12} color={colors.warning} />
                                <Text style={styles.ratingText}>{homie.rating.toFixed(1)}</Text>
                            </View>
                        ) : null}
                        {showPrice ? <Text style={styles.price}>{formatMoney(mission.price, mission.currency, locale)}</Text> : null}
                    </View>
                ) : showPrice ? (
                    <Text style={[styles.price, { marginTop: spacing.sm }]}>{formatMoney(mission.price, mission.currency, locale)}</Text>
                ) : null}
            </Card>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    meta: { color: colors.grey, fontSize: typography.sizes.small, flexShrink: 1 },
    homieRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontSize: 11, fontWeight: '700' },
    homieName: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    ratingText: { color: colors.grey, fontSize: typography.sizes.caption, fontWeight: '600' },
    price: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.small, marginLeft: 'auto' },
});

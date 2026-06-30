import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { colors, spacing, typography } from '@heyhomie/design';
import { formatDuration, formatMoney, type Mission, type Locale } from '@heyhomie/domain';

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const dmy = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });

interface Props {
    mission: Mission;
    locale?: Locale;
    onPress?: () => void;
    showHomie?: boolean;
}

/** Reusable mission summary, shared across Home, Activity and detail screens. */
export function MissionCard({ mission, locale = 'en', onPress, showHomie = true }: Props) {
    return (
        <Pressable onPress={onPress} style={{ marginBottom: spacing.md }}>
            <Card>
                <StatusBadge status={mission.status} locale={locale} />
                <Text style={styles.title}>
                    {mission.plan === 'general' ? 'General' : 'Standard'} cleaning · {formatDuration(mission.durationMinutes)}
                </Text>
                <Text style={styles.meta}>
                    {dmy(mission.scheduledAt)} · {hhmm(mission.scheduledAt)} · {mission.address.line1}
                </Text>
                {showHomie && mission.homie ? <Text style={styles.meta}>Homie: {mission.homie.firstName}</Text> : null}
                <Text style={styles.price}>{formatMoney(mission.price, mission.currency, locale)}</Text>
            </Card>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, marginTop: spacing.sm },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 2 },
    price: { color: colors.primary, fontWeight: '600', marginTop: spacing.sm },
});

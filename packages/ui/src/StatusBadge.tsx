import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii } from '@heyhomie/design';
import { missionStatusLabel, tr, type MissionStatus, type Locale } from '@heyhomie/domain';

interface Props {
    status: MissionStatus;
    locale?: Locale;
}

/** Coloured pill showing a localized mission status. */
export function StatusBadge({ status, locale = 'en' }: Props) {
    const color = colors.status[status] ?? colors.grey;
    return (
        <View style={[styles.badge, { backgroundColor: `${color}1A` }]}>
            <Text style={[styles.text, { color }]}>{tr(missionStatusLabel[status], locale)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
    text: { fontSize: 11, fontWeight: '600' },
});

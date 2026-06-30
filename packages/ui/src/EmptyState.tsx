import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@heyhomie/design';

interface Props {
    title: string;
    subtitle?: string;
}

/** Friendly placeholder for empty lists / no-data screens. */
export function EmptyState({ title, subtitle }: Props) {
    return (
        <View style={styles.wrap}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: spacing.xxl },
    title: { fontSize: typography.sizes.body, fontWeight: '500', color: colors.primary, textAlign: 'center' },
    subtitle: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.sm, textAlign: 'center' },
});

import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radii, spacing, shadow } from '@heyhomie/design';

interface Props {
    children: React.ReactNode;
    /** `fill` = light surface (no shadow); default = white raised card. */
    variant?: 'raised' | 'fill';
    style?: ViewStyle;
}

export function Card({ children, variant = 'raised', style }: Props) {
    return <View style={[styles.base, variant === 'fill' ? styles.fill : styles.raised, style]}>{children}</View>;
}

const styles = StyleSheet.create({
    base: { borderRadius: radii.lg, padding: spacing.lg },
    raised: { backgroundColor: colors.white, ...shadow.card },
    fill: { backgroundColor: colors.bgLight },
});

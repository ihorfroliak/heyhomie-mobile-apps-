import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '@heyhomie/design';

interface Option {
    key: string;
    label: string;
}

interface Props {
    options: Option[];
    value: string;
    onChange: (key: string) => void;
}

/** iOS-style segmented control (e.g. Orders / Services tabs). */
export function Segmented({ options, value, onChange }: Props) {
    return (
        <View style={styles.wrap}>
            {options.map(o => {
                const active = o.key === value;
                return (
                    <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.seg, active && styles.active]}>
                        <Text style={[styles.text, active && styles.textActive]}>{o.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { flexDirection: 'row', backgroundColor: colors.bgLight, borderRadius: radii.md, padding: 3 },
    seg: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radii.sm },
    active: { backgroundColor: colors.white },
    text: { fontSize: 13, fontWeight: '500', color: colors.grey },
    textActive: { color: colors.primary },
});

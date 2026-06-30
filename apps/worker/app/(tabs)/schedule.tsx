import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

interface Day {
    key: string;
    label: string;
    hours: string;
    on: boolean;
    committed?: string;
}

const initial: Day[] = [
    { key: 'mon', label: 'Mon', hours: '8:00–18:00', on: true, committed: 'Marek · 10:00' },
    { key: 'tue', label: 'Tue', hours: '8:00–18:00', on: true },
    { key: 'wed', label: 'Wed', hours: 'Day off', on: false },
    { key: 'thu', label: 'Thu', hours: '10:00–16:00', on: true },
    { key: 'fri', label: 'Fri', hours: '8:00–18:00', on: true },
    { key: 'sat', label: 'Sat', hours: '9:00–14:00', on: true },
    { key: 'sun', label: 'Sun', hours: 'Day off', on: false },
];

export default function Schedule() {
    const [days, setDays] = useState<Day[]>(initial);
    const toggle = (key: string) => setDays(ds => ds.map(d => (d.key === key ? { ...d, on: !d.on } : d)));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h1}>Schedule</Text>
                <Text style={styles.sub}>Your weekly availability</Text>
                {days.map(d => (
                    <View key={d.key} style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.day}>
                                {d.label} <Text style={styles.hours}>{d.on ? d.hours : 'Day off'}</Text>
                            </Text>
                            {d.committed ? <Text style={styles.committed}>{d.committed}</Text> : null}
                        </View>
                        <Pressable onPress={() => toggle(d.key)} style={[styles.switch, d.on && styles.switchOn]}>
                            <View style={[styles.knob, d.on && styles.knobOn]} />
                        </Pressable>
                    </View>
                ))}
                <Card variant="fill" style={{ marginTop: spacing.lg }}>
                    <Text style={styles.note}>Recurring clients are auto-booked into your free slots.</Text>
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: 4 },
    sub: { color: colors.grey, fontSize: typography.sizes.small, marginBottom: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    day: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    hours: { fontWeight: '400', color: colors.grey },
    committed: { color: colors.blue, fontSize: typography.sizes.caption, marginTop: 2 },
    switch: { width: 44, height: 26, borderRadius: 20, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
    switchOn: { backgroundColor: colors.salad },
    knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
    knobOn: { alignSelf: 'flex-end' },
    note: { color: colors.grey, fontSize: typography.sizes.small },
});

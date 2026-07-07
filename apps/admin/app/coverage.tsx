import React, { useState } from 'react';
import { ScrollView, Text, View, Pressable, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoAvailability } from '@heyhomie/api';
import {
    SERVICES,
    SERVICE_IDS,
    cityName,
    serviceName,
    availableServices,
    coverageStats,
    setCityEnabled,
    setServiceEnabled,
    type AvailabilityMap,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const locale: Locale = 'en';

export default function Coverage() {
    // Local mock state — swap to API mutations (PUT /admin/coverage) when the backend is wired.
    const [map, setMap] = useState<AvailabilityMap>(demoAvailability);
    const [expanded, setExpanded] = useState<string | null>('krakow');
    const stats = coverageStats(map, SERVICE_IDS.length);

    const toggleCity = (cityId: string, next: boolean) => setMap(prev => setCityEnabled(prev, cityId, next));
    const toggleService = (cityId: string, serviceId: string, next: boolean) =>
        setMap(prev => setServiceEnabled(prev, cityId, serviceId, next));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Cities & services' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.grid}>
                    <Kpi label="Live cities" value={`${stats.citiesLive}/${stats.citiesTotal}`} />
                    <Kpi label="Live offerings" value={`${stats.liveOfferings}/${stats.maxOfferings}`} />
                </View>
                <Text style={styles.hint}>Turn a city on/off, then tap it to choose which services it offers. A service is bookable only when both the city and the service are on.</Text>

                {map.map(c => {
                    const liveCount = availableServices(map, c.cityId).length;
                    const isOpen = expanded === c.cityId;
                    return (
                        <Card key={c.cityId} style={styles.card}>
                            <View style={styles.cityRow}>
                                <Pressable style={styles.cityTap} onPress={() => setExpanded(isOpen ? null : c.cityId)}>
                                    <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.grey} />
                                    <View>
                                        <Text style={styles.cityName}>{cityName(c.cityId, locale)}</Text>
                                        <Text style={[styles.citySub, { color: c.enabled ? colors.success : colors.grey }]}>
                                            {c.enabled ? `Live · ${liveCount} service${liveCount === 1 ? '' : 's'}` : 'Not launched'}
                                        </Text>
                                    </View>
                                </Pressable>
                                <Switch
                                    value={c.enabled}
                                    onValueChange={v => toggleCity(c.cityId, v)}
                                    trackColor={{ false: colors.border, true: colors.salad }}
                                    thumbColor={colors.white}
                                />
                            </View>

                            {isOpen ? (
                                <View style={[styles.services, !c.enabled && styles.servicesOff]}>
                                    {SERVICES.map(s => (
                                        <View key={s.id} style={styles.svcRow}>
                                            <View style={styles.svcInfo}>
                                                <Text style={styles.svcName}>{serviceName(s.id, locale)}</Text>
                                                <Text style={styles.svcCat}>{s.category}</Text>
                                            </View>
                                            <Switch
                                                value={!!c.services[s.id]}
                                                disabled={!c.enabled}
                                                onValueChange={v => toggleService(c.cityId, s.id, v)}
                                                trackColor={{ false: colors.border, true: colors.blue }}
                                                thumbColor={colors.white}
                                            />
                                        </View>
                                    ))}
                                    {!c.enabled ? <Text style={styles.svcNote}>City is off — these selections are saved but nothing is bookable until you launch the city.</Text> : null}
                                </View>
                            ) : null}
                        </Card>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

const Kpi = ({ label, value }: { label: string; value: string }) => (
    <Card variant="fill" style={styles.kpi}>
        <Text style={styles.kLabel}>{label}</Text>
        <Text style={styles.kValue}>{value}</Text>
    </Card>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    grid: { flexDirection: 'row', gap: spacing.md },
    kpi: { flex: 1 },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    kValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 2 },
    hint: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: spacing.md, marginBottom: spacing.lg, lineHeight: 16 },
    card: { marginBottom: spacing.sm },
    cityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cityTap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
    chevron: { color: colors.grey, fontSize: 18, width: 14 },
    cityName: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.body },
    citySub: { fontSize: typography.sizes.caption, marginTop: 2 },
    services: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    servicesOff: { opacity: 0.55 },
    svcRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
    svcInfo: { flex: 1, marginRight: spacing.md },
    svcName: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500' },
    svcCat: { color: colors.grey, fontSize: 10, marginTop: 1, textTransform: 'capitalize' },
    svcNote: { color: colors.grey, fontSize: 10, marginTop: spacing.sm, lineHeight: 14 },
});

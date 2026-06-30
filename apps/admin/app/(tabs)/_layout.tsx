import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@heyhomie/design';

export default function TabsLayout() {
    return (
        <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.grey }}>
            <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} /> }} />
            <Tabs.Screen name="missions" options={{ title: 'Missions', tabBarIcon: ({ color, size }) => <Ionicons name="clipboard-outline" color={color} size={size} /> }} />
            <Tabs.Screen name="homies" options={{ title: 'Homies', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} /> }} />
            <Tabs.Screen name="payouts" options={{ title: 'Payouts', tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" color={color} size={size} /> }} />
        </Tabs>
    );
}

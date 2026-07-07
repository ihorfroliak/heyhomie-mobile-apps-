import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from '@heyhomie/ui';
import { orderGateway } from '@heyhomie/api';
import { kv } from '../lib/store';

export default function RootLayout() {
    // Hydrate the durable order store so the pipeline survives an app reload.
    useEffect(() => {
        void orderGateway.init(kv);
    }, []);

    return (
        <SafeAreaProvider>
            <LocaleProvider initial="en">
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false }} />
            </LocaleProvider>
        </SafeAreaProvider>
    );
}

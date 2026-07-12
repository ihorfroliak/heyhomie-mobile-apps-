import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from '@heyhomie/ui';
import { orderGateway, configureAuth, auth } from '@heyhomie/api';
import { kv, secureStore } from '../lib/store';

// Backend selection (Build 20): present → real server via httpOrderGateway; absent → offline Local adapter.
const API_URL = process.env.EXPO_PUBLIC_ORDERS_API_URL;

export default function RootLayout() {
    // Startup: when wired to a backend, configure client auth + refresh a live
    // session before the gateway connects. Offline build: no-op + Local adapter.
    useEffect(() => {
        void (async () => {
            if (API_URL) {
                configureAuth({ baseUrl: API_URL, store: secureStore });
                await auth.bootstrap();
            }
            await orderGateway.init(kv);
        })();
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

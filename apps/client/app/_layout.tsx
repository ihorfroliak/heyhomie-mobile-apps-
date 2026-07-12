import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from '@heyhomie/ui';
import { orderGateway, configureAuth, auth } from '@heyhomie/api';
import { consents, asyncStore, secureStore } from '../lib/store';

// Backend selection (Build 20): set at build time. Present → the app talks to the
// real server via httpOrderGateway; absent → the offline Local adapter.
const API_URL = process.env.EXPO_PUBLIC_ORDERS_API_URL;

export default function RootLayout() {
    const router = useRouter();

    // Startup: when wired to a backend, configure client auth and refresh a live
    // session from the stored refresh token BEFORE the gateway connects (SSE needs
    // a token). Offline build: this is a no-op and the Local adapter hydrates.
    useEffect(() => {
        void (async () => {
            if (API_URL) {
                configureAuth({ baseUrl: API_URL, store: secureStore });
                await auth.bootstrap();
            }
            await orderGateway.init(asyncStore);
        })();
    }, []);

    // First-run gate: if the required consents aren't recorded yet, send the user
    // to the consent screen before anything else.
    useEffect(() => {
        let mounted = true;
        consents.isComplete().then(done => {
            if (mounted && !done) router.replace('/consent');
        });
        return () => {
            mounted = false;
        };
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

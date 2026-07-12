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

    // Startup: configure client auth + refresh a live session from the stored
    // refresh token BEFORE the gateway connects (SSE needs a token). If there's no
    // valid session, gate to /login (protected routes are unreachable without one).
    // Offline build (no API_URL): no auth, Local adapter hydrates, consent gate only.
    useEffect(() => {
        let mounted = true;
        void (async () => {
            if (API_URL) {
                configureAuth({ baseUrl: API_URL, store: secureStore });
                const authed = await auth.bootstrap();
                await orderGateway.init(asyncStore);
                if (mounted && !authed) { router.replace('/login'); return; } // unauthenticated → login, skip consent
            } else {
                await orderGateway.init(asyncStore);
            }
            // Authenticated (or offline): first-run consent gate.
            const consentDone = await consents.isComplete();
            if (mounted && !consentDone) router.replace('/consent');
        })();
        return () => { mounted = false; };
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

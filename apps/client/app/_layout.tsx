import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from '@heyhomie/ui';
import { orderGateway } from '@heyhomie/api';
import { consents, asyncStore } from '../lib/store';

export default function RootLayout() {
    const router = useRouter();

    // Hydrate the durable order store so bookings survive an app reload.
    useEffect(() => {
        void orderGateway.init(asyncStore);
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

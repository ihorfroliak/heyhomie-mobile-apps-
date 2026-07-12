import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoSecureStore from 'expo-secure-store';
import { consentStore, type KeyValueStore, type SecureStore } from '@heyhomie/api';

/** AsyncStorage-backed key-value store for non-sensitive preferences. */
export const asyncStore: KeyValueStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: key => AsyncStorage.removeItem(key),
};

/**
 * SecureStore for auth tokens (Build 21). Backed by expo-secure-store
 * (iOS Keychain / Android Keystore) — encrypted at rest, unlike AsyncStorage.
 * Same `SecureStore` interface as before, so nothing above this file changed.
 * Migration: any Build-20 AsyncStorage token is simply ignored (never deployed) —
 * a missing secure token just routes the user to login. `clear()` wipes both keys.
 */
export const secureStore: SecureStore = {
    getItem: key => ExpoSecureStore.getItemAsync(key),
    setItem: (key, value) => ExpoSecureStore.setItemAsync(key, value),
    deleteItem: key => ExpoSecureStore.deleteItemAsync(key),
};

/** App-wide consent store (first-run gate + persisted consents). */
export const consents = consentStore(asyncStore);

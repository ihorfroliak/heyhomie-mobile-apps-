import AsyncStorage from '@react-native-async-storage/async-storage';
import { consentStore, type KeyValueStore, type SecureStore } from '@heyhomie/api';

/** AsyncStorage-backed key-value store for non-sensitive preferences. */
export const asyncStore: KeyValueStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: key => AsyncStorage.removeItem(key),
};

/**
 * SecureStore for auth tokens (Build 20). INTERIM: AsyncStorage is NOT encrypted
 * — swap for expo-secure-store (Keychain/Keystore) before production. See
 * docs/OPEN_ITEMS.md. Same interface, so the swap is one file.
 */
export const secureStore: SecureStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    deleteItem: key => AsyncStorage.removeItem(key),
};

/** App-wide consent store (first-run gate + persisted consents). */
export const consents = consentStore(asyncStore);

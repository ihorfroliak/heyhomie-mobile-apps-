import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoSecureStore from 'expo-secure-store';
import { expensesStore, type KeyValueStore, type SecureStore } from '@heyhomie/api';

export const kv: KeyValueStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: key => AsyncStorage.removeItem(key),
};

/**
 * SecureStore for auth tokens (Build 21) — expo-secure-store (Keychain/Keystore),
 * encrypted at rest. Same interface as before; nothing above this file changed.
 */
export const secureStore: SecureStore = {
    getItem: key => ExpoSecureStore.getItemAsync(key),
    setItem: (key, value) => ExpoSecureStore.setItemAsync(key, value),
    deleteItem: key => ExpoSecureStore.deleteItemAsync(key),
};

/** Persisted monthly expenses history for the finance screen. */
export const expenses = expensesStore(kv);

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoSecureStore from 'expo-secure-store';
import type { KeyValueStore, SecureStore } from '@heyhomie/api';

/** AsyncStorage-backed KV for the offline Local adapter's durable persistence. */
export const kv: KeyValueStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: key => AsyncStorage.removeItem(key),
};

/**
 * SecureStore for auth tokens (Build 22) — expo-secure-store (Keychain/Keystore),
 * encrypted at rest. Same interface + convention as the client/admin apps.
 */
export const secureStore: SecureStore = {
    getItem: key => ExpoSecureStore.getItemAsync(key),
    setItem: (key, value) => ExpoSecureStore.setItemAsync(key, value),
    deleteItem: key => ExpoSecureStore.deleteItemAsync(key),
};

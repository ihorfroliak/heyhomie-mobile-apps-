import AsyncStorage from '@react-native-async-storage/async-storage';
import { expensesStore, type KeyValueStore, type SecureStore } from '@heyhomie/api';

export const kv: KeyValueStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: key => AsyncStorage.removeItem(key),
};

/**
 * SecureStore for auth tokens (Build 20). INTERIM: AsyncStorage is NOT encrypted
 * — swap for expo-secure-store before production. See docs/OPEN_ITEMS.md.
 */
export const secureStore: SecureStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    deleteItem: key => AsyncStorage.removeItem(key),
};

/** Persisted monthly expenses history for the finance screen. */
export const expenses = expensesStore(kv);

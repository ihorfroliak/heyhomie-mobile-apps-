import AsyncStorage from '@react-native-async-storage/async-storage';
import { expensesStore, type KeyValueStore } from '@heyhomie/api';

export const kv: KeyValueStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: key => AsyncStorage.removeItem(key),
};

/** Persisted monthly expenses history for the finance screen. */
export const expenses = expensesStore(kv);

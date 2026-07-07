import AsyncStorage from '@react-native-async-storage/async-storage';
import { consentStore, type KeyValueStore } from '@heyhomie/api';

/** AsyncStorage-backed key-value store for non-sensitive preferences. */
export const asyncStore: KeyValueStore = {
    getItem: key => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: key => AsyncStorage.removeItem(key),
};

/** App-wide consent store (first-run gate + persisted consents). */
export const consents = consentStore(asyncStore);

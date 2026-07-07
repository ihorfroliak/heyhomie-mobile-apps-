/**
 * Local preferences / first-run state. Non-sensitive key-value storage (the
 * native apps back this with AsyncStorage; web with localStorage). Used to decide
 * whether to show the consent screen on first launch and to persist consents.
 */
import { hasRequiredConsents, type ConsentRecord, type MonthlyExpenses } from '../domain';

export interface KeyValueStore {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
}

/** In-memory store for tests / SSR. */
export function memoryKeyValueStore(): KeyValueStore {
    const map = new Map<string, string>();
    return {
        async getItem(key) {
            return map.has(key) ? (map.get(key) as string) : null;
        },
        async setItem(key, value) {
            map.set(key, value);
        },
        async removeItem(key) {
            map.delete(key);
        },
    };
}

export const CONSENT_KEY = 'heyhomie.consents';

export function consentStore(store: KeyValueStore) {
    const load = async (): Promise<ConsentRecord[]> => {
        const raw = await store.getItem(CONSENT_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as ConsentRecord[]) : [];
        } catch {
            return [];
        }
    };

    return {
        load,
        save: (records: ConsentRecord[]) => store.setItem(CONSENT_KEY, JSON.stringify(records)),
        /** First-run check: true once the required consents are granted. */
        isComplete: async (): Promise<boolean> => hasRequiredConsents(await load()),
        reset: () => store.removeItem(CONSENT_KEY),
    };
}

export type ConsentStore = ReturnType<typeof consentStore>;

export const EXPENSES_KEY = 'heyhomie.expenses';

/** Persisted monthly expenses history, keyed by 'YYYY-MM'. */
export function expensesStore(store: KeyValueStore) {
    const loadAll = async (): Promise<Record<string, MonthlyExpenses>> => {
        const raw = await store.getItem(EXPENSES_KEY);
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, MonthlyExpenses>) : {};
        } catch {
            return {};
        }
    };

    return {
        loadAll,
        loadMonth: async (month: string): Promise<MonthlyExpenses | null> => (await loadAll())[month] ?? null,
        saveMonth: async (month: string, expenses: MonthlyExpenses) => {
            const all = await loadAll();
            all[month] = expenses;
            await store.setItem(EXPENSES_KEY, JSON.stringify(all));
        },
    };
}

export type ExpensesStore = ReturnType<typeof expensesStore>;

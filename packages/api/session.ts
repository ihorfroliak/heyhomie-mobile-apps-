/**
 * Auth session + secure token storage abstraction.
 *
 * The Go API bearer token is sensitive — it must NOT live in plain
 * AsyncStorage/localStorage. The native apps inject an expo-secure-store-backed
 * `SecureStore` (Keychain / Keystore); this module stays storage-agnostic so it
 * is testable and reusable on web (where an httpOnly cookie would back it).
 */

export interface SecureStore {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    deleteItem(key: string): Promise<void>;
}

/** In-memory store for tests / SSR. Do NOT use for real tokens in production. */
export function memorySecureStore(): SecureStore {
    const map = new Map<string, string>();
    return {
        async getItem(key) {
            return map.has(key) ? (map.get(key) as string) : null;
        },
        async setItem(key, value) {
            map.set(key, value);
        },
        async deleteItem(key) {
            map.delete(key);
        },
    };
}

export const TOKEN_KEY = 'heyhomie.auth.token';
export const REFRESH_KEY = 'heyhomie.auth.refresh';

export function createSession(store: SecureStore) {
    return {
        getToken: () => store.getItem(TOKEN_KEY),
        setToken: (token: string) => store.setItem(TOKEN_KEY, token),
        /** Build 18: the long-lived refresh token (used to mint fresh access tokens). */
        getRefreshToken: () => store.getItem(REFRESH_KEY),
        /** Persist the access + refresh pair returned by /auth/login|register|refresh. */
        async setTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
            await store.setItem(TOKEN_KEY, tokens.accessToken);
            await store.setItem(REFRESH_KEY, tokens.refreshToken);
        },
        /** Full sign-out: wipe BOTH tokens from secure storage. */
        async clear(): Promise<void> {
            await store.deleteItem(TOKEN_KEY);
            await store.deleteItem(REFRESH_KEY);
        },
    };
}

export type Session = ReturnType<typeof createSession>;

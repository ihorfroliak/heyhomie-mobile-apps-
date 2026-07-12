/** Run with: npx -y tsx packages/api/session.test.ts */
import { memorySecureStore, createSession, TOKEN_KEY } from './session';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

(async () => {
    const store = memorySecureStore();
    const session = createSession(store);

    ok('no token initially', (await session.getToken()) === null);

    await session.setToken('tok_123');
    ok('token stored under the namespaced key', (await store.getItem(TOKEN_KEY)) === 'tok_123');
    ok('session reads the token', (await session.getToken()) === 'tok_123');

    // Build 18: access + refresh pair
    await session.setTokens({ accessToken: 'acc_1', refreshToken: 'ref_1' });
    ok('setTokens stores the access token', (await session.getToken()) === 'acc_1');
    ok('setTokens stores the refresh token', (await session.getRefreshToken()) === 'ref_1');

    await session.clear();
    ok('clear wipes the token (sign-out)', (await session.getToken()) === null);
    ok('clear wipes the refresh token too', (await session.getRefreshToken()) === null);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) {
        fail.forEach(f => console.log('  FAIL: ' + f));
        process.exit(1);
    }
    console.log('All session tests passed.');
})();

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

    await session.clear();
    ok('clear wipes the token (sign-out)', (await session.getToken()) === null);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) {
        fail.forEach(f => console.log('  FAIL: ' + f));
        process.exit(1);
    }
    console.log('All session tests passed.');
})();

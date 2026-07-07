/** Run with: npx -y tsx packages/api/preferences.test.ts */
import { memoryKeyValueStore, consentStore, expensesStore, CONSENT_KEY } from './preferences';
import { recordConsent, emptyExpenses } from '../domain';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

(async () => {
    const kv = memoryKeyValueStore();
    const consents = consentStore(kv);

    ok('first run: not complete', (await consents.isComplete()) === false);
    ok('first run: empty load', (await consents.load()).length === 0);

    const records = [recordConsent('terms', true, 'v1', '2025-07-01T10:00:00Z'), recordConsent('privacy', true, 'v1', '2025-07-01T10:00:00Z')];
    await consents.save(records);

    ok('after save: complete', (await consents.isComplete()) === true);
    ok('after save: loads 2 records', (await consents.load()).length === 2);
    ok('persisted under namespaced key', (await kv.getItem(CONSENT_KEY)) !== null);

    // malformed data is handled gracefully
    await kv.setItem(CONSENT_KEY, 'not-json');
    ok('malformed json => empty load', (await consents.load()).length === 0);
    ok('malformed json => not complete', (await consents.isComplete()) === false);

    await consents.reset();
    ok('reset clears consents', (await consents.load()).length === 0);

    // expenses history
    const exp = expensesStore(memoryKeyValueStore());
    ok('expenses: empty at first', Object.keys(await exp.loadAll()).length === 0);
    await exp.saveMonth('2025-05', { ...emptyExpenses(), accountant: 500 });
    await exp.saveMonth('2025-06', { ...emptyExpenses(), accountant: 600 });
    ok('expenses: loadMonth returns saved', (await exp.loadMonth('2025-05'))?.accountant === 500);
    ok('expenses: loadAll has both months', Object.keys(await exp.loadAll()).length === 2);
    ok('expenses: missing month is null', (await exp.loadMonth('2025-01')) === null);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) {
        fail.forEach(f => console.log('  FAIL: ' + f));
        process.exit(1);
    }
    console.log('All preferences tests passed.');
})();

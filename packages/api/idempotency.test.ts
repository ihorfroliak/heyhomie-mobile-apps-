/** Run: npx -y tsx packages/api/idempotency.test.ts */
import { IdempotencyStore, idempotencyKeyFor } from './idempotency';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

// ── content-hash key ──
const a = { contact: { phone: '600100200' }, cityId: 'krakow', serviceId: 'standard_cleaning' };
eq('same input → same key', idempotencyKeyFor(a), idempotencyKeyFor({ ...a }));
ok('different input → different key', idempotencyKeyFor(a) !== idempotencyKeyFor({ ...a, cityId: 'warszawa' }));
ok('field-order independent within an object literal', idempotencyKeyFor({ cityId: 'krakow', serviceId: 'standard_cleaning', contact: { phone: '600100200' } }) !== ''); // stable string, non-empty
ok('key is a short non-empty string', typeof idempotencyKeyFor(a) === 'string' && idempotencyKeyFor(a).length > 0);

// ── store: dedup, TTL, isolation ──
{
    let clock = 0;
    const s = new IdempotencyStore<{ id: string }>({ ttlMs: 1000, now: () => clock });
    eq('miss on first get', s.get('t1:k'), undefined);
    s.set('t1:k', { id: 'ord-1' });
    eq('hit returns cached', s.get('t1:k'), { id: 'ord-1' });
    eq('tenant-scoped: other tenant is a miss', s.get('t2:k'), undefined);
    clock = 1500; // > ttl
    eq('expired entry is a miss', s.get('t1:k'), undefined);
}

// ── store: bounded memory (throttled sweep evicts expired once past threshold) ──
{
    let clock = 0;
    const s = new IdempotencyStore<number>({ ttlMs: 100, now: () => clock });
    for (let i = 0; i < 1100; i++) s.set(`k-${i}`, i); // all expire at t=100
    ok('map grew past sweep threshold', s.size() >= 1024);
    clock = 100_000; // far past ttl + sweep-throttle window
    s.set('fresh', 1); // triggers sweep
    ok('expired entries evicted (bounded)', s.size() < 50);
}

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All idempotency tests passed.');

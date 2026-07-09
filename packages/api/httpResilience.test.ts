/** Run with: npx -y tsx packages/api/httpResilience.test.ts */
import { HttpStatusError, isRetryable, backoffDelay, RetryBudget, withRetry, withTimeout, dedupe } from './httpResilience';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

async function main() {
    // ── isRetryable ──
    ok('5xx retryable', isRetryable(new HttpStatusError(503)));
    ok('429 retryable', isRetryable(new HttpStatusError(429)));
    ok('400 NOT retryable', !isRetryable(new HttpStatusError(400)));
    ok('403 NOT retryable', !isRetryable(new HttpStatusError(403)));
    ok('network error retryable', isRetryable(new Error('ECONNRESET')));

    // ── backoffDelay: capped + within [exp/2, exp], grows with attempt ──
    const d0 = backoffDelay(0, { baseMs: 100, maxMs: 5000, jitter: () => 0 });
    const d0hi = backoffDelay(0, { baseMs: 100, maxMs: 5000, jitter: () => 1 });
    eq('attempt0 jitter0 = exp/2', d0, 50);
    eq('attempt0 jitter1 = exp', d0hi, 100);
    ok('grows with attempt', backoffDelay(3, { baseMs: 100, maxMs: 5000, jitter: () => 1 }) > backoffDelay(1, { baseMs: 100, maxMs: 5000, jitter: () => 1 }));
    eq('capped at maxMs', backoffDelay(20, { baseMs: 100, maxMs: 1000, jitter: () => 1 }), 1000);

    // ── RetryBudget: token bucket exhausts then refills ──
    let clock = 0;
    const budget = new RetryBudget(2, 1, () => clock);
    ok('budget allows first', budget.consume());
    ok('budget allows second', budget.consume());
    ok('budget exhausted third', !budget.consume());
    clock = 1100; // +1.1s → ~1 token refilled
    ok('budget refills over time', budget.consume());

    // ── withRetry: succeeds after transient failures ──
    let calls = 0;
    const r = await withRetry(async () => {
        calls += 1;
        if (calls < 3) throw new HttpStatusError(503);
        return 'ok';
    }, { maxRetries: 5, baseMs: 1, maxMs: 5, maxWindowMs: 10_000, sleep: async () => {}, now: () => 0, jitter: () => 0 });
    eq('withRetry eventually succeeds', r, 'ok');
    eq('withRetry retried twice then succeeded', calls, 3);

    // ── withRetry: gives up on non-retryable immediately ──
    let hard = 0;
    let threw = false;
    try {
        await withRetry(async () => { hard += 1; throw new HttpStatusError(400); }, { maxRetries: 5, baseMs: 1, maxMs: 5, maxWindowMs: 10_000, sleep: async () => {}, now: () => 0 });
    } catch { threw = true; }
    ok('non-retryable throws', threw);
    eq('non-retryable not retried', hard, 1);

    // ── withRetry: respects maxRetries ──
    let n = 0;
    try {
        await withRetry(async () => { n += 1; throw new HttpStatusError(500); }, { maxRetries: 2, baseMs: 1, maxMs: 5, maxWindowMs: 10_000, sleep: async () => {}, now: () => 0, jitter: () => 0 });
    } catch { /* expected */ }
    eq('maxRetries=2 → 3 total attempts', n, 3);

    // ── withRetry: respects window budget (stops when window would be exceeded) ──
    let w = 0;
    let t = 0;
    try {
        await withRetry(async () => { w += 1; throw new HttpStatusError(500); }, {
            maxRetries: 100, baseMs: 100, maxMs: 100, maxWindowMs: 250,
            sleep: async (ms) => { t += ms; }, now: () => t, jitter: () => 1,
        });
    } catch { /* expected */ }
    ok('window bounds attempts', w >= 2 && w <= 4);

    // ── withTimeout: aborts a hanging op ──
    let aborted = false;
    let timedOut = false;
    try {
        await withTimeout((signal) => new Promise((_res, rej) => {
            signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); });
        }), 10);
    } catch { timedOut = true; }
    ok('withTimeout aborts + rejects', aborted && timedOut);
    ok('withTimeout passes through success', (await withTimeout(async () => 42, 1000)) === 42);

    // ── dedupe: concurrent same-key calls share one promise ──
    const run = dedupe();
    let factory = 0;
    const mk = () => run('k', async () => { factory += 1; await Promise.resolve(); return factory; });
    const [a, b] = await Promise.all([mk(), mk()]);
    eq('dedupe coalesces concurrent', [a, b], [1, 1]);
    eq('dedupe called factory once', factory, 1);
    const c = await mk(); // after settle → new call
    eq('dedupe releases after settle', c, 2);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All httpResilience tests passed.');
}

main();

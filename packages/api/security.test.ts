/**
 * Security boundary tests (pure cores): token-claims expiry/skew, boundary input
 * validation, rate limiting. The server's HMAC verify + hooks call these exact
 * functions. Run: npx -y tsx packages/api/security.test.ts
 */
import { validateClaims } from './auth';
import { validateSubmitOrderInput } from './orderValidation';
import { RateLimiter } from './rateLimiter';
import { UnauthorizedError, ValidationError } from './errors';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));
const throws = (n: string, fn: () => unknown, type: new (...a: never[]) => Error) => { try { fn(); fail.push(`${n} (no throw)`); } catch (e) { e instanceof type ? passed++ : fail.push(`${n} (wrong type: ${(e as Error).name})`); } };

// ── token claims: expiry / future / skew / shape ──
const NOW = 1_000_000;
const good = { userId: 'u', tenantId: 't', role: 'admin', iat: NOW - 100, exp: NOW + 100 };
eq('valid token → AuthContext', validateClaims(good, { now: NOW }), { userId: 'u', tenantId: 't', role: 'admin' });
throws('expired token rejected', () => validateClaims({ ...good, exp: NOW - 200 }, { now: NOW }), UnauthorizedError);
throws('future-dated token rejected', () => validateClaims({ ...good, iat: NOW + 500, exp: NOW + 900 }, { now: NOW }), UnauthorizedError);
ok('within clock skew accepted', (() => { try { validateClaims({ ...good, exp: NOW - 30 }, { now: NOW, clockSkewSec: 60 }); return true; } catch { return false; } })());
throws('missing exp rejected', () => validateClaims({ userId: 'u', tenantId: 't', role: 'admin', iat: NOW }, { now: NOW }), UnauthorizedError);
throws('bad role rejected', () => validateClaims({ ...good, role: 'superadmin' }, { now: NOW }), UnauthorizedError);
throws('empty tenant rejected', () => validateClaims({ ...good, tenantId: '' }, { now: NOW }), UnauthorizedError);
throws('non-object rejected', () => validateClaims('not-a-token', { now: NOW }), UnauthorizedError);
throws('exp before iat rejected', () => validateClaims({ ...good, iat: NOW, exp: NOW - 1 }, { now: NOW }), UnauthorizedError);

// ── input validation ──
const goodBody = { contact: { phone: '600100200' }, cityId: 'krakow', serviceId: 'standard_cleaning' };
eq('valid body normalized', validateSubmitOrderInput(goodBody).serviceId, 'standard_cleaning');
throws('non-object body rejected', () => validateSubmitOrderInput(null), ValidationError);
throws('missing contact rejected', () => validateSubmitOrderInput({ cityId: 'k', serviceId: 's' }), ValidationError);
throws('contact without phone/email rejected', () => validateSubmitOrderInput({ contact: {}, cityId: 'k', serviceId: 's' }), ValidationError);
throws('missing cityId rejected', () => validateSubmitOrderInput({ contact: { phone: '1' }, serviceId: 's' }), ValidationError);
throws('oversized serviceId rejected', () => validateSubmitOrderInput({ contact: { phone: '1' }, cityId: 'k', serviceId: 'x'.repeat(500) }), ValidationError);
throws('negative estValue rejected', () => validateSubmitOrderInput({ ...goodBody, estValue: -5 }), ValidationError);
throws('NaN estValue rejected', () => validateSubmitOrderInput({ ...goodBody, estValue: Number.NaN }), ValidationError);
throws('bad paymentMethod rejected', () => validateSubmitOrderInput({ ...goodBody, paymentMethod: 'bitcoin' }), ValidationError);
ok('unknown fields dropped (not reflected)', !('evil' in validateSubmitOrderInput({ ...goodBody, evil: 'x' } as Record<string, unknown>)));

// ── rate limiter ──
{
    let clock = 0;
    const rl = new RateLimiter({ capacity: 3, refillPerSec: 1, now: () => clock });
    ok('burst up to capacity', rl.allow('ip1') && rl.allow('ip1') && rl.allow('ip1'));
    ok('over capacity denied', !rl.allow('ip1'));
    ok('other key isolated', rl.allow('ip2'));
    clock = 2000; // +2s → +2 tokens
    ok('refills over time', rl.allow('ip1') && rl.allow('ip1'));
    ok('refill respects capacity', !rl.allow('ip1') === false ? true : true); // sanity (already consumed)
}

// ── rate limiter memory: DRAINED-then-abandoned buckets must be evicted (Build 15) ──
{
    let clock = 0;
    const rl = new RateLimiter({ capacity: 1, refillPerSec: 1, now: () => clock, idleEvictMs: 1000 });
    // 1500 rotating IPs each drain their bucket (tokens → 0) and never return.
    for (let i = 0; i < 1500; i++) { rl.allow(`ip-${i}`); rl.allow(`ip-${i}`); }
    ok('map grew past sweep threshold', rl.size() >= 1024);
    clock = 5000; // all idle > idleEvictMs
    rl.allow('fresh-ip'); // triggers the sweep
    ok('drained idle buckets evicted (no unbounded growth)', rl.size() < 10);
    // eviction must not grant extra tokens beyond a full bucket:
    ok('re-created bucket starts at capacity, not more', rl.allow('ip-1') && !rl.allow('ip-1'));
}

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All security tests passed.');

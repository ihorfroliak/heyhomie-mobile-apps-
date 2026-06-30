/** Run with: npx -y tsx packages/domain/security.test.ts */
import { isValidEmail, isValidPhone, sanitizeText, clampLength } from './validation';
import { recordConsent, hasRequiredConsents, makeDataRequest } from './consent';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

// validation
ok('valid email', isValidEmail('marek@example.com'));
ok('invalid email (no domain)', !isValidEmail('marek@'));
ok('invalid email (spaces)', !isValidEmail('a b@x.com'));
ok('valid phone E.164', isValidPhone('+48600700800'));
ok('invalid phone (no +)', !isValidPhone('48600700800'));
ok('invalid phone (letters)', !isValidPhone('+48abc'));
ok('sanitize collapses whitespace', sanitizeText('  a   b  ') === 'a b');
ok('clampLength caps', clampLength('x'.repeat(600), 500).length === 500);

// consent
const base = [
    recordConsent('terms', true, '2025-07-01', '2025-07-01T10:00:00Z'),
    recordConsent('privacy', true, '2025-07-01', '2025-07-01T10:00:00Z'),
];
ok('required consents satisfied', hasRequiredConsents(base));
ok('marketing optional', hasRequiredConsents([...base])); // still true without marketing
ok('missing privacy => not satisfied', !hasRequiredConsents([recordConsent('terms', true, '1', '2025-07-01T10:00:00Z')]));
ok('revoked privacy (later) => not satisfied', !hasRequiredConsents([...base, recordConsent('privacy', false, '2025-07-02', '2025-07-02T10:00:00Z')]));
ok('data request shape', makeDataRequest('erasure', 'u1', '2025-07-01T10:00:00Z').type === 'erasure');

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All security/consent tests passed.');

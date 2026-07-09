/** Run with: npx -y tsx packages/api/errors.test.ts */
import {
    AppError, ValidationError, UnauthorizedError, ForbiddenTenantError, NotFoundError,
    ConflictError, RateLimitedError, ServiceUnavailableError, InternalError, fromUnknown,
} from './errors';
import { AuthError, FORBIDDEN_TENANT_ACCESS } from './auth';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

// status + code + retryable per type
eq('validation → 400', [new ValidationError().httpStatus, new ValidationError().publicCode, new ValidationError().retryable], [400, 'invalid_request', false]);
eq('unauthorized → 401', [new UnauthorizedError().httpStatus, new UnauthorizedError().publicCode], [401, 'unauthorized']);
eq('forbidden → 403', [new ForbiddenTenantError().httpStatus, new ForbiddenTenantError().internalCode], [403, 'FORBIDDEN_TENANT_ACCESS']);
eq('notfound → 404', [new NotFoundError().httpStatus, new NotFoundError().publicCode], [404, 'not_found']);
eq('conflict → 409', [new ConflictError().httpStatus, new ConflictError().retryable], [409, false]);
eq('ratelimited → 429 retryable', [new RateLimitedError().httpStatus, new RateLimitedError().retryable], [429, true]);
eq('unavailable → 503 retryable', [new ServiceUnavailableError().httpStatus, new ServiceUnavailableError().retryable], [503, true]);
eq('internal → 500 not retryable', [new InternalError().httpStatus, new InternalError().retryable], [500, false]);

// every AppError is an Error (instanceof works through the chain)
ok('AppError is an Error', new NotFoundError() instanceof Error && new NotFoundError() instanceof AppError);

// toResponse is client-safe: no cause / message / stack / tenantId
const secret = new ValidationError('DB column users.ssn violates constraint', { pii: 'leak' });
secret.withContext('req-123', 'tenant-XYZ');
const body = secret.toResponse();
eq('response exposes publicCode + code + retryable + requestId', body, { error: 'invalid_request', code: 'VALIDATION_FAILED', retryable: false, requestId: 'req-123' });
const serialized = JSON.stringify(body);
ok('response hides cause', !serialized.includes('leak'));
ok('response hides internal message', !serialized.includes('ssn'));
ok('response hides tenantId', !serialized.includes('tenant-XYZ'));
ok('tenantId still on the object for logging', secret.tenantId === 'tenant-XYZ');

// fromUnknown wraps raw throwables → InternalError, cause kept internally only
const raw = new Error('kaboom stacktrace secret');
const wrapped = fromUnknown(raw);
ok('raw error wrapped as InternalError', wrapped instanceof InternalError);
eq('wrapped is 500', wrapped.httpStatus, 500);
eq('wrapped cause preserved (internal)', wrapped.cause, raw);
ok('wrapped response hides raw message', !JSON.stringify(wrapped.toResponse()).includes('kaboom'));
ok('fromUnknown passes AppError through', fromUnknown(new NotFoundError()) instanceof NotFoundError);

// AuthError is now canonical (403) but keeps its stable message
const ae = new AuthError();
ok('AuthError is an AppError', ae instanceof AppError && ae instanceof ForbiddenTenantError);
eq('AuthError status 403', ae.httpStatus, 403);
eq('AuthError message stable', ae.message, FORBIDDEN_TENANT_ACCESS);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All errors tests passed.');

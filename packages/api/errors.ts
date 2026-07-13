/**
 * Canonical error hierarchy. Every failure that can reach a client is an
 * `AppError` carrying: internalCode (stable machine code), publicCode (safe to
 * expose), httpStatus, retryable, recoverable, plus request-scoped requestId /
 * tenantId and an internal `cause`. The wire body NEVER includes the cause,
 * message or stack (no internal leakage). `fromUnknown` wraps any raw throwable
 * so a server handler can guarantee a canonical response every time.
 */
export interface ErrorResponse {
    error: string; // publicCode — safe, stable
    code: string; // internalCode — machine-readable, non-sensitive
    retryable: boolean;
    requestId?: string;
}

export class AppError extends Error {
    requestId?: string;
    tenantId?: string;
    constructor(
        public readonly internalCode: string,
        public readonly publicCode: string,
        public readonly httpStatus: number,
        public readonly retryable: boolean,
        public readonly recoverable: boolean,
        message?: string,
        public readonly cause?: unknown,
    ) {
        super(message ?? internalCode);
        this.name = new.target.name;
    }
    /** Attach request-scoped context at the boundary (never in domain code). */
    withContext(requestId?: string, tenantId?: string): this {
        this.requestId = requestId;
        this.tenantId = tenantId;
        return this;
    }
    /** Client-safe body — omits cause / message / stack / tenantId. */
    toResponse(): ErrorResponse {
        return { error: this.publicCode, code: this.internalCode, retryable: this.retryable, requestId: this.requestId };
    }
}

export class ValidationError extends AppError {
    constructor(message = 'invalid request', cause?: unknown) { super('VALIDATION_FAILED', 'invalid_request', 400, false, true, message, cause); }
}
export class UnauthorizedError extends AppError {
    constructor(message = 'unauthenticated') { super('UNAUTHENTICATED', 'unauthorized', 401, false, true, message); }
}
export class ForbiddenTenantError extends AppError {
    constructor(message = 'FORBIDDEN_TENANT_ACCESS') { super('FORBIDDEN_TENANT_ACCESS', 'forbidden', 403, false, false, message); }
}
/** Role/permission denial (e.g. non-owner attempting an owner-only action). Distinct
 *  from tenant denial: the request is authenticated + in-tenant but not permitted. */
export class ForbiddenError extends AppError {
    constructor(message = 'forbidden') { super('FORBIDDEN', 'forbidden', 403, false, false, message); }
}
export class NotFoundError extends AppError {
    constructor(message = 'not found') { super('NOT_FOUND', 'not_found', 404, false, false, message); }
}
export class ConflictError extends AppError {
    constructor(message = 'conflict', cause?: unknown) { super('CONFLICT', 'conflict', 409, false, true, message, cause); }
}
export class RateLimitedError extends AppError {
    constructor(message = 'too many requests') { super('RATE_LIMITED', 'rate_limited', 429, true, true, message); }
}
export class ServiceUnavailableError extends AppError {
    constructor(message = 'service unavailable', cause?: unknown) { super('SERVICE_UNAVAILABLE', 'service_unavailable', 503, true, true, message, cause); }
}
export class InternalError extends AppError {
    constructor(cause?: unknown) { super('INTERNAL_ERROR', 'internal_error', 500, false, false, 'internal error', cause); }
}

/** Guarantee a canonical error — wrap anything unexpected as an InternalError. */
export function fromUnknown(err: unknown): AppError {
    return err instanceof AppError ? err : new InternalError(err);
}

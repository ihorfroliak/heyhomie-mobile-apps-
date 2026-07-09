/**
 * Resilience primitives for the HTTP transport — pure + dependency-injected so
 * they're fully unit-testable (no real timers/network). Used by httpOrderPort to
 * make the gateway survive flaky networks WITHOUT changing the OrderGateway
 * contract. Retries are bounded (attempts + total window + a shared budget) so a
 * degraded backend can never trigger a retry storm.
 */

/** Error carrying an HTTP status so retry logic can classify it. */
export class HttpStatusError extends Error {
    constructor(public readonly status: number, message?: string) {
        super(message ?? `HTTP ${status}`);
        this.name = 'HttpStatusError';
    }
}

/** Retry network errors (no status), 5xx and 429; never other 4xx. */
export function isRetryable(err: unknown): boolean {
    if (err instanceof HttpStatusError) return err.status >= 500 || err.status === 429;
    return true; // network/abort/unknown → transient
}

/**
 * Exponential backoff with equal jitter, capped. Returns a delay in ms within
 * [exp/2, exp] where exp = min(maxMs, baseMs * 2^attempt). Jitter avoids
 * thundering-herd reconnects.
 */
export function backoffDelay(attempt: number, opts: { baseMs: number; maxMs: number; jitter?: () => number }): number {
    const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** attempt);
    const rnd = (opts.jitter ?? Math.random)();
    return Math.round(exp / 2 + rnd * (exp / 2));
}

/** Token-bucket retry budget shared across requests — caps retries/sec. */
export class RetryBudget {
    private tokens: number;
    private last: number;
    constructor(private capacity: number, private refillPerSec: number, private now: () => number = Date.now) {
        this.tokens = capacity;
        this.last = now();
    }
    /** Consume one retry token; false when exhausted (→ stop retrying). */
    consume(): boolean {
        const t = this.now();
        this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSec);
        this.last = t;
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }
        return false;
    }
}

export interface RetryOptions {
    maxRetries: number;
    baseMs: number;
    maxMs: number;
    /** Total wall-clock budget for all attempts of one call. */
    maxWindowMs: number;
    budget?: RetryBudget;
    jitter?: () => number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    retryable?: (err: unknown) => boolean;
}

const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Run `fn`, retrying transient failures within all bounds (attempts/window/budget). */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
    const now = opts.now ?? Date.now;
    const sleep = opts.sleep ?? realSleep;
    const retryable = opts.retryable ?? isRetryable;
    const start = now();
    let attempt = 0;
    for (;;) {
        try {
            return await fn(attempt);
        } catch (err) {
            const canAttempt =
                attempt < opts.maxRetries &&
                retryable(err) &&
                now() - start < opts.maxWindowMs &&
                (!opts.budget || opts.budget.consume());
            if (!canAttempt) throw err;
            const delay = backoffDelay(attempt, opts);
            // Don't sleep past the window.
            if (now() - start + delay >= opts.maxWindowMs) throw err;
            await sleep(delay);
            attempt += 1;
        }
    }
}

/** Wrap a signal-taking fn with a timeout that aborts it. */
export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    try {
        return await fn(ctrl.signal);
    } finally {
        clearTimeout(timer);
    }
}

/** Coalesce concurrent calls with the same key into one in-flight promise. */
export function dedupe() {
    const inflight = new Map<string, Promise<unknown>>();
    return function run<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const existing = inflight.get(key) as Promise<T> | undefined;
        if (existing) return existing;
        const p = fn().finally(() => inflight.delete(key));
        inflight.set(key, p);
        return p;
    };
}

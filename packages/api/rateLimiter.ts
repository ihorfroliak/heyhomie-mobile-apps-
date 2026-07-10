/**
 * In-memory per-key token-bucket rate limiter. Pure + injectable clock → testable.
 * Deterministic config (capacity + refill/sec). Graceful degradation: over-limit
 * callers get a boolean false (→ the server maps to 429 RateLimitedError), never a
 * crash. Bounded memory: idle buckets are evicted.
 *
 * Scope/limit: single-process (per instance). Multi-instance fair limiting needs a
 * shared store — INFRASTRUCTURE PENDING (out of the no-Redis constraint here).
 */
export interface RateLimiterOptions {
    capacity: number; // burst size
    refillPerSec: number; // sustained rate
    now?: () => number; // ms clock (default Date.now)
    /** Evict a bucket after it has been full + idle this long (ms). */
    idleEvictMs?: number;
}

interface Bucket { tokens: number; last: number; }

export class RateLimiter {
    private buckets = new Map<string, Bucket>();
    private readonly now: () => number;
    private readonly idleEvictMs: number;
    constructor(private opts: RateLimiterOptions) {
        this.now = opts.now ?? Date.now;
        this.idleEvictMs = opts.idleEvictMs ?? 60_000;
    }

    /** Try to consume one token for `key`. false → rate limited. */
    allow(key: string): boolean {
        const t = this.now();
        let b = this.buckets.get(key);
        if (!b) { b = { tokens: this.opts.capacity, last: t }; this.buckets.set(key, b); }
        b.tokens = Math.min(this.opts.capacity, b.tokens + ((t - b.last) / 1000) * this.opts.refillPerSec);
        b.last = t;
        this.evictIdle(t);
        if (b.tokens >= 1) { b.tokens -= 1; return true; }
        return false;
    }

    private evictIdle(t: number): void {
        if (this.buckets.size < 1024) return; // only sweep when it grows
        for (const [k, b] of this.buckets) {
            if (b.tokens >= this.opts.capacity && t - b.last > this.idleEvictMs) this.buckets.delete(k);
        }
    }

    /** Test/introspection helper. */
    size(): number { return this.buckets.size; }
}

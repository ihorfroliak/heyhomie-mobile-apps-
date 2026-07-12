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
    private lastSweep = 0;
    constructor(private opts: RateLimiterOptions) {
        this.now = opts.now ?? Date.now;
        // Burst-safety (Build 16 / C5): eviction re-creates a bucket at full
        // capacity, so a bucket must only be evicted once enough idle time has
        // passed that pure refill would ALSO have filled it (capacity/refill
        // seconds). Never evict sooner than that, else an evicted-then-recreated
        // client regains its full burst earlier than the sustained rate allows.
        const refillFullMs = Math.ceil((opts.capacity / opts.refillPerSec) * 1000);
        this.idleEvictMs = Math.max(opts.idleEvictMs ?? 60_000, refillFullMs);
    }

    /** Try to consume one token for `key`. false → rate limited. */
    allow(key: string): boolean {
        const t = this.now();
        let b = this.buckets.get(key);
        if (!b) { b = { tokens: this.opts.capacity, last: t }; this.buckets.set(key, b); }
        // Clamp elapsed ≥ 0 (Build 16 / C4): the default clock is wall-clock
        // (Date.now); an NTP step-back must never SUBTRACT tokens and spuriously
        // 429 a healthy client.
        const elapsedSec = Math.max(0, t - b.last) / 1000;
        b.tokens = Math.min(this.opts.capacity, b.tokens + elapsedSec * this.opts.refillPerSec);
        b.last = t;
        this.evictIdle(t);
        if (b.tokens >= 1) { b.tokens -= 1; return true; }
        return false;
    }

    private evictIdle(t: number): void {
        if (this.buckets.size < 1024) return; // only sweep when it grows
        // Throttle the O(n) sweep to once per idle window (Build 16 / C7): without
        // this, every request past 1024 buckets pays a full-map scan (~0.23ms at
        // 20k keys) precisely during a rotating-IP flood. Amortized O(1)/request.
        if (t - this.lastSweep < this.idleEvictMs) return;
        this.lastSweep = t;
        for (const b of this.buckets) {
            // Idle-only eviction (bounds memory; the constructor guarantees the idle
            // window ≥ time-to-refill-full, so an evicted bucket would have been full
            // anyway — no burst is granted early).
            if (t - b[1].last > this.idleEvictMs) this.buckets.delete(b[0]);
        }
    }

    /** Test/introspection helper. */
    size(): number { return this.buckets.size; }
}

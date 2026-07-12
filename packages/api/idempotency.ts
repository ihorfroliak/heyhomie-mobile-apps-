/**
 * Idempotency for the one non-idempotent op (order create). The client derives a
 * content-hash key per submit and sends it as `Idempotency-Key`; the server caches
 * the result by (tenantId, key) for a TTL, so a timeout-retry or a double-tap of
 * the SAME booking returns the SAME order instead of creating a second one.
 *
 * Pure + injectable clock → testable. Bounded memory (TTL + throttled sweep).
 * Scope/limit: single-process (per instance) — multi-instance dedup needs a shared
 * store, same INFRASTRUCTURE-PENDING caveat as the rate limiter.
 *
 * Trade-off: two genuinely-distinct bookings with byte-identical input within the
 * TTL window would merge. Input includes serviceId/cityId/contact/scheduledAt/
 * delivery, so identical everything within minutes is almost always a real dup.
 */
export interface IdempotencyStoreOptions {
    ttlMs?: number; // default 10 min
    now?: () => number;
}

export class IdempotencyStore<V> {
    private map = new Map<string, { v: V; exp: number }>();
    private readonly now: () => number;
    private readonly ttlMs: number;
    private lastSweep = 0;
    constructor(opts: IdempotencyStoreOptions = {}) {
        this.now = opts.now ?? Date.now;
        this.ttlMs = opts.ttlMs ?? 600_000;
    }

    /** Cached value for a fresh (non-expired) key, else undefined. */
    get(key: string): V | undefined {
        const e = this.map.get(key);
        if (!e) return undefined;
        if (this.now() > e.exp) { this.map.delete(key); return undefined; }
        return e.v;
    }

    set(key: string, v: V): void {
        const t = this.now();
        this.sweep(t);
        this.map.set(key, { v, exp: t + this.ttlMs });
    }

    private sweep(t: number): void {
        if (this.map.size < 1024) return;
        if (t - this.lastSweep < this.ttlMs) return; // throttle the O(n) scan (Build 15/16 lesson)
        this.lastSweep = t;
        for (const e of this.map) if (t > e[1].exp) this.map.delete(e[0]);
    }

    size(): number { return this.map.size; }
}

/**
 * Stable content hash of a create input → the Idempotency-Key. Djb2 (no crypto →
 * RN-safe); collision-resistance-lite is fine because the server also scopes by
 * tenantId and the window is a short TTL.
 */
export function idempotencyKeyFor(input: unknown): string {
    const s = JSON.stringify(input) ?? '';
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    // second pass over length + a rotated seed lowers accidental collision odds
    let h2 = 52711;
    for (let i = s.length - 1; i >= 0; i--) h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) >>> 0;
    return `${h.toString(36)}${h2.toString(36)}`;
}

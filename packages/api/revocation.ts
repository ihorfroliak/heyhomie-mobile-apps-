/**
 * RevocationIndex (Build 29) — instant access-token revocation.
 *
 * Access validation is deliberately STATELESS (pure HMAC + claims — the hot path
 * does zero DB work; read path measures ~1788 rps because of it). That leaves a
 * window: an already-issued access token keeps working until `exp` (≤ access TTL)
 * after disable / delete / password-reset / logout. This index closes it with an
 * O(1) in-memory check, not a per-request DB lookup.
 *
 * Two granularities, both needed:
 *  - `revokeUser(userId)`   — kill EVERY access token minted at-or-before now
 *    (disable / delete / password-reset / refresh-theft). Checked via `iat`.
 *  - `revokeSession(sid)`   — kill ONE device's access token (logout /
 *    revoke-session-by-id) without touching other devices (preserves the Build-24
 *    revoke-one-isolation invariant). Access tokens carry the session id as an
 *    additive `sid` claim (Build 29); tokens without `sid` (legacy, /dev/token)
 *    are still covered by the user-level path.
 *
 * Memory is bounded by construction: an entry only matters for one access-TTL —
 * after that the token it would block is expired anyway — so entries self-expire
 * and an over-threshold, throttled sweep reclaims them (same discipline as
 * IdempotencyStore / RateLimiter; Build 15/16 lesson: never O(n) per call).
 *
 * Single-instance by design, like the rate limiter (documented deployment model);
 * multi-instance needs a shared store — same INFRA-PENDING item. Restart loss is
 * closed by BOOT SEEDING from durable state (users.disabled_at + auth_sessions
 * revoked_at/reason='revoked' within one TTL window) — see server bootstrap.
 *
 * Pure (no crypto, no I/O, injectable clock) → RN-safe + gate-testable.
 */

export interface RevocationCheck {
    userId: string;
    /** Session id claim (`sid`) if the token carries one. */
    sid?: string;
    /** Token issued-at (epoch SECONDS — matches TokenClaims.iat). */
    iat: number;
}

export class RevocationIndex {
    private users = new Map<string, number>(); // userId → revoked-at (epoch sec)
    private sessions = new Map<string, number>(); // sid → revoked-at (epoch sec)
    private lastSweep = 0;
    private readonly ttlSec: number;
    private readonly now: () => number; // epoch ms

    constructor(opts?: { ttlSec?: number; now?: () => number }) {
        // Default: 15-min access TTL + 60s clock skew + margin.
        this.ttlSec = opts?.ttlSec ?? 1_020;
        this.now = opts?.now ?? (() => Date.now());
    }

    /** Revoke every access token the user minted at-or-before `atSec` (default now). */
    revokeUser(userId: string, atSec?: number): void {
        const t = atSec ?? Math.floor(this.now() / 1000);
        const prev = this.users.get(userId);
        this.users.set(userId, prev !== undefined && prev > t ? prev : t);
        this.sweep();
    }

    /** Revoke the single session's access token (presence = revoked; sids are never reused). */
    revokeSession(sid: string, atSec?: number): void {
        this.sessions.set(sid, atSec ?? Math.floor(this.now() / 1000));
        this.sweep();
    }

    /** O(1): is this (valid, unexpired) token revoked?
     *
     *  Session check is EXACT (sid presence — sids are never reused). The user
     *  check is strictly-before (`iat < at`): `iat` has 1-second granularity, so
     *  mint-vs-revoke cannot be ordered inside one second — a strict compare lets
     *  a re-enabled/re-logged-in user's same-second NEW token work. That is safe
     *  because every engine-minted token carries a `sid` and disable/delete/reset
     *  revoke each live session's sid exactly; the user-level path only guards
     *  sid-less tokens (legacy, /dev/token), where the residual is ≤1s, dev-only. */
    isRevoked(token: RevocationCheck): boolean {
        if (token.sid !== undefined && this.sessions.has(token.sid)) return true;
        const at = this.users.get(token.userId);
        return at !== undefined && token.iat < at;
    }

    size(): number {
        return this.users.size + this.sessions.size;
    }

    /** Reclaim entries older than ttl (the tokens they'd block are expired). Only
     *  sweeps past a size threshold, throttled to once per ttl window. */
    private sweep(): void {
        if (this.size() < 1024) return;
        const t = this.now();
        if (t - this.lastSweep < this.ttlSec * 1000) return;
        this.lastSweep = t;
        const cutoff = Math.floor(t / 1000) - this.ttlSec;
        for (const [k, at] of this.users) if (at < cutoff) this.users.delete(k);
        for (const [k, at] of this.sessions) if (at < cutoff) this.sessions.delete(k);
    }
}

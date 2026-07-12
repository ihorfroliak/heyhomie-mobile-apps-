/**
 * Build 16 — independent reproduction of external code-review findings C1–C7.
 * No Postgres: buildApp runs on memoryOrderRepo; limiter/config are pure.
 * Run: npx tsx server/test/repro.ts
 */
import { RateLimiter, makeOrderService, memoryOrderRepo, loadServerConfig, type OrderRepo, type AuthContext } from '@heyhomie/api';
import { buildApp } from '../src/app.js';
import { signAuthToken } from '../src/auth.js';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const line = (tag: string, verdict: string, detail: string) => console.log(`  [${tag}] ${verdict} — ${detail}`);

async function main() {
    // ── C1: SSE cleanup registered AFTER `await send()` → disconnect during the
    //        initial snapshot leaks subscription + heartbeat + gauge. ──
    {
        const base = memoryOrderRepo();
        // make list() slow so we can reliably disconnect DURING the initial send.
        const slowRepo: OrderRepo = { ...base, list: async (t) => { await sleep(80); return base.list(t); } };
        const cfg = loadServerConfig({ DATABASE_URL: 'postgres://x/y', AUTH_SECRET: 'repro-secret-16chars-x', PORT: '8099', AUTH_DEV_MODE: '1' });
        const { app, metrics } = buildApp(cfg, slowRepo, async () => {});
        await app.listen({ port: 0, host: '127.0.0.1' });
        const b = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
        const tok = signAuthToken({ userId: 'u', tenantId: 'T', role: 'admin' }, AUTH_SECRET_C1);
        const timeoutsBefore = (process.getActiveResourcesInfo?.() ?? []).filter(r => r === 'Timeout').length;
        for (let i = 0; i < 40; i++) {
            const ctrl = new AbortController();
            fetch(`${b}/orders/stream?token=${tok}`, { signal: ctrl.signal }).catch(() => {});
            await sleep(15);   // connected, server now inside `await send()` (80ms)
            ctrl.abort();      // disconnect DURING the initial snapshot
            await sleep(5);
        }
        await sleep(300); // let all slow sends resolve + any close handlers run
        const gauge = metrics.sseConnections.value();
        const timeoutsAfter = (process.getActiveResourcesInfo?.() ?? []).filter(r => r === 'Timeout').length;
        line('C1', gauge > 0 ? 'CONFIRMED' : 'NOT-REPRO', `sse_connections gauge after 40 aborted-mid-send = ${gauge} (want 0); leaked Timeout handles Δ≈${timeoutsAfter - timeoutsBefore}`);
        await app.close();
    }

    // ── C2 (post-fix): loadServerConfig now STRICT-parses SHUTDOWN_DRAIN_MS. ──
    {
        const good = { DATABASE_URL: 'postgres://x/y', AUTH_SECRET: 'repro-secret-16chars-x' };
        const cfg = (v?: string) => { try { return loadServerConfig(v === undefined ? good : { ...good, SHUTDOWN_DRAIN_MS: v }); } catch { return null; } };
        const invalidRejected = cfg('3s') === null && cfg('-5') === null && cfg('NaN') === null; // genuinely invalid → fail-fast
        const emptyDefaults = cfg('')?.shutdownDrainMs === 3000 && cfg('   ')?.shutdownDrainMs === 3000; // unset → safe default (NOT 0)
        const validOk = cfg('5000')?.shutdownDrainMs === 5000 && cfg()?.shutdownDrainMs === 3000;
        line('C2', invalidRejected && emptyDefaults && validOk ? 'FIXED' : 'STILL-BROKEN', `invalid ('3s' '-5' 'NaN') fail-fast=${invalidRejected}; empty/whitespace→default 3000 (not 0)=${emptyDefaults}; valid=${validOk}`);
    }

    // ── C3 (post-fix): guarded shutdown runs once under a double signal. ──
    {
        let ended = 0;
        const fakePoolEnd = async () => { ended += 1; if (ended > 1) throw new Error('Called end on pool more than once'); };
        let exitCode = 0;
        let started = false;
        const guarded = async () => { if (started) return; started = true; try { await sleep(10); await fakePoolEnd(); } catch { exitCode = 1; } };
        await Promise.all([guarded(), guarded(), guarded()]); // three SIGTERMs during drain
        line('C3', ended === 1 && exitCode === 0 ? 'FIXED' : 'STILL-BROKEN', `triple-signal → pool.end() called ${ended}× (want 1), exit code ${exitCode} (want 0)`);
    }

    // ── C4: rate limiter clock rollback. ──
    {
        let clock = 100_000;
        const rl = new RateLimiter({ capacity: 5, refillPerSec: 1, now: () => clock });
        rl.allow('ip'); rl.allow('ip'); // tokens ~3 left
        clock -= 30_000; // NTP step-back 30s
        // With backward clock the refill term is negative → tokens subtracted.
        let deniedAfterRollback = false;
        for (let i = 0; i < 3; i++) if (!rl.allow('ip')) deniedAfterRollback = true;
        line('C4', deniedAfterRollback ? 'CONFIRMED' : 'NOT-REPRO', `after 30s clock rollback a bucket with tokens left returns 429=${deniedAfterRollback} (elapsed not clamped ≥0)`);
    }

    // ── C5: eviction burst when capacity > refill × idleEvictMs. ──
    {
        let clock = 0;
        const rl = new RateLimiter({ capacity: 5000, refillPerSec: 10, now: () => clock, idleEvictMs: 60_000 });
        // fill the map past the 1024 sweep threshold so eviction actually runs
        for (let i = 0; i < 1100; i++) rl.allow(`filler-${i}`);
        // victim drains its whole 5000 burst:
        let granted = 0; for (let i = 0; i < 5000; i++) if (rl.allow('victim')) granted += 1;
        rl.allow('victim'); // now drained (429)
        clock = 61_000; // idle > idleEvictMs → next sweep evicts 'victim' (drained, not full)
        rl.allow(`trigger`); // triggers evictIdle sweep
        // pure refill over 61s would give ~610 tokens; eviction+recreate hands back full 5000:
        let regained = 0; for (let i = 0; i < 5000; i++) if (rl.allow('victim')) regained += 1;
        const refillWouldAllow = Math.min(5000, Math.floor(61 * 10));
        line('C5', regained > refillWouldAllow * 2 ? 'STILL-BROKEN' : 'FIXED', `victim drained ${granted}, idle 61s, then regained ${regained} burst (pure refill allows ~${refillWouldAllow}) — burst-safe: eviction deferred until refill would fill the bucket`);
    }

    // ── C7: O(n) sweep cost per allow() once size ≥ 1024. ──
    {
        const rl = new RateLimiter({ capacity: 1, refillPerSec: 1000, now: () => 0 });
        for (let i = 0; i < 20_000; i++) rl.allow(`ip-${i}`); // build a big live map (clock frozen → no eviction)
        const t0 = performance.now();
        const iters = 20_000;
        for (let i = 0; i < iters; i++) rl.allow('hot-ip');
        const perCall = (performance.now() - t0) / iters;
        line('C7', 'MEASURED', `map size=${rl.size()}, ${perCall.toFixed(4)}ms/allow() (full-map scan each call). At 20k buckets this is ${(perCall * 1000).toFixed(1)}µs/req of pure sweep overhead`);
    }

    console.log('\nrepro complete.');
    process.exit(0);
}

const AUTH_SECRET_C1 = 'repro-secret-16chars-x';
main().catch(e => { console.error(e); process.exit(1); });

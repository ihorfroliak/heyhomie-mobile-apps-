/**
 * Build 14 — operations readiness. Rolling-deploy (two instances, shared pg) and
 * long-running leak soak, measured against real Postgres. Evidence tool.
 * Run: npx tsx server/test/ops.ts
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { loadServerConfig } from '@heyhomie/api';
import { makePool, initSchema } from '../src/db.js';
import { pgOrderRepo } from '../src/pgRepo.js';
import { buildApp } from '../src/app.js';
import { signAuthToken } from '../src/auth.js';

const PG_URL = process.env.PG_URL ?? 'postgres://postgres:postgres@localhost:5434/heyhomie';
const AUTH_SECRET = 'ops-test-secret-16chars-x';
const tok = signAuthToken({ userId: 'ops', tenantId: 'O1', role: 'admin' }, AUTH_SECRET);
const H = { authorization: `Bearer ${tok}`, 'content-type': 'application/json' };
const body = JSON.stringify({ contact: { phone: '600100200' }, cityId: 'krakow', serviceId: 'standard_cleaning' });

async function boot(pool: ReturnType<typeof makePool>) {
    const cfg = loadServerConfig({ DATABASE_URL: PG_URL, AUTH_SECRET, PORT: '8098', AUTH_DEV_MODE: '1', RATE_CAPACITY: '100000000', RATE_REFILL: '100000000' });
    const { app, beginShutdown } = buildApp(cfg, pgOrderRepo(pool), async () => { await pool.query('SELECT 1'); });
    await app.listen({ port: 0, host: '127.0.0.1' });
    return { app, beginShutdown, base: `http://127.0.0.1:${(app.server.address() as { port: number }).port}` };
}

async function main() {
    const poolA = makePool(PG_URL);
    await poolA.query('DROP TABLE IF EXISTS orders'); await poolA.query('DROP TABLE IF EXISTS schema_migrations'); await poolA.query('DROP TYPE IF EXISTS order_status');
    await initSchema(poolA);

    // ── PHASE 2 — rolling deployment (A serving → B joins → A drains) ──
    console.log('=== PHASE 2 — rolling deployment (two instances, shared pg) ===');
    const A = await boot(poolA);
    const created: string[] = [];
    let lost = 0;
    // steady traffic on A
    for (let i = 0; i < 50; i++) { const r = await (await fetch(`${A.base}/orders`, { method: 'POST', headers: H, body })).json() as { draft: { id: string } }; created.push(r.draft.id); }
    // B starts, becomes ready
    const poolB = makePool(PG_URL);
    const B = await boot(poolB);
    const bReady = (await fetch(`${B.base}/health/ready`)).status === 200;
    console.log(`  instance B readiness healthy: ${bReady ? 'YES' : 'NO'}`);
    // a create made on A must be immediately readable on B (shared truth)
    const probe = created[created.length - 1];
    const onB = (await (await fetch(`${B.base}/orders/${probe}`, { headers: H })).json() as { id?: string }).id === probe;
    console.log(`  A's write readable on B: ${onB ? 'YES' : 'NO'}`);
    // traffic switches to B; drain A gracefully mid-flight
    // Real k8s shutdown sequence: flip readiness → LB drains → then close.
    const inflight = fetch(`${A.base}/orders`, { method: 'POST', headers: H, body }).then(async r => { const j = await r.json() as { draft?: { id: string } }; if (j.draft) created.push(j.draft.id); else lost++; }).catch(() => lost++);
    A.beginShutdown();
    const readyDuringDrain = (await fetch(`${A.base}/health/ready`)).status;
    console.log(`  A readiness after beginShutdown: ${readyDuringDrain} (503 = LB stops routing)`);
    await new Promise(r => setTimeout(r, 100)); // drain window: in-flight finishes before close
    await A.app.close();
    await inflight;
    for (let i = 0; i < 50; i++) { const r = await (await fetch(`${B.base}/orders`, { method: 'POST', headers: H, body })).json() as { draft: { id: string } }; created.push(r.draft.id); }
    // consistency: every acknowledged create is present, no dupes
    const total = (await poolB.query(`SELECT count(*)::int AS c, count(DISTINCT id)::int AS d FROM orders WHERE tenant_id='O1'`)).rows[0];
    console.log(`  acknowledged creates=${created.length}, rows in pg=${total.c}, distinct=${total.d}, in-flight lost=${lost}`);
    const noLoss = lost === 0, noDup = total.c === total.d, persisted = total.c >= created.length;
    console.log(`  zero request loss: ${noLoss ? 'YES' : 'NO'} · zero duplicate writes: ${noDup ? 'YES' : 'NO'} · all acks persisted: ${persisted ? 'YES' : 'NO'}`);
    // These are deterministic correctness invariants of a rolling deploy — a CI
    // gate must FAIL (not just print NO) if any is violated. (Soak drift below
    // stays informational: memory/handle numbers are evidence, not pass/fail.)
    const opsFail: string[] = [];
    if (!noLoss) opsFail.push(`in-flight request lost during drain (lost=${lost})`);
    if (!noDup) opsFail.push(`duplicate writes (rows=${total.c} distinct=${total.d})`);
    if (!persisted) opsFail.push(`acknowledged create missing from pg (rows=${total.c} < acks=${created.length})`);
    if (!onB) opsFail.push("A's write not readable on B (shared truth broken)");
    await poolA.end();

    // ── PHASE 4 — long-running stability soak (~30s moderate load) ──
    console.log('\n=== PHASE 4 — long-running stability (~30s @ 20 concurrent) ===');
    const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
    const samples: { t: number; rss: number; handles: number; poolTot: number; loopMean: number }[] = [];
    let stop = false;
    const worker = async () => {
        while (!stop) {
            try {
                const r = Math.random();
                if (r < 0.7) await fetch(`${B.base}/orders/${created[Math.floor(Math.random() * created.length)]}`, { headers: H });
                else if (r < 0.9) await fetch(`${B.base}/orders`, { headers: H });
                else await fetch(`${B.base}/orders`, { method: 'POST', headers: H, body });
            } catch { /* transient — keep soaking */ }
        }
    };
    const workers = Array.from({ length: 20 }, worker);
    const t0 = Date.now();
    const sampler = setInterval(() => {
        const p = poolB as unknown as { totalCount: number };
        samples.push({ t: Math.round((Date.now() - t0) / 1000), rss: Math.round(process.memoryUsage().rss / 1048576), handles: (process.getActiveResourcesInfo?.() ?? []).length, poolTot: p.totalCount, loopMean: +(loop.mean / 1e6).toFixed(2) });
    }, 5000);
    await new Promise(r => setTimeout(r, 30_000));
    stop = true; clearInterval(sampler); await Promise.all(workers); loop.disable();
    console.log('  t(s) | rss MB | activeHandles | pool | loopMean ms');
    for (const s of samples) console.log(`  ${String(s.t).padStart(4)} | ${String(s.rss).padStart(6)} | ${String(s.handles).padStart(13)} | ${String(s.poolTot).padStart(4)} | ${s.loopMean}`);
    const first = samples[0], last = samples[samples.length - 1];
    console.log(`  rss drift ${first.rss}→${last.rss}MB (Δ${last.rss - first.rss}); handles ${first.handles}→${last.handles}; pool ${first.poolTot}→${last.poolTot} (bounded ≤10)`);

    await B.app.close(); await poolB.end();
    if (opsFail.length) { console.log('\nOPS FAILED:'); opsFail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('\nops run complete — rolling-deploy invariants held.');
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

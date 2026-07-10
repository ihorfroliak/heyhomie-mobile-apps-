/**
 * Build 13 — performance / scalability / resilience measurement. Boots the REAL
 * buildApp over real Postgres and drives it with concurrent HTTP. Measures
 * latency distributions (p50/p95/p99), throughput, memory, event-loop delay,
 * pool utilization, EXPLAIN plans, SSE broadcast, and failure injection.
 * Evidence tool (not a pass/fail gate). Run: npx tsx server/test/load.ts
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { loadServerConfig } from '@heyhomie/api';
import { makePool, initSchema } from '../src/db.js';
import { pgOrderRepo } from '../src/pgRepo.js';
import { buildApp } from '../src/app.js';
import { signAuthToken } from '../src/auth.js';

const PG_URL = process.env.PG_URL ?? 'postgres://postgres:postgres@localhost:5434/heyhomie';
const pct = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stat = (arr: number[]) => ({ n: arr.length, avg: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2), p50: +pct(arr, 50).toFixed(2), p95: +pct(arr, 95).toFixed(2), p99: +pct(arr, 99).toFixed(2), max: +Math.max(...arr).toFixed(2) });

/** Run `total` tasks with at most `concurrency` in flight; return {latencies, errors, ms}. */
async function runLoad(task: () => Promise<boolean>, total: number, concurrency: number) {
    const lat: number[] = []; let errors = 0; let i = 0;
    const t0 = performance.now();
    const worker = async () => {
        while (i < total) {
            i++;
            const s = performance.now();
            try { (await task()) ? lat.push(performance.now() - s) : errors++; } catch { errors++; }
        }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    const ms = performance.now() - t0;
    return { lat, errors, ms, rps: Math.round((total / ms) * 1000) };
}

async function main() {
    const AUTH_SECRET = 'load-test-secret-16chars';
    // Rate limit raised out of the way — we're measuring the app, not the limiter.
    const config = loadServerConfig({ DATABASE_URL: PG_URL, AUTH_SECRET, PORT: '8097', AUTH_DEV_MODE: '1', RATE_CAPACITY: '100000000', RATE_REFILL: '100000000' });
    const pool = makePool(PG_URL);
    // clean slate
    await pool.query('DROP TABLE IF EXISTS orders'); await pool.query('DROP TABLE IF EXISTS schema_migrations'); await pool.query('DROP TYPE IF EXISTS order_status');
    await initSchema(pool); // run migrations before serving (index.ts does this in prod)
    const { app } = buildApp(config, pgOrderRepo(pool), async () => { await pool.query('SELECT 1'); });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const tok = signAuthToken({ userId: 'load', tenantId: 'L1', role: 'admin' }, AUTH_SECRET);
    const H = { authorization: `Bearer ${tok}`, 'content-type': 'application/json' };
    const createBody = JSON.stringify({ contact: { phone: '600100200' }, cityId: 'krakow', serviceId: 'standard_cleaning' });

    // seed ids for read/settle targets
    const ids: string[] = [];
    for (let k = 0; k < 200; k++) {
        const resp = await fetch(`${base}/orders`, { method: 'POST', headers: H, body: createBody });
        const r = await resp.json() as { draft?: { id: string } };
        if (!r.draft) { console.error(`seed create failed: status=${resp.status} body=${JSON.stringify(r)}`); process.exit(1); }
        ids.push(r.draft.id);
    }
    const rid = () => ids[Math.floor(Math.random() * ids.length)];

    console.log('\n=== PHASE 1 — mixed workload (70% read / 20% list / 10% create), 3000 req/stage ===');
    console.log('conc |   rps | avg   p50   p95   p99   max (ms) | errors | rss MB | loopDelay p99 ms | pool tot/idle/wait');
    const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
    for (const conc of [10, 50, 100, 250, 500]) {
        loop.reset();
        const mixed = async () => {
            const r = Math.random();
            const res = r < 0.7 ? await fetch(`${base}/orders/${rid()}`, { headers: H })
                : r < 0.9 ? await fetch(`${base}/orders`, { headers: H })
                    : await fetch(`${base}/orders`, { method: 'POST', headers: H, body: createBody });
            return res.status < 500;
        };
        const res = await runLoad(mixed, 3000, conc);
        const s = stat(res.lat);
        const mem = Math.round(process.memoryUsage().rss / 1048576);
        const p = pool as unknown as { totalCount: number; idleCount: number; waitingCount: number };
        console.log(`${String(conc).padStart(4)} | ${String(res.rps).padStart(5)} | ${String(s.avg).padStart(5)} ${String(s.p50).padStart(5)} ${String(s.p95).padStart(5)} ${String(s.p99).padStart(5)} ${String(s.max).padStart(5)} | ${String(res.errors).padStart(6)} | ${String(mem).padStart(6)} | ${String(+(loop.percentile(99) / 1e6).toFixed(2)).padStart(16)} | ${p.totalCount}/${p.idleCount}/${p.waitingCount}`);
    }
    loop.disable();

    console.log('\n=== per-op latency @ concurrency 50 (1000 req each) ===');
    const completedIds: string[] = [];
    for (let k = 0; k < 300; k++) { const r = await (await fetch(`${base}/orders`, { method: 'POST', headers: H, body: createBody })).json() as { draft: { id: string } }; await fetch(`${base}/orders/${r.draft.id}/complete`, { method: 'POST', headers: H, body: '{}' }); completedIds.push(r.draft.id); }
    let ci = 0;
    const ops: [string, () => Promise<boolean>, number][] = [
        ['read  ', async () => (await fetch(`${base}/orders/${rid()}`, { headers: H })).status < 500, 1000],
        ['list  ', async () => (await fetch(`${base}/orders`, { headers: H })).status < 500, 1000],
        ['create', async () => (await fetch(`${base}/orders`, { method: 'POST', headers: H, body: createBody })).status < 500, 1000],
        ['settle', async () => (await fetch(`${base}/orders/${completedIds[ci++ % completedIds.length]}/settle`, { method: 'POST', headers: H, body: '{}' })).status < 500, 300],
        ['cancel', async () => (await fetch(`${base}/orders/${rid()}/cancel`, { method: 'POST', headers: H, body: '{}' })).status < 500, 200],
    ];
    console.log('op     |   rps | avg   p50   p95   p99   max (ms)');
    for (const [name, fn, tot] of ops) { const r = await runLoad(fn, tot, 50); const s = stat(r.lat); console.log(`${name} | ${String(r.rps).padStart(5)} | ${String(s.avg).padStart(5)} ${String(s.p50).padStart(5)} ${String(s.p95).padStart(5)} ${String(s.p99).padStart(5)} ${String(s.max).padStart(5)}`); }

    console.log('\n=== PHASE 2 — EXPLAIN ANALYZE (after bulk-seeding 5000 rows) ===');
    // bulk seed for meaningful plans
    const values: string[] = [];
    for (let k = 0; k < 5000; k++) values.push(`('seed-${k}','L1',1,'confirmed',now(),now(),'{"payment":{"status":"awaiting_completion"}}')`);
    await pool.query(`INSERT INTO orders (id,tenant_id,version,status,created_at,updated_at,payload) VALUES ${values.join(',')}`);
    await pool.query('ANALYZE orders');
    const explain = async (label: string, sql: string, params: unknown[]) => {
        const r = await pool.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`, params);
        const plan = r.rows.map((x: { 'QUERY PLAN': string }) => x['QUERY PLAN']).join('\n');
        const scan = plan.includes('Index Scan') || plan.includes('Index Only') ? 'INDEX' : plan.includes('Seq Scan') ? 'SEQ' : '?';
        const tm = plan.match(/actual time=[\d.]+\.\.([\d.]+)/)?.[1];
        console.log(`  ${label}: ${scan} scan, ~${tm}ms`);
    };
    await explain('get by id+tenant  ', 'SELECT * FROM orders WHERE id=$1 AND tenant_id=$2', ['seed-100', 'L1']);
    await explain('list by tenant    ', 'SELECT * FROM orders WHERE tenant_id=$1 ORDER BY created_at', ['L1']);
    await explain('CAS update        ', "UPDATE orders SET version=version+1 WHERE id=$1 AND tenant_id=$2 AND version=$3", ['seed-100', 'L1', 1]);

    console.log('\n=== PHASE 5 — failure injection ===');
    // statement_timeout: a >10s query must be cancelled
    const t = performance.now(); let stErr = '';
    try { await pool.query('SELECT pg_sleep(11)'); } catch (e) { stErr = (e as { code?: string }).code ?? (e as Error).message; }
    console.log(`  statement_timeout: query cancelled after ${Math.round(performance.now() - t)}ms, code=${stErr} (57014 = query_canceled)`);
    // pool exhaustion: 25 concurrent 2s sleeps vs max 10 + connectionTimeout 5s
    let ok = 0, fail = 0;
    await Promise.all(Array.from({ length: 25 }, async () => { try { await pool.query('SELECT pg_sleep(2)'); ok++; } catch { fail++; } }));
    console.log(`  pool exhaustion (25 slow queries, max=10): ${ok} ok, ${fail} rejected gracefully (no hang)`);

    console.log('\n=== PHASE 3 — SSE broadcast (100 clients, 1 mutation) ===');
    const clients: { got: number; close: () => void }[] = [];
    const rssBefore = process.memoryUsage().rss;
    for (let c = 0; c < 100; c++) {
        const ctrl = new AbortController();
        const cl = { got: 0, close: () => ctrl.abort() };
        clients.push(cl);
        void (async () => {
            try {
                const res = await fetch(`${base}/orders/stream?token=${tok}`, { signal: ctrl.signal });
                const reader = (res.body as ReadableStream<Uint8Array>).getReader(); const dec = new TextDecoder(); let buf = '';
                for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let idx; while ((idx = buf.indexOf('\n\n')) >= 0) { const f = buf.slice(0, idx); buf = buf.slice(idx + 2); if (f.startsWith('data: ')) cl.got++; } }
            } catch { /* aborted */ }
        })();
    }
    await new Promise(r => setTimeout(r, 800)); // let all connect + receive initial frame
    const initialFrames = clients.reduce((a, c) => a + c.got, 0);
    const tB = performance.now();
    await fetch(`${base}/orders`, { method: 'POST', headers: H, body: createBody }); // 1 mutation → broadcast
    await new Promise(r => setTimeout(r, 800));
    const broadcastMs = performance.now() - tB;
    const afterFrames = clients.reduce((a, c) => a + c.got, 0);
    const rssAfter = process.memoryUsage().rss;
    console.log(`  100 SSE clients connected; initial frames=${initialFrames}; after 1 mutation +${afterFrames - initialFrames} frames in ~${Math.round(broadcastMs)}ms`);
    console.log(`  rss for 100 SSE clients: +${Math.round((rssAfter - rssBefore) / 1048576)}MB (~${Math.round((rssAfter - rssBefore) / 100 / 1024)}KB/client)`);
    clients.forEach(c => c.close());

    console.log('\n=== PHASE 4 — multi-instance (shared pg) ===');
    const pool2 = makePool(PG_URL);
    const { app: app2 } = buildApp(config, pgOrderRepo(pool2), async () => { await pool2.query('SELECT 1'); });
    await app2.listen({ port: 0, host: '127.0.0.1' });
    const base2 = `http://127.0.0.1:${(app2.server.address() as { port: number }).port}`;
    const made = await (await fetch(`${base}/orders`, { method: 'POST', headers: H, body: createBody })).json() as { draft: { id: string } };
    const seenOnB = (await (await fetch(`${base2}/orders/${made.draft.id}`, { headers: H })).json() as { id?: string }).id === made.draft.id;
    console.log(`  create on instance A → readable on instance B (shared pg): ${seenOnB ? 'YES' : 'NO'}`);
    console.log(`  SSE cross-instance push (A mutation → B's SSE clients): NO — single-process subscribe; needs Postgres LISTEN/NOTIFY (documented blocker)`);
    await app2.close(); await pool2.end();

    console.log(`\n[resource] startup ~ measured earlier; idle rss now ${Math.round(process.memoryUsage().rss / 1048576)}MB`);
    await app.close(); await pool.end();
    console.log('\nload/perf run complete.');
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

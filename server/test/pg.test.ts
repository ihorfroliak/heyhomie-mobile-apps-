/**
 * Build 11 — PostgreSQL proof. Runs the REAL pgOrderRepo + orderService against
 * a live Postgres and asserts the SAME behaviour the memory repo guarantees:
 * tenant scoping, version CAS, exactly-once under 100-parallel, terminal
 * invariants, DB CHECK constraint, migration idempotency.
 *
 * Requires: postgres on PG_URL (default postgres://postgres:postgres@localhost:5434/heyhomie)
 * Run: npx tsx server/test/pg.test.ts
 */
import { makeOrderService, ConflictError, loadServerConfig, type AuthContext, type ServerOrder } from '@heyhomie/api';
import { makePool, initSchema } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { pgOrderRepo } from '../src/pgRepo.js';
import { buildApp } from '../src/app.js';
import { signAuthToken } from '../src/auth.js';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const PG_URL = process.env.PG_URL ?? 'postgres://postgres:postgres@localhost:5434/heyhomie';
const authA: AuthContext = { userId: 'a', tenantId: 'T1', role: 'admin' };
const authB: AuthContext = { userId: 'b', tenantId: 'T2', role: 'member' };

async function main() {
    const pool = makePool(PG_URL);
    await pool.query('DROP TABLE IF EXISTS password_resets'); // clean slate (test db only)
    await pool.query('DROP TABLE IF EXISTS invitations');
    await pool.query('DROP TABLE IF EXISTS auth_sessions');
    await pool.query('DROP TABLE IF EXISTS users');
    await pool.query('DROP TABLE IF EXISTS orders');
    await pool.query('DROP TABLE IF EXISTS schema_migrations');
    await pool.query('DROP TYPE IF EXISTS order_status');

    // ── H4/PHASE 3: versioned migrations — TWO concurrent starts on an empty DB.
    // The advisory lock must let exactly one instance apply all migrations while
    // the other waits and then applies nothing.
    const tMig = Date.now();
    const [runX, runY] = await Promise.all([runMigrations(pool), runMigrations(pool)]);
    console.log(`  [perf] concurrent migration on empty db: ${Date.now() - tMig}ms`);
    eq('exactly 7 migrations applied across both starts', runX.length + runY.length, 7);
    ok('one instance migrated, the other waited (0)', (runX.length === 7 && runY.length === 0) || (runY.length === 7 && runX.length === 0));
    const hist = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    eq('migration history records each version once', hist.rows.map((r: { version: number }) => Number(r.version)), [1, 2, 3, 4, 5, 6, 7]);
    eq('re-running migrations is a no-op (idempotent)', (await runMigrations(pool)).length, 0);
    await initSchema(pool); // the callers' entrypoint — also idempotent
    const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'`);
    eq('schema columns correct', cols.rows.map((r: { column_name: string }) => r.column_name).sort(), ['created_at', 'id', 'payload', 'status', 'tenant_id', 'updated_at', 'version']);
    const idx = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'orders'`);
    ok('tenant + tenant/created indexes exist', idx.rows.some((r: { indexname: string }) => r.indexname === 'orders_tenant_idx') && idx.rows.some((r: { indexname: string }) => r.indexname === 'orders_tenant_created_idx'));

    // ── H2: pool statement_timeout actually applied on our connections ──
    eq('pool enforces statement_timeout=10s', (await pool.query(`SELECT current_setting('statement_timeout') AS t`)).rows[0].t, '10s');

    const repo = pgOrderRepo(pool);
    const svc = makeOrderService(repo);
    const create = async (auth: AuthContext) => (await svc.create({ contact: { phone: '600' }, cityId: 'k', serviceId: 's' }, auth)).draft.id;

    // ── PHASE 2: CAS semantics identical to memory repo ──
    const id1 = await create(authA);
    const o1 = await repo.get(id1, 'T1') as ServerOrder;
    eq('insert starts at version 1', o1.version, 1);
    const upd = await repo.update({ ...o1, status: 'canceled' }, 1);
    eq('CAS update bumps version', upd.version, 2);
    let conflicted = false;
    try { await repo.update({ ...o1, status: 'confirmed' }, 1); } catch (e) { conflicted = e instanceof ConflictError; }
    ok('stale version → ConflictError (CAS)', conflicted);
    let dup = false;
    try { await repo.insert(o1); } catch { dup = true; }
    ok('duplicate PK insert rejected', dup);

    // tenant scoping in SQL
    eq('cross-tenant get → undefined', await repo.get(id1, 'T2'), undefined);
    let crossDenied = false;
    try { await svc.cancel(id1, authB); } catch { crossDenied = true; }
    ok('cross-tenant mutate → denied', crossDenied);
    const idB = await create(authB);
    ok('lists tenant-scoped', (await repo.list('T1')).every(o => o.tenantId === 'T1') && (await repo.list('T2')).some(o => o.id === idB));

    // DB CHECK constraint: paid+canceled row rejected AT THE DATABASE
    const paidPayload = { ...o1.payload, payment: { ...o1.payload.payment, status: 'paid' } };
    let checkBlocked = false;
    try {
        await pool.query(
            `INSERT INTO orders (id, tenant_id, version, status, created_at, updated_at, payload) VALUES ($1,$2,1,'canceled',now(),now(),$3)`,
            ['bad-row', 'T1', JSON.stringify(paidPayload)],
        );
    } catch { checkBlocked = true; }
    ok('DB CHECK rejects canceled+paid row', checkBlocked);

    // ── PHASE 5: high-parallel workloads on real Postgres ──
    const dueId = await create(authA);
    await svc.complete(dueId, authA, '2025-06-01T14:00:00.000Z');
    const t100 = Date.now();
    await Promise.all(Array.from({ length: 100 }, () => svc.settle(dueId, authA)));
    console.log(`  [perf] 100 parallel settle on pg: ${Date.now() - t100}ms`);
    const settled = await repo.get(dueId, 'T1') as ServerOrder;
    eq('100 parallel settle → paid exactly once (v3)', [settled.status, settled.version], ['paid', 3]);

    const cancelId = await create(authA);
    await Promise.all(Array.from({ length: 100 }, () => svc.cancel(cancelId, authA)));
    const canceled = await repo.get(cancelId, 'T1') as ServerOrder;
    eq('100 parallel cancel → exactly one write (v2)', [canceled.status, canceled.version], ['canceled', 2]);

    // mixed settle/cancel race → terminal XOR, never both
    let badMix = 0;
    for (let r = 0; r < 10; r++) {
        const mid = await create(authA);
        await svc.complete(mid, authA, '2025-06-01T14:00:00.000Z');
        await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? svc.cancel(mid, authA) : svc.settle(mid, authA))));
        const o = await repo.get(mid, 'T1') as ServerOrder;
        if (o.status === 'canceled' && o.payload.payment.status === 'paid') badMix += 1;
        if (!['paid', 'canceled'].includes(o.status)) badMix += 1;
    }
    eq('mixed settle/cancel race on pg: never canceled+paid (10 rounds)', badMix, 0);

    // parallel creates → all rows present, unique ids
    const ids = await Promise.all(Array.from({ length: 50 }, () => create(authA)));
    eq('50 parallel creates → 50 unique ids', new Set(ids).size, 50);

    // ── rollback behaviour: failed CAS leaves row untouched ──
    const before = await repo.get(id1, 'T1') as ServerOrder;
    try { await repo.update({ ...before, status: 'confirmed' }, 999); } catch { /* expected */ }
    const afterFail = await repo.get(id1, 'T1') as ServerOrder;
    eq('failed CAS leaves row unchanged', [afterFail.status, afterFail.version], [before.status, before.version]);

    // ── PHASE 4: durability across a process "crash" — a fresh connection sees committed data ──
    {
        const p2 = makePool(PG_URL);
        const r2 = pgOrderRepo(p2);
        const survived = await r2.get(dueId, 'T1');
        eq('paid order survives a fresh connection (durable)', survived?.status, 'paid');
        ok('no orphan/duplicate rows after concurrency', (await r2.list('T1')).filter(o => o.id === dueId).length === 1);
        await p2.end();
    }

    // ── PHASE 6: full HTTP contract over REAL Postgres (repo swapped, HTTP/SSE layer unchanged) ──
    {
        const AUTH_SECRET = 'pg-http-secret-16chars-xx';
        const config = loadServerConfig({ DATABASE_URL: PG_URL, AUTH_SECRET, PORT: '8093', AUTH_DEV_MODE: '1' });
        const appPool = makePool(PG_URL);
        const { app } = buildApp(config, pgOrderRepo(appPool), async () => { await appPool.query('SELECT 1'); });
        await app.listen({ port: 0, host: '127.0.0.1' });
        const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
        const tokA = signAuthToken({ userId: 'a', tenantId: 'H1', role: 'admin' }, AUTH_SECRET);
        const tokB = signAuthToken({ userId: 'b', tenantId: 'H2', role: 'member' }, AUTH_SECRET);
        const hA = { authorization: `Bearer ${tokA}`, 'content-type': 'application/json' };

        eq('ready probe sees real pg (200)', (await fetch(`${base}/health/ready`)).status, 200);
        eq('no token → 401 canonical', ((await (await fetch(`${base}/orders`)).json()) as { code: string }).code, 'UNAUTHENTICATED');
        const created = (await (await fetch(`${base}/orders`, { method: 'POST', headers: hA, body: JSON.stringify({ contact: { phone: '600100200' }, cityId: 'krakow', serviceId: 'standard_cleaning' }) })).json()) as { draft: { id: string } };
        ok('HTTP create over pg returns an order', !!created.draft.id);
        const listA = (await (await fetch(`${base}/orders`, { headers: hA })).json()) as { id: string }[];
        ok('HTTP list over pg is tenant-scoped (H1 sees own)', listA.some(o => o.id === created.draft.id));
        eq('tenant H2 sees nothing over pg', ((await (await fetch(`${base}/orders`, { headers: { authorization: `Bearer ${tokB}` } })).json()) as unknown[]).length, 0);
        const nf = await fetch(`${base}/orders/nope`, { headers: hA });
        eq('missing → 404 canonical over pg', [nf.status, ((await nf.json()) as { code: string }).code], [404, 'NOT_FOUND']);
        const metricsText = await (await fetch(`${base}/metrics`)).text();
        ok('/metrics live over pg (mutations + requests)', metricsText.includes('order_mutations_total{') && metricsText.includes('http_requests_total{'));
        await app.close();
        await appPool.end();
    }

    // ── H1: trustProxy → rate limiter keys on the REAL client IP (X-Forwarded-For) ──
    {
        const cfg = loadServerConfig({ DATABASE_URL: PG_URL, AUTH_SECRET: 'h1-rate-secret-16chars', PORT: '8094', TRUST_PROXY: '1', RATE_CAPACITY: '2', RATE_REFILL: '1' });
        const lp = makePool(PG_URL);
        const { app } = buildApp(cfg, pgOrderRepo(lp), async () => { await lp.query('SELECT 1'); });
        await app.listen({ port: 0, host: '127.0.0.1' });
        const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
        // Same client IP, capacity 2 → 3rd request throttled (limiter runs before auth → 429 not 401).
        const sameIp = [];
        for (let i = 0; i < 4; i++) sameIp.push((await fetch(`${base}/orders`, { headers: { 'x-forwarded-for': '203.0.113.7' } })).status);
        ok('same forwarded IP is rate-limited (429 appears)', sameIp.includes(429));
        // Distinct forwarded IPs → distinct buckets → none throttled (all reach auth → 401).
        const distinct = [];
        for (let i = 0; i < 4; i++) distinct.push((await fetch(`${base}/orders`, { headers: { 'x-forwarded-for': `198.51.100.${i}` } })).status);
        ok('distinct forwarded IPs get separate buckets (no 429)', !distinct.includes(429) && distinct.every(s => s === 401));
        await app.close();
        await lp.end();
    }

    // ── Build 18: production auth on REAL Postgres (users + revocable sessions) ──
    {
        const { pgAuthRepo } = await import('../src/pgAuthRepo.js');
        const { makeAuthCrypto } = await import('../src/authCrypto.js');
        const { makeAuthService } = await import('@heyhomie/api');
        const authRepo = pgAuthRepo(pool);
        const svc = makeAuthService(authRepo, makeAuthCrypto('pg-auth-secret-16chars-xx', 900), { refreshTtlSec: 3600 });

        const reg = await svc.register({ email: 'owner@pg.pl', password: 'Sup3rSecret!' });
        ok('register persists a user + issues tokens', !!reg.accessToken && !!reg.refreshToken);
        // password stored hashed (scrypt), never plaintext
        const urow = await pool.query('SELECT password_hash, tenant_id FROM users WHERE email = $1', ['owner@pg.pl']);
        ok('password stored hashed (not plaintext)', urow.rows[0].password_hash !== 'Sup3rSecret!' && urow.rows[0].password_hash.length > 20);

        // DB-level unique email
        let dupBlocked = false;
        try { await svc.register({ email: 'owner@pg.pl', password: 'Another1!' }); } catch { dupBlocked = true; }
        ok('duplicate email rejected (DB unique + ConflictError)', dupBlocked);

        // login + refresh rotation persists (old row revoked, new row live)
        const login = await svc.login({ email: 'owner@pg.pl', password: 'Sup3rSecret!' });
        const rot = await svc.refresh(login.refreshToken);
        ok('refresh rotates over pg', rot.refreshToken !== login.refreshToken);
        const revokedCount = await pool.query('SELECT count(*) FROM auth_sessions WHERE revoked_at IS NOT NULL');
        ok('rotated session marked revoked in DB', Number(revokedCount.rows[0].count) >= 1);

        // reuse detection revokes the family, durable across a fresh connection
        let reuseRejected = false;
        try { await svc.refresh(login.refreshToken); } catch { reuseRejected = true; }
        ok('reused refresh rejected over pg', reuseRejected);
        {
            const p2 = makePool(PG_URL);
            const svc2 = makeAuthService(pgAuthRepo(p2), makeAuthCrypto('pg-auth-secret-16chars-xx', 900), { refreshTtlSec: 3600 });
            let familyDead = false;
            try { await svc2.refresh(rot.refreshToken); } catch { familyDead = true; }
            ok('theft-revoked family stays dead on a fresh connection (durable)', familyDead);
            await p2.end();
        }

        // ── Build 23: member invite over real pg (persist + accept + single-use) ──
        const owner = reg.identity; // role 'owner' from register
        const inv = await svc.invite({ email: 'member@pg.pl', role: 'worker' }, owner);
        const invRow = await pool.query('SELECT tenant_id, role, accepted_at, token_hash FROM invitations WHERE id = $1', [inv.id]);
        ok('invitation persisted (pending, tenant-bound, hashed token)', invRow.rows[0].tenant_id === owner.tenantId && invRow.rows[0].accepted_at === null && invRow.rows[0].token_hash !== inv.inviteToken);
        const member = await svc.accept({ inviteToken: inv.inviteToken, password: 'MemberPass1!' });
        ok('accept creates a member JOINED to the owner tenant over pg', member.identity.role === 'worker' && member.identity.tenantId === owner.tenantId);
        const accRow = await pool.query('SELECT accepted_at FROM invitations WHERE id = $1', [inv.id]);
        ok('invitation marked accepted in DB (single-use)', accRow.rows[0].accepted_at !== null);
        let inviteReuse = false;
        try { await svc.accept({ inviteToken: inv.inviteToken, password: 'MemberPass1!' }); } catch { inviteReuse = true; }
        ok('reused invitation rejected over pg', inviteReuse);
        ok('invited member can log in over pg', (await svc.login({ email: 'member@pg.pl', password: 'MemberPass1!' })).identity.tenantId === owner.tenantId);

        // ── Build 24: auth operations over real pg ──
        // invitation management: list reflects DB status
        const list = await svc.listInvitations(owner);
        ok('listInvitations reflects accepted status over pg', list.find(i => i.email === 'member@pg.pl')?.status === 'accepted');
        // sessions: two logins → two live rows; revoke one → the other still refreshes
        const a = await svc.login({ email: 'member@pg.pl', password: 'MemberPass1!', deviceLabel: 'A' });
        const b = await svc.login({ email: 'member@pg.pl', password: 'MemberPass1!', deviceLabel: 'B' });
        const memberId = a.identity.userId;
        const liveRows = await pool.query('SELECT count(*)::int AS c FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL', [memberId]);
        ok('multiple live sessions persisted over pg (>=2)', liveRows.rows[0].c >= 2);
        const sessA = (await svc.listSessions(a.identity)).find(s => s.deviceLabel === 'A');
        await svc.revokeSessionById(sessA!.id, a.identity);
        let aDead = false; try { await svc.refresh(a.refreshToken); } catch { aDead = true; }
        ok('revoked session refresh rejected over pg', aDead);
        ok('the other session still refreshes over pg (revoke-one isolation)', !!(await svc.refresh(b.refreshToken)).accessToken);
        // password reset over pg: reset → old sessions revoked → old pw dead → new pw works
        const rr = await svc.requestPasswordReset({ email: 'member@pg.pl' });
        await svc.confirmPasswordReset({ resetToken: rr!.resetToken, password: 'MemberNew1!' });
        const usedRow = await pool.query('SELECT used_at FROM password_resets WHERE user_id = $1', [memberId]);
        ok('password_reset marked used in DB (single-use)', usedRow.rows[0].used_at !== null);
        let oldPwDead = false; try { await svc.login({ email: 'member@pg.pl', password: 'MemberPass1!' }); } catch { oldPwDead = true; }
        ok('old password rejected after reset over pg', oldPwDead);
        ok('new password works after reset over pg', (await svc.login({ email: 'member@pg.pl', password: 'MemberNew1!' })).identity.tenantId === owner.tenantId);
    }

    await pool.end();
    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All PostgreSQL tests passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

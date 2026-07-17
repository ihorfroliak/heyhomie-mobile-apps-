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
    await pool.query('DROP TABLE IF EXISTS audit_log'); // clean slate (test db only)
    await pool.query('DROP TABLE IF EXISTS password_resets');
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
    eq('exactly 9 migrations applied across both starts', runX.length + runY.length, 9);
    ok('one instance migrated, the other waited (0)', (runX.length === 9 && runY.length === 0) || (runY.length === 9 && runX.length === 0));
    const hist = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    eq('migration history records each version once', hist.rows.map((r: { version: number }) => Number(r.version)), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
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

        // ── Build 25: account lifecycle over real pg ──
        const li = await svc.invite({ email: 'life@pg.pl', role: 'worker' }, owner);
        const lifeMember = await svc.accept({ inviteToken: li.inviteToken, password: 'LifePass1!' });
        const lifeId = lifeMember.identity.userId;
        await svc.disableUser(lifeId, owner);
        ok('disabled_at persisted over pg', (await pool.query('SELECT disabled_at FROM users WHERE id = $1', [lifeId])).rows[0].disabled_at !== null);
        ok('disable revoked all sessions over pg', (await pool.query('SELECT count(*)::int AS c FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL', [lifeId])).rows[0].c === 0);
        let dLogin = false; try { await svc.login({ email: 'life@pg.pl', password: 'LifePass1!' }); } catch { dLogin = true; }
        ok('disabled login rejected over pg', dLogin);
        await svc.enableUser(lifeId, owner);
        ok('enabled login works over pg', (await svc.login({ email: 'life@pg.pl', password: 'LifePass1!' })).identity.userId === lifeId);
        await svc.deleteUser(lifeId, owner);
        ok('deleted user removed from pg', (await pool.query('SELECT count(*)::int AS c FROM users WHERE id = $1', [lifeId])).rows[0].c === 0);
        ok('deleted user sessions cascaded from pg (FK ON DELETE CASCADE)', (await pool.query('SELECT count(*)::int AS c FROM auth_sessions WHERE user_id = $1', [lifeId])).rows[0].c === 0);
        ok('email freed after delete over pg', (await svc.register({ email: 'life@pg.pl', password: 'Fresh12345' })).identity.role === 'owner');

        // ── Build 26: NotificationPort delivery over real pg (HTTP + spy port) ──
        {
            const sent: string[] = [];
            const spyPort = {
                async sendInvitation(m: { email: string }) { sent.push(`invitation:${m.email}`); },
                async sendPasswordReset(m: { email: string }) { sent.push(`password_reset:${m.email}`); },
            };
            const jsonH = { 'content-type': 'application/json' };
            const cfg = loadServerConfig({ DATABASE_URL: PG_URL, AUTH_SECRET: 'pg-notif-secret-16chars', PORT: '8096', AUTH_DEV_MODE: '1' });
            const np = makePool(PG_URL);
            const { app } = buildApp(cfg, pgOrderRepo(np), async () => { await np.query('SELECT 1'); }, { repo: pgAuthRepo(np), crypto: makeAuthCrypto('pg-notif-secret-16chars', 900), notifications: spyPort });
            await app.listen({ port: 0, host: '127.0.0.1' });
            const nb = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
            const reg = await (await fetch(`${nb}/auth/register`, { method: 'POST', headers: jsonH, body: JSON.stringify({ email: 'notif@pg.pl', password: 'NotifOwner1!' }) })).json() as { accessToken: string };
            await fetch(`${nb}/auth/invite`, { method: 'POST', headers: { ...jsonH, authorization: `Bearer ${reg.accessToken}` }, body: JSON.stringify({ email: 'notif-w@pg.pl', role: 'worker' }) });
            await fetch(`${nb}/auth/password-reset/request`, { method: 'POST', headers: jsonH, body: JSON.stringify({ email: 'notif@pg.pl' }) });
            ok('invite delivery fired via the port over pg', sent.includes('invitation:notif-w@pg.pl'));
            ok('password-reset delivery fired via the port over pg', sent.includes('password_reset:notif@pg.pl'));
            await app.close(); await np.end();
        }

        // ── Build 27: audit trail persisted over real pg (HTTP + pgAuditPort) ──
        {
            const { pgAuditPort } = await import('../src/pgAuditPort.js');
            const jsonH = { 'content-type': 'application/json' };
            const cfg = loadServerConfig({ DATABASE_URL: PG_URL, AUTH_SECRET: 'pg-audit-secret-16chars', PORT: '8097', AUTH_DEV_MODE: '1' });
            const ap = makePool(PG_URL);
            const { app } = buildApp(cfg, pgOrderRepo(ap), async () => { await ap.query('SELECT 1'); }, { repo: pgAuthRepo(ap), crypto: makeAuthCrypto('pg-audit-secret-16chars', 900), audit: pgAuditPort(ap) });
            await app.listen({ port: 0, host: '127.0.0.1' });
            const ab = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
            const reg = await (await fetch(`${ab}/auth/register`, { method: 'POST', headers: jsonH, body: JSON.stringify({ email: 'audit@pg.pl', password: 'AuditOwner1!' }) })).json() as { accessToken: string };
            const H = { ...jsonH, authorization: `Bearer ${reg.accessToken}` };
            await fetch(`${ab}/auth/invite`, { method: 'POST', headers: H, body: JSON.stringify({ email: 'audit-w@pg.pl', role: 'worker' }) });
            const rows = await ap.query(`SELECT type, target_email FROM audit_log WHERE tenant_id = (SELECT tenant_id FROM users WHERE email='audit@pg.pl')`);
            ok('invite audit persisted to audit_log over pg', rows.rows.some((r: { type: string; target_email: string }) => r.type === 'member.invited' && r.target_email === 'audit-w@pg.pl'));
            const cols = await ap.query(`SELECT column_name FROM information_schema.columns WHERE table_name='audit_log'`);
            ok('audit_log schema has NO token/hash/password column', !cols.rows.some((r: { column_name: string }) => /token|hash|password|secret/i.test(r.column_name)));
            const auditResp = await (await fetch(`${ab}/auth/audit`, { headers: H })).json() as { events: { type: string }[] };
            ok('GET /auth/audit returns the trail over pg (no secrets)', auditResp.events.some(e => e.type === 'member.invited') && !/token|hash|password/i.test(JSON.stringify(auditResp)));
            await app.close(); await ap.end();
        }

        // ── Build 28: retention purge over real pg (expired removed, live kept) ──
        {
            const pu = await svc.register({ email: 'purge@pg.pl', password: 'PurgeOwn1!' });
            const uid = pu.identity.userId, tid = pu.identity.tenantId;
            const past = new Date(Date.now() - 3_600_000).toISOString();
            await pool.query(`INSERT INTO auth_sessions (id,user_id,tenant_id,role,refresh_hash,expires_at,created_at,last_used_at) VALUES ('exp-s',$1,$2,'worker','rh-exp',$3,$3,$3)`, [uid, tid, past]);
            await pool.query(`INSERT INTO invitations (id,tenant_id,email,role,token_hash,invited_by,expires_at,created_at) VALUES ('exp-i',$1,'e@x.co','worker','th-exp',$2,$3,$3)`, [tid, uid, past]);
            await pool.query(`INSERT INTO password_resets (id,user_id,email,token_hash,expires_at,created_at) VALUES ('exp-r',$1,'e@x.co','th-exp',$2,$2)`, [uid, past]);
            const res = await svc.purgeExpired();
            ok('purge removed expired session/invite/reset over pg', res.sessions >= 1 && res.invitations >= 1 && res.passwordResets >= 1);
            ok('expired session gone from pg', (await pool.query(`SELECT count(*)::int AS c FROM auth_sessions WHERE id='exp-s'`)).rows[0].c === 0);
            ok('expired invitation gone from pg', (await pool.query(`SELECT count(*)::int AS c FROM invitations WHERE id='exp-i'`)).rows[0].c === 0);
            ok('the live register session survived the purge over pg', (await pool.query(`SELECT count(*)::int AS c FROM auth_sessions WHERE user_id=$1 AND expires_at > now()`, [uid])).rows[0].c >= 1);
        }

        // ── Build 29: instant access revocation over real pg + restart seeding ──
        {
            const jsonH = { 'content-type': 'application/json' };
            const cfg = loadServerConfig({ DATABASE_URL: PG_URL, AUTH_SECRET: 'pg-rev-secret-16chars-x', PORT: '8099', AUTH_DEV_MODE: '1' });
            const rp = makePool(PG_URL);
            const mkApp = () => buildApp(cfg, pgOrderRepo(rp), async () => { await rp.query('SELECT 1'); }, { repo: pgAuthRepo(rp), crypto: makeAuthCrypto('pg-rev-secret-16chars-x', 900) });
            const b1 = mkApp();
            await b1.app.listen({ port: 0, host: '127.0.0.1' });
            const rb = `http://127.0.0.1:${(b1.app.server.address() as { port: number }).port}`;
            const own = await (await fetch(`${rb}/auth/register`, { method: 'POST', headers: jsonH, body: JSON.stringify({ email: 'rev@pg.pl', password: 'RevOwner12!' }) })).json() as { accessToken: string };
            const oh = { ...jsonH, authorization: `Bearer ${own.accessToken}` };
            const inv = await (await fetch(`${rb}/auth/invite`, { method: 'POST', headers: oh, body: JSON.stringify({ email: 'rev-w@pg.pl', role: 'worker' }) })).json() as { inviteToken: string };
            const mem = await (await fetch(`${rb}/auth/accept-invite`, { method: 'POST', headers: jsonH, body: JSON.stringify({ inviteToken: inv.inviteToken, password: 'RevMember1!' }) })).json() as { accessToken: string };
            const memGet = async (base2: string) => (await fetch(`${base2}/orders`, { headers: { authorization: `Bearer ${mem.accessToken}` } })).status;
            ok('member access works over pg (200)', (await memGet(rb)) === 200);
            const memberId = (await rp.query(`SELECT id FROM users WHERE email='rev-w@pg.pl'`)).rows[0].id as string;
            // NB: body-less POST — no json content-type (Fastify 400s an empty JSON body)
            const dis = await fetch(`${rb}/auth/users/${memberId}/disable`, { method: 'POST', headers: { authorization: `Bearer ${own.accessToken}` } });
            ok('disable over pg returned 204', dis.status === 204);
            ok('disable → unexpired access token IMMEDIATELY 401 over pg', (await memGet(rb)) === 401);

            // restart: a fresh app (empty index) seeded from durable state — the
            // exact bootstrap procedure — must keep rejecting the old token.
            const seedSrc = await pgAuthRepo(rp).listRecentRevocations(new Date(Date.now() - 1_020_000).toISOString());
            ok('listRecentRevocations surfaces the disabled user + revoked sessions', seedSrc.users.some(u => u.id === memberId) && seedSrc.sessions.length >= 1);
            const b2 = mkApp();
            for (const u of seedSrc.users) b2.revocations!.revokeUser(u.id, Math.floor(new Date(u.at).getTime() / 1000));
            for (const s of seedSrc.sessions) b2.revocations!.revokeSession(s.id, Math.floor(new Date(s.at).getTime() / 1000));
            await b2.app.listen({ port: 0, host: '127.0.0.1' });
            const rb2 = `http://127.0.0.1:${(b2.app.server.address() as { port: number }).port}`;
            ok('after restart + seeding, the revoked token is STILL 401', (await memGet(rb2)) === 401);
            ok('owner token still works on the restarted app (seeding is precise)', (await fetch(`${rb2}/orders`, { headers: { authorization: `Bearer ${own.accessToken}` } })).status === 200);
            await b1.app.close(); await b2.app.close(); await rp.end();
        }
    }

    await pool.end();
    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All PostgreSQL tests passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

/**
 * Test-data seed (dev only). Fills a Postgres DB with a realistic tenant so the
 * apps show real data instead of in-code demo mocks. Reuses the SAME production
 * paths — migrations + makeAuthService + makeOrderService over the pg repos — so
 * nothing here is a parallel/duplicate implementation.
 *
 * Creates: one business (owner) + an invited admin + an invited worker, and a
 * spread of orders across every status (confirmed / settled / paid / canceled).
 * Safe to re-run: existing accounts are reused (login instead of register); each
 * run appends a fresh batch of orders. Pass `--fresh` to wipe first (DESTRUCTIVE).
 *
 * Run:  PG_URL=postgres://postgres:postgres@localhost:5434/heyhomie \
 *       npx tsx server/scripts/seed.ts            # (add --fresh to reset)
 * Or:   npm run seed        (uses DATABASE_URL / PG_URL)
 */
import {
    makeAuthService, makeOrderService, loadServerConfig,
    type AuthContext, type AuthTokens,
} from '@heyhomie/api';
import { makePool, initSchema } from '../src/db.js';
import { pgOrderRepo } from '../src/pgRepo.js';
import { pgAuthRepo } from '../src/pgAuthRepo.js';
import { makeAuthCrypto } from '../src/authCrypto.js';

const PG_URL = process.env.PG_URL ?? process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5434/heyhomie';
const SECRET = process.env.AUTH_SECRET ?? 'seed-secret-16chars-minimum-xx';
const PASSWORD = 'Password123!';
const FRESH = process.argv.includes('--fresh');

// Realistic Polish sample data (cityId/serviceId values proven valid by the tests).
const CITIES = ['krakow', 'warszawa', 'wroclaw', 'gdansk', 'poznan'];
const SERVICES = ['standard_cleaning', 'office_cleaning', 'standard_cleaning', 'general_cleaning'];
const PHONES = ['600100200', '512345678', '698112233', '607445566', '733221100', '515909090', '660303030', '789123456'];

const log = (msg: string) => console.log(msg);

async function main() {
    const config = loadServerConfig({ DATABASE_URL: PG_URL, AUTH_SECRET: SECRET, PORT: '8090' });
    const pool = makePool(PG_URL);

    if (FRESH) {
        log('⚠  --fresh: dropping all data (orders + auth) …');
        for (const t of ['audit_log', 'password_resets', 'invitations', 'auth_sessions', 'users', 'orders', 'schema_migrations']) {
            await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
        }
        await pool.query('DROP TYPE IF EXISTS order_status');
    }

    await initSchema(pool); // idempotent, advisory-locked migrations
    const auth = makeAuthService(pgAuthRepo(pool), makeAuthCrypto(SECRET, config.accessTtlSec), {
        refreshTtlSec: config.refreshTtlSec, inviteTtlSec: config.inviteTtlSec, resetTtlSec: config.resetTtlSec,
    });
    const orders = makeOrderService(pgOrderRepo(pool));

    // ── 1. The business owner (creates the tenant) ──
    const ownerEmail = 'owner@heyhomie.test';
    let owner: AuthTokens;
    try {
        owner = await auth.register({ email: ownerEmail, password: PASSWORD });
        log(`✔ owner registered: ${ownerEmail}`);
    } catch {
        owner = await auth.login({ email: ownerEmail, password: PASSWORD }); // already seeded → reuse
        log(`• owner exists, reusing: ${ownerEmail}`);
    }
    const tenant: AuthContext = owner.identity;

    // ── 2. Invite + accept an admin and a worker into that tenant ──
    const member = async (email: string, role: 'admin' | 'worker') => {
        try {
            const inv = await auth.invite({ email, role }, tenant);
            await auth.accept({ inviteToken: inv.inviteToken, password: PASSWORD });
            log(`✔ ${role} invited + joined: ${email}`);
        } catch {
            log(`• ${role} exists, skipping: ${email}`);
        }
    };
    await member('admin@heyhomie.test', 'admin');
    await member('worker@heyhomie.test', 'worker');

    // ── 3. A spread of orders across every status ──
    const created: string[] = [];
    for (let i = 0; i < PHONES.length; i++) {
        const res = await orders.create(
            { contact: { phone: PHONES[i] }, cityId: CITIES[i % CITIES.length], serviceId: SERVICES[i % SERVICES.length] },
            tenant,
        );
        created.push(res.draft.id);
    }
    // leave [0,1,2] as `confirmed`; complete → settle two; mark one paid; cancel one.
    await orders.complete(created[3], tenant);
    await orders.settle(created[3], tenant);
    await orders.complete(created[4], tenant);
    await orders.settle(created[4], tenant);
    await orders.markPaid(created[5], tenant);
    await orders.cancel(created[6], tenant);
    // [7] stays confirmed. Statuses now span confirmed / paid / settled / canceled.

    const rows = await pool.query<{ status: string; c: number }>(
        `SELECT status, count(*)::int AS c FROM orders WHERE tenant_id = $1 GROUP BY status ORDER BY status`,
        [tenant.tenantId],
    );

    log('\n──────── seed complete ────────');
    log(`tenant: ${tenant.tenantId}`);
    log(`orders by status: ${rows.rows.map(r => `${r.status}=${r.c}`).join('  ')}`);
    log('\nlogin in any app (all password: ' + PASSWORD + '):');
    log('  owner  → owner@heyhomie.test   (admin app)');
    log('  admin  → admin@heyhomie.test');
    log('  worker → worker@heyhomie.test  (worker app)');
    log('\npoint the apps at this server:  EXPO_PUBLIC_ORDERS_API_URL=http://<your-host>:8090');
    log('───────────────────────────────');

    await pool.end();
    process.exit(0);
}

main().catch((e) => { console.error('seed failed:', e); process.exit(1); });

/**
 * Build 18 — production auth foundation (GATE). Exercises the pure AuthService
 * end-to-end with a deterministic fake AuthCrypto + memoryAuthRepo: register,
 * login, refresh rotation, single-use reuse detection (theft → revoke family),
 * expiry, logout, enumeration-safety, duplicate-email conflict, input validation.
 *
 * Run: npx -y tsx packages/api/authSession.test.ts
 */
import { makeAuthService, memoryAuthRepo, type AuthCrypto } from './authSession';
import { AppError } from './errors';
import type { AuthContext } from './auth';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
async function throws(n: string, code: string, fn: () => Promise<unknown>) {
    try { await fn(); fail.push(`${n} (no throw)`); }
    catch (e) { e instanceof AppError && e.internalCode === code ? passed++ : fail.push(`${n} (got ${e instanceof AppError ? e.internalCode : e})`); }
}

/** Deterministic, non-cryptographic stand-in for the real node:crypto adapter.
 *  Proves the ORCHESTRATION; real scrypt/HMAC are proven in server/test/{live,pg}. */
function fakeCrypto(): AuthCrypto {
    let n = 0;
    return {
        newId: () => `id-${++n}`,
        hashPassword: (pw) => ({ hash: `h(${pw})`, salt: 's' }),
        verifyPassword: (pw, hash) => `h(${pw})` === hash,
        mintAccess: (identity: AuthContext) => ({ token: `access.${identity.userId}.${identity.tenantId}.${identity.role}`, expiresIn: 900 }),
        newRefresh: () => { const tok = `refresh-${++n}`; return { token: tok, hash: `H(${tok})` }; },
        hashRefresh: (tok) => `H(${tok})`,
    };
}

async function main() {
    // controllable clock (epoch ms)
    let clock = 1_700_000_000_000;
    const repo = memoryAuthRepo();
    const svc = makeAuthService(repo, fakeCrypto(), { refreshTtlSec: 1000, now: () => clock });

    // ── register ──
    const reg = await svc.register({ email: 'Owner@Example.com ', password: 'hunter2pw' });
    ok('register mints access + refresh', !!reg.accessToken && !!reg.refreshToken);
    ok('register expiresIn is access TTL', reg.expiresIn === 900);
    ok('register creates an owner identity', reg.identity.role === 'owner');
    ok('access token carries the tenant', reg.accessToken.includes(reg.identity.tenantId));
    await throws('duplicate email → CONFLICT', 'CONFLICT', () => svc.register({ email: 'owner@example.com', password: 'another1x' }));
    await throws('bad email → VALIDATION', 'VALIDATION_FAILED', () => svc.register({ email: 'nope', password: 'hunter2pw' }));
    await throws('short password → VALIDATION', 'VALIDATION_FAILED', () => svc.register({ email: 'a@b.co', password: 'short' }));

    // ── login (email normalized, enumeration-safe) ──
    const login = await svc.login({ email: 'owner@example.com', password: 'hunter2pw' });
    ok('login same tenant as register', login.identity.tenantId === reg.identity.tenantId);
    await throws('wrong password → 401', 'UNAUTHENTICATED', () => svc.login({ email: 'owner@example.com', password: 'wrongpass1' }));
    await throws('unknown email → 401 (same as wrong pw)', 'UNAUTHENTICATED', () => svc.login({ email: 'ghost@example.com', password: 'hunter2pw' }));

    // enumeration-safety: a verify MUST run even for an unknown email (constant work → no timing oracle)
    {
        const spyCrypto = fakeCrypto();
        let verifyCalls = 0;
        const inner = spyCrypto.verifyPassword.bind(spyCrypto);
        spyCrypto.verifyPassword = (pw, h, s) => { verifyCalls++; return inner(pw, h, s); };
        const spySvc = makeAuthService(memoryAuthRepo(), spyCrypto, { refreshTtlSec: 1000, now: () => clock });
        await throws('unknown-email login still rejects', 'UNAUTHENTICATED', () => spySvc.login({ email: 'ghost@nowhere.io', password: 'whatever1' }));
        ok('password verify runs even with no user (no timing oracle)', verifyCalls === 1);
    }

    // ── refresh rotation ──
    const r1 = await svc.refresh(login.refreshToken);
    ok('refresh mints a NEW refresh token (rotation)', r1.refreshToken !== login.refreshToken);
    ok('refresh preserves identity', r1.identity.userId === login.identity.userId && r1.identity.role === 'owner');
    ok('refresh mints a fresh access token', !!r1.accessToken);

    // old refresh token is single-use → reuse is theft → revoke the whole family
    await throws('reused (rotated) refresh → 401', 'UNAUTHENTICATED', () => svc.refresh(login.refreshToken));
    await throws('theft response revokes the rotated-in token too', 'UNAUTHENTICATED', () => svc.refresh(r1.refreshToken));

    // fresh login family, unaffected by the revoked one
    const login2 = await svc.login({ email: 'owner@example.com', password: 'hunter2pw' });
    const r2 = await svc.refresh(login2.refreshToken);
    ok('new family refresh works after prior revoke', !!r2.accessToken);

    // ── expiry ──
    const login3 = await svc.login({ email: 'owner@example.com', password: 'hunter2pw' });
    clock += 1000 * 1000 + 1; // past refreshTtlSec
    await throws('expired refresh → 401', 'UNAUTHENTICATED', () => svc.refresh(login3.refreshToken));

    // ── logout (idempotent) ──
    const login4 = await svc.login({ email: 'owner@example.com', password: 'hunter2pw' });
    await svc.logout(login4.refreshToken);
    await throws('refresh after logout → 401', 'UNAUTHENTICATED', () => svc.refresh(login4.refreshToken));
    await svc.logout(login4.refreshToken); // no throw — idempotent
    await svc.logout('never-issued');      // no throw — unknown token no-op
    ok('logout is idempotent / safe on unknown token', true);

    // ── Build 23: member invites (self-contained clock + repo) ──
    {
        let c = 2_000_000_000_000;
        const repo2 = memoryAuthRepo();
        const svc2 = makeAuthService(repo2, fakeCrypto(), { refreshTtlSec: 100_000, inviteTtlSec: 1000, now: () => c });
        const owner = await svc2.register({ email: 'owner2@x.com', password: 'ownerpass1' });

        const inv = await svc2.invite({ email: 'worker@x.com', role: 'worker' }, owner.identity);
        ok('owner invite returns a one-time token', typeof inv.inviteToken === 'string' && inv.role === 'worker' && !!inv.id);
        await throws('invite existing email → CONFLICT', 'CONFLICT', () => svc2.invite({ email: 'owner2@x.com', role: 'worker' }, owner.identity));
        await throws('invite bad role → VALIDATION', 'VALIDATION_FAILED', () => svc2.invite({ email: 'x@y.com', role: 'owner' as never }, owner.identity));

        const worker = await svc2.accept({ inviteToken: inv.inviteToken, password: 'workerpass1' });
        ok('accept creates a worker JOINED to the owner tenant', worker.identity.role === 'worker' && worker.identity.tenantId === owner.identity.tenantId);
        ok('invited worker can now log in', (await svc2.login({ email: 'worker@x.com', password: 'workerpass1' })).identity.role === 'worker');
        await throws('invitation cannot be reused → 401', 'UNAUTHENTICATED', () => svc2.accept({ inviteToken: inv.inviteToken, password: 'workerpass1' }));

        // owner-only: an invited worker may NOT invite or revoke
        await throws('non-owner invite → FORBIDDEN', 'FORBIDDEN', () => svc2.invite({ email: 'z@x.com', role: 'worker' }, worker.identity));

        // revoked invitation rejected
        const inv2 = await svc2.invite({ email: 'admin@x.com', role: 'admin' }, owner.identity);
        await svc2.revokeInvite(inv2.id, owner.identity);
        await throws('revoked invitation rejected → 401', 'UNAUTHENTICATED', () => svc2.accept({ inviteToken: inv2.inviteToken, password: 'adminpass1' }));

        // revoke authorization: non-owner + cross-tenant both forbidden (no existence leak)
        const inv3 = await svc2.invite({ email: 'admin2@x.com', role: 'admin' }, owner.identity);
        await throws('non-owner revoke → FORBIDDEN', 'FORBIDDEN', () => svc2.revokeInvite(inv3.id, worker.identity));
        const otherOwner = await svc2.register({ email: 'other@x.com', password: 'otherpass1' });
        await throws('cross-tenant revoke → FORBIDDEN', 'FORBIDDEN', () => svc2.revokeInvite(inv3.id, otherOwner.identity));

        // expired invitation rejected
        const inv4 = await svc2.invite({ email: 'late@x.com', role: 'worker' }, owner.identity);
        c += 1000 * 1000 + 1; // past inviteTtlSec
        await throws('expired invitation rejected → 401', 'UNAUTHENTICATED', () => svc2.accept({ inviteToken: inv4.inviteToken, password: 'latepass11' }));
    }

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All authSession tests passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

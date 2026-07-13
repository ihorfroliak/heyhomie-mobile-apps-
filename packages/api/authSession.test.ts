/**
 * Build 18 — production auth foundation (GATE). Exercises the pure AuthService
 * end-to-end with a deterministic fake AuthCrypto + memoryAuthRepo: register,
 * login, refresh rotation, single-use reuse detection (theft → revoke family),
 * expiry, logout, enumeration-safety, duplicate-email conflict, input validation.
 *
 * Run: npx -y tsx packages/api/authSession.test.ts
 */
import { makeAuthService, memoryAuthRepo, type AuthCrypto } from './authSession';
import { memoryAuditPort } from './auditPort';
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

    // ── Build 24: auth operations (invitation mgmt, password reset, sessions) ──
    {
        let c = 3_000_000_000_000;
        const repo3 = memoryAuthRepo();
        const svc3 = makeAuthService(repo3, fakeCrypto(), { refreshTtlSec: 100_000, inviteTtlSec: 1000, resetTtlSec: 500, now: () => c });
        const owner = await svc3.register({ email: 'own@x.com', password: 'ownerpass1' });

        // invitation management: list / revoke / reject-after-revoke / cannot-revoke-accepted / role gate
        const iv1 = await svc3.invite({ email: 'w1@x.com', role: 'worker' }, owner.identity);
        const iv2 = await svc3.invite({ email: 'w2@x.com', role: 'admin' }, owner.identity);
        const list1 = await svc3.listInvitations(owner.identity);
        ok('list shows both invitations, never a token hash', list1.length === 2 && list1.every(i => !('tokenHash' in (i as object)) && i.status === 'pending'));
        await svc3.revokeInvite(iv1.id, owner.identity);
        ok('revoked invite shows status=revoked', (await svc3.listInvitations(owner.identity)).find(i => i.id === iv1.id)?.status === 'revoked');
        await throws('accept after revoke rejected', 'UNAUTHENTICATED', () => svc3.accept({ inviteToken: iv1.inviteToken, password: 'w1pass123' }));
        const w2 = await svc3.accept({ inviteToken: iv2.inviteToken, password: 'w2pass123' }); // admin
        await throws('cannot revoke an accepted invitation', 'CONFLICT', () => svc3.revokeInvite(iv2.id, owner.identity));
        ok('accepted invite shows status=accepted', (await svc3.listInvitations(owner.identity)).find(i => i.id === iv2.id)?.status === 'accepted');
        const iv3 = await svc3.invite({ email: 'w3@x.com', role: 'worker' }, owner.identity);
        const w3 = await svc3.accept({ inviteToken: iv3.inviteToken, password: 'w3pass123' }); // worker
        await throws('worker cannot list invitations', 'FORBIDDEN', () => svc3.listInvitations(w3.identity));
        ok('admin CAN list invitations', (await svc3.listInvitations(w2.identity)).length >= 1);

        // password reset: unknown identical / confirm / single-use / old pw dead / new pw works / sessions revoked
        ok('reset request for unknown email → null (no enumeration)', (await svc3.requestPasswordReset({ email: 'ghost@x.com' })) === null);
        const rr = await svc3.requestPasswordReset({ email: 'own@x.com' });
        ok('reset request for a real user → a token', !!rr && typeof rr.resetToken === 'string');
        const ownerRefreshBefore = owner.refreshToken;
        await svc3.confirmPasswordReset({ resetToken: rr!.resetToken, password: 'newownerpass1' });
        await throws('reset token is single-use', 'UNAUTHENTICATED', () => svc3.confirmPasswordReset({ resetToken: rr!.resetToken, password: 'newownerpass1' }));
        await throws('old password no longer works', 'UNAUTHENTICATED', () => svc3.login({ email: 'own@x.com', password: 'ownerpass1' }));
        ok('new password works', (await svc3.login({ email: 'own@x.com', password: 'newownerpass1' })).identity.role === 'owner');
        await throws('reset revoked pre-existing sessions (old refresh dead)', 'UNAUTHENTICATED', () => svc3.refresh(ownerRefreshBefore));

        // sessions: two live → revoke one → other still refreshes → revoked rejected → cross-user forbidden
        const su = await svc3.register({ email: 'sess@x.com', password: 'sesspass123', deviceLabel: 'Reg' });
        const sPhone = await svc3.login({ email: 'sess@x.com', password: 'sesspass123', deviceLabel: 'Phone' });
        const sess = await svc3.listSessions(su.identity);
        ok('two live sessions listed with device labels', sess.length === 2 && sess.some(s => s.deviceLabel === 'Reg') && sess.some(s => s.deviceLabel === 'Phone'));
        ok('session view never exposes a refresh token', sess.every(s => !('refreshHash' in (s as object))));
        const regSessionId = sess.find(s => s.deviceLabel === 'Reg')!.id;
        await svc3.revokeSessionById(regSessionId, su.identity);
        await throws('revoked session refresh rejected', 'UNAUTHENTICATED', () => svc3.refresh(su.refreshToken));
        ok('the OTHER session still works (revoke-one leaves the rest)', !!(await svc3.refresh(sPhone.refreshToken)).accessToken);
        await throws('cannot revoke another user session', 'FORBIDDEN', () => svc3.revokeSessionById(regSessionId, owner.identity));
    }

    // ── Build 25: account lifecycle (disable / enable / delete) ──
    {
        let c = 4_000_000_000_000;
        const repo4 = memoryAuthRepo();
        const svc4 = makeAuthService(repo4, fakeCrypto(), { refreshTtlSec: 100_000, inviteTtlSec: 1000, now: () => c });
        const owner = await svc4.register({ email: 'own4@x.com', password: 'ownerpass1' });
        const wi = await svc4.invite({ email: 'wk@x.com', role: 'worker' }, owner.identity);
        const worker = await svc4.accept({ inviteToken: wi.inviteToken, password: 'workerpw12' });
        const ai = await svc4.invite({ email: 'ad@x.com', role: 'admin' }, owner.identity);
        const admin = await svc4.accept({ inviteToken: ai.inviteToken, password: 'adminpw123' });

        // roster: owner/admin can list (no password hashes); worker cannot
        const members = await svc4.listMembers(owner.identity);
        ok('owner lists all tenant members (no password hashes)', members.length === 3 && members.every(m => !('passwordHash' in (m as object)) && m.status === 'active'));
        await throws('worker cannot list members', 'FORBIDDEN', () => svc4.listMembers(worker.identity));
        ok('admin can list members', (await svc4.listMembers(admin.identity)).length === 3);

        // owner-only + self + cross-tenant guards
        await throws('non-owner cannot disable', 'FORBIDDEN', () => svc4.disableUser(worker.identity.userId, admin.identity));
        await throws('owner cannot disable self', 'FORBIDDEN', () => svc4.disableUser(owner.identity.userId, owner.identity));
        const other = await svc4.register({ email: 'other4@x.com', password: 'otherpass1' });
        await throws('cross-tenant disable forbidden', 'FORBIDDEN', () => svc4.disableUser(worker.identity.userId, other.identity));

        // DISABLE: login / refresh / reset all forbidden; sessions revoked
        await svc4.disableUser(worker.identity.userId, owner.identity);
        ok('disabled member shows status=disabled', (await svc4.listMembers(owner.identity)).find(m => m.email === 'wk@x.com')?.status === 'disabled');
        await throws('disabled login forbidden', 'UNAUTHENTICATED', () => svc4.login({ email: 'wk@x.com', password: 'workerpw12' }));
        await throws('disabled refresh forbidden (session revoked)', 'UNAUTHENTICATED', () => svc4.refresh(worker.refreshToken));
        ok('disabled password-reset forbidden (returns null)', (await svc4.requestPasswordReset({ email: 'wk@x.com' })) === null);

        // ENABLE: login works again
        await svc4.enableUser(worker.identity.userId, owner.identity);
        ok('enabled member can log in again', (await svc4.login({ email: 'wk@x.com', password: 'workerpw12' })).identity.role === 'worker');

        // DELETE: revoke pending invitations by the user + remove the account
        await repo4.insertInvitation({ id: 'ghost-inv', tenantId: owner.identity.tenantId, email: 'g@x.com', role: 'worker', tokenHash: 'Hg', invitedByUserId: worker.identity.userId, expiresAt: new Date(c + 1e6).toISOString(), createdAt: new Date(c).toISOString(), acceptedAt: null, revokedAt: null });
        await svc4.deleteUser(worker.identity.userId, owner.identity);
        await throws('deleted member cannot log in', 'UNAUTHENTICATED', () => svc4.login({ email: 'wk@x.com', password: 'workerpw12' }));
        ok('deleted member removed from roster', !(await svc4.listMembers(owner.identity)).some(m => m.email === 'wk@x.com'));
        ok("delete revoked the user's pending invitations", (await repo4.findInvitationById('ghost-inv'))?.revokedAt !== null);
        ok('email freed after delete (re-registrable)', typeof (await svc4.register({ email: 'wk@x.com', password: 'brandnew12' })).accessToken === 'string');

        // owner cannot delete self (protects the last owner); tenant integrity preserved
        await throws('owner cannot delete self / the last owner', 'FORBIDDEN', () => svc4.deleteUser(owner.identity.userId, owner.identity));
        ok('tenant integrity preserved (owner + admin remain)', (await svc4.listMembers(owner.identity)).length === 2);
    }

    // ── Build 27: audit trail — privileged actions emit events; no secrets ──
    {
        let c = 5_000_000_000_000;
        const repo5 = memoryAuthRepo();
        const svc5 = makeAuthService(repo5, fakeCrypto(), { refreshTtlSec: 100_000, inviteTtlSec: 1000, resetTtlSec: 500, now: () => c, audit: memoryAuditPort() });
        const owner = await svc5.register({ email: 'a-own@x.com', password: 'ownerpass1' });
        const iv = await svc5.invite({ email: 'a-wk@x.com', role: 'worker' }, owner.identity);
        const wk = await svc5.accept({ inviteToken: iv.inviteToken, password: 'wkpass1234' });
        const iv2 = await svc5.invite({ email: 'a-rev@x.com', role: 'admin' }, owner.identity);
        await svc5.revokeInvite(iv2.id, owner.identity);
        await svc5.disableUser(wk.identity.userId, owner.identity);
        await svc5.enableUser(wk.identity.userId, owner.identity);
        const rr = await svc5.requestPasswordReset({ email: 'a-own@x.com' });
        await svc5.confirmPasswordReset({ resetToken: rr!.resetToken, password: 'ownernew12' });
        await svc5.deleteUser(wk.identity.userId, owner.identity);

        const events = await svc5.listAuditEvents(owner.identity);
        const types = events.map(e => e.type);
        const want = ['member.invited', 'member.joined', 'invitation.revoked', 'member.disabled', 'member.enabled', 'password.reset', 'member.deleted'] as const;
        ok('audit captured every privileged event type', want.every(t => types.includes(t)));
        ok('audit is newest-first', events[0].type === 'member.deleted');
        ok('audit events NEVER contain a token/hash/password', !JSON.stringify(events).includes(iv.inviteToken) && !JSON.stringify(events).includes(rr!.resetToken) && !JSON.stringify(events).includes('h(') );

        // role gate: admin can read, worker cannot
        const iv3 = await svc5.invite({ email: 'a-adm@x.com', role: 'admin' }, owner.identity);
        const adm = await svc5.accept({ inviteToken: iv3.inviteToken, password: 'admpass1234' });
        ok('admin can read the audit trail', (await svc5.listAuditEvents(adm.identity)).length > 0);
        const iv4 = await svc5.invite({ email: 'a-wk2@x.com', role: 'worker' }, owner.identity);
        const wk2 = await svc5.accept({ inviteToken: iv4.inviteToken, password: 'wk2pass123' });
        await throws('worker cannot read the audit trail', 'FORBIDDEN', () => svc5.listAuditEvents(wk2.identity));

        // cross-tenant isolation: a different tenant sees none of these events
        const other = await svc5.register({ email: 'a-other@x.com', password: 'otherpass1' });
        ok('another tenant sees none of this tenant\'s audit events', (await svc5.listAuditEvents(other.identity)).length === 0);

        // audit is BEST-EFFORT: a throwing sink must not fail the op
        const throwAudit = { async record() { throw new Error('sink down'); }, async listByTenant() { return []; } };
        const svc6 = makeAuthService(memoryAuthRepo(), fakeCrypto(), { refreshTtlSec: 100_000, now: () => c, audit: throwAudit });
        const o6 = await svc6.register({ email: 'a-o6@x.com', password: 'o6pass1234' });
        let isolated = true;
        try { await svc6.invite({ email: 'a-w6@x.com', role: 'worker' }, o6.identity); } catch { isolated = false; }
        ok('a failing audit sink does not fail the auth op (isolated)', isolated);
    }

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All authSession tests passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

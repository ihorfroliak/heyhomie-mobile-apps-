/**
 * Build 27 — AuditPort (GATE). Proves the accountability seam: memory port records
 * + lists tenant-scoped newest-first; null is a no-op; console emits a structured,
 * secret-free record with a MASKED email. Audit events carry NO tokens/hashes by
 * construction (the type has no such field).
 *
 * Run: npx -y tsx packages/api/auditPort.test.ts
 */
import { memoryAuditPort, nullAuditPort, consoleAuditPort, type AuditEvent } from './auditPort';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

const ev = (over: Partial<AuditEvent>): AuditEvent => ({ type: 'member.disabled', tenantId: 't1', actorUserId: 'owner1', targetUserId: 'u1', targetEmail: 'worker@acme.pl', at: '2026-01-01T00:00:00.000Z', ...over });

async function main() {
    // memory: record + list, tenant-scoped, newest first
    const mp = memoryAuditPort();
    await mp.record(ev({ type: 'member.invited', tenantId: 't1', targetEmail: 'a@x.co' }));
    await mp.record(ev({ type: 'member.disabled', tenantId: 't1', targetEmail: 'b@x.co' }));
    await mp.record(ev({ type: 'member.deleted', tenantId: 't2', targetEmail: 'c@x.co' }));
    const t1 = await mp.listByTenant('t1');
    ok('memory lists only the tenant\'s events', t1.length === 2 && t1.every(e => e.targetEmail !== 'c@x.co'));
    ok('memory lists newest first', t1[0].type === 'member.disabled' && t1[1].type === 'member.invited');
    ok('memory respects the limit', (await mp.listByTenant('t1', 1)).length === 1);
    ok('cross-tenant list is isolated', (await mp.listByTenant('t2')).length === 1);
    ok('audit view carries no secret fields', Object.keys(t1[0]).sort().join(',') === 'actorUserId,at,targetEmail,type');

    // null: no-op
    const nu = nullAuditPort();
    await nu.record(ev({}));
    ok('null port records nothing', (await nu.listByTenant('t1')).length === 0);

    // console: structured, masked, no full email, cannot list
    const recs: Record<string, unknown>[] = [];
    const cp = consoleAuditPort(r => recs.push(r));
    await cp.record(ev({ targetEmail: 'boss@acme.pl' }));
    ok('console emits one structured record', recs.length === 1 && recs[0].event === 'audit');
    ok('console masks the target email', recs[0].to === 'b***@acme.pl');
    ok('console never emits the full email', !JSON.stringify(recs).includes('boss@acme.pl'));
    ok('console does not store (lists empty)', (await cp.listByTenant('t1')).length === 0);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All auditPort tests passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

/**
 * Build 29 — RevocationIndex (GATE). Proves the instant-revocation semantics:
 * user-level revocation kills tokens minted at-or-before the revocation (by iat)
 * but NOT newer ones (re-login after re-enable works); session-level revocation
 * kills exactly one sid; unknown users/sids pass; memory stays bounded via the
 * throttled over-threshold sweep (Build 15/16 discipline).
 *
 * Run: npx -y tsx packages/api/revocation.test.ts
 */
import { RevocationIndex } from './revocation';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

// controllable clock (epoch ms)
let clock = 1_700_000_000_000;
const sec = () => Math.floor(clock / 1000);

const idx = new RevocationIndex({ ttlSec: 1000, now: () => clock });

// clean slate: nothing revoked
ok('unknown user passes', !idx.isRevoked({ userId: 'u1', iat: sec() }));
ok('unknown sid passes', !idx.isRevoked({ userId: 'u1', sid: 's1', iat: sec() }));

// user-level: strictly-before tokens die; same-second and newer live (iat has 1s
// granularity — same-second coverage is the sid path's job; sid-less residual ≤1s)
idx.revokeUser('u1');
ok('token minted before revocation → revoked', idx.isRevoked({ userId: 'u1', iat: sec() - 10 }));
ok('same-second sid-less token passes (documented ≤1s residual)', !idx.isRevoked({ userId: 'u1', iat: sec() }));
clock += 5_000;
ok('token minted AFTER revocation (re-login) → passes', !idx.isRevoked({ userId: 'u1', iat: sec() }));
ok('other users unaffected', !idx.isRevoked({ userId: 'u2', iat: sec() - 100 }));

// a later revocation must not be shadowed by an earlier one
idx.revokeUser('u1');
ok('second revocation re-kills tokens minted since the first', idx.isRevoked({ userId: 'u1', iat: sec() - 2 }));

// session-level: exactly one device dies
idx.revokeSession('sid-A');
ok('revoked sid → revoked regardless of iat', idx.isRevoked({ userId: 'u3', sid: 'sid-A', iat: sec() + 100 }));
ok('sibling sid (other device) passes', !idx.isRevoked({ userId: 'u3', sid: 'sid-B', iat: sec() }));
ok('token without sid unaffected by session revocation', !idx.isRevoked({ userId: 'u3', iat: sec() }));

// bounded memory: entries past ttl are reclaimed by the throttled sweep
const big = new RevocationIndex({ ttlSec: 100, now: () => clock });
for (let i = 0; i < 1500; i++) big.revokeSession(`old-${i}`);
ok('grew past sweep threshold', big.size() >= 1024);
clock += 200_000; // far past ttl + throttle window
big.revokeSession('fresh'); // triggers the sweep
ok('sweep reclaimed expired entries (bounded memory)', big.size() < 100);
ok('fresh entry survives the sweep', big.isRevoked({ userId: 'x', sid: 'fresh', iat: sec() }));

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All revocation tests passed.');

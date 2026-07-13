/**
 * Build 26 — NotificationPort (GATE). Proves the delivery seam's security
 * invariants: the console port emits a structured, TOKEN-FREE record with a masked
 * recipient; the null port is a no-op; maskEmail hides the local part. The port
 * RECEIVES the raw token (to build the email) but must NEVER log it.
 *
 * Run: npx -y tsx packages/api/notificationPort.test.ts
 */
import { consoleNotificationPort, nullNotificationPort, maskEmail } from './notificationPort';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));

async function main() {
    // maskEmail
    ok('maskEmail hides the local part', maskEmail('worker@acme.pl') === 'w***@acme.pl');
    ok('maskEmail handles a malformed address', maskEmail('nope') === 'unknown');

    // null port: no-op, no throw
    const np = nullNotificationPort();
    await np.sendInvitation({ email: 'a@b.co', inviteToken: 'SECRET-INV', role: 'worker', expiresInSec: 100 });
    await np.sendPasswordReset({ email: 'a@b.co', resetToken: 'SECRET-RST', expiresInSec: 100 });
    ok('null port is a silent no-op', true);

    // console port: structured record, masked recipient, and NEVER the token
    const records: Record<string, unknown>[] = [];
    const cp = consoleNotificationPort(r => records.push(r));
    await cp.sendInvitation({ email: 'boss@acme.pl', inviteToken: 'INVITE-TOKEN-XYZ', role: 'admin', expiresInSec: 604800 });
    await cp.sendPasswordReset({ email: 'user@acme.pl', resetToken: 'RESET-TOKEN-XYZ', expiresInSec: 3600 });
    ok('console port emits one record per send', records.length === 2);
    ok('invitation record is structured + masked', records[0].event === 'notification_sent' && records[0].type === 'invitation' && records[0].to === 'b***@acme.pl');
    ok('password-reset record is structured + masked', records[1].type === 'password_reset' && records[1].to === 'u***@acme.pl');
    const dump = JSON.stringify(records);
    ok('the invite token NEVER appears in the emitted record', !dump.includes('INVITE-TOKEN-XYZ'));
    ok('the reset token NEVER appears in the emitted record', !dump.includes('RESET-TOKEN-XYZ'));
    ok('the full email is NOT emitted (only masked)', !dump.includes('boss@acme.pl') && !dump.includes('user@acme.pl'));

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All notificationPort tests passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

/**
 * NotificationPort (Build 26) — the ONLY delivery abstraction for auth capability
 * tokens (invite / password-reset). It is the seam between the auth engine and the
 * outside world: `makeAuthService` mints tokens and hands them to the ROUTE, the
 * route hands them to a NotificationPort. The AuthService NEVER knows how (or
 * whether) email is delivered — delivery is injected at the app/route layer.
 *
 * Delivery guarantees (project standard):
 *  - Best-effort + ISOLATED: a delivery failure must never fail the auth operation
 *    nor change an enumeration-safe response. The route wraps every send in a
 *    try/catch and logs a token-free failure record.
 *  - No auto-retry here — retry/backoff is a real-provider concern (future).
 *
 * Security invariants:
 *  - A port RECEIVES the raw token (it must, to build the email) but NEVER logs it.
 *  - Token hashes, passwords and refresh tokens are never passed here or logged.
 *  - Structured logs only; recipients are masked.
 *
 * Pure (no crypto, no node deps) → RN-safe and gate-testable. Real providers
 * (SMTP / SendGrid / SES) implement this same interface, server-side, later.
 */

/** What a member-invitation email needs. `inviteToken` is the raw one-time token. */
export interface InvitationNotification {
    email: string;
    inviteToken: string;
    role: 'admin' | 'worker';
    expiresInSec: number;
}

/** What a password-reset email needs. `resetToken` is the raw one-time token. */
export interface PasswordResetNotification {
    email: string;
    resetToken: string;
    expiresInSec: number;
}

export interface NotificationPort {
    sendInvitation(msg: InvitationNotification): Promise<void>;
    sendPasswordReset(msg: PasswordResetNotification): Promise<void>;
}

/** Mask an email for logs: keep the first local char + domain (`a***@acme.pl`). */
export function maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return 'unknown';
    return `${email[0]}***${email.slice(at)}`;
}

/** No-op port for tests / when delivery is intentionally disabled. */
export function nullNotificationPort(): NotificationPort {
    return {
        async sendInvitation() { /* no-op */ },
        async sendPasswordReset() { /* no-op */ },
    };
}

/** Structured record sink (defaults to console). Records are ALWAYS token-free. */
export type NotificationSink = (record: Record<string, unknown>) => void;

/**
 * Development port: "delivers" by emitting a structured, TOKEN-FREE record so a
 * developer/operator can see that a send happened + to whom (masked) — without
 * ever logging the token. (For local token retrieval, the HTTP request echoes the
 * token in dev mode only — a separate, response-only mechanism, never a log.)
 */
export function consoleNotificationPort(sink: NotificationSink = (r) => console.log(JSON.stringify(r))): NotificationPort {
    const emit = (type: 'invitation' | 'password_reset', email: string, expiresInSec: number): void =>
        sink({ event: 'notification_sent', channel: 'console', type, to: maskEmail(email), expiresInSec });
    return {
        // NB: msg.inviteToken / msg.resetToken are intentionally NOT emitted.
        async sendInvitation(msg) { emit('invitation', msg.email, msg.expiresInSec); },
        async sendPasswordReset(msg) { emit('password_reset', msg.email, msg.expiresInSec); },
    };
}

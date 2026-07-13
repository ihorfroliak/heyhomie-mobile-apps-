/**
 * AuditPort (Build 27) — the ONE accountability seam for privileged auth /
 * account-lifecycle actions. Answers "who did what, to whom, when" for the
 * owner-controlled operations added in Builds 23–25 (invite / revoke / join /
 * disable / enable / delete / password-reset), which previously left no trail.
 *
 * Mirrors the NotificationPort standard (Build 26): a single injected port, one
 * abstraction, impls swapped by environment. The auth ENGINE emits domain audit
 * events (it authoritatively knows actor + target); the storage is injected.
 *
 * Delivery guarantee: emitting is BEST-EFFORT + ISOLATED — an audit-sink failure
 * must never fail (or roll back) the auth operation. (A strict-compliance system
 * would make it blocking; this project chooses availability-first and documents it.)
 *
 * Security invariants (NON-NEGOTIABLE): an audit event carries ONLY {type, tenant,
 * actor id, target id, target email, timestamp}. It NEVER carries tokens, token
 * hashes, passwords, or refresh tokens. The console sink additionally masks the
 * email; the pg sink stores the full email in a private, access-controlled table
 * (forensics). Pure (no crypto / no node deps) → RN-safe + gate-testable.
 */
import { maskEmail } from './notificationPort';

export type AuditEventType =
    | 'member.invited'
    | 'invitation.revoked'
    | 'member.joined'
    | 'member.disabled'
    | 'member.enabled'
    | 'member.deleted'
    | 'password.reset';

/** A privileged-action record. `actorUserId` is null for self-service/system acts
 *  (accept-invite, password-reset). Never contains secrets. */
export interface AuditEvent {
    type: AuditEventType;
    tenantId: string;
    actorUserId: string | null;
    targetUserId?: string | null;
    targetEmail?: string | null;
    at: string; // ISO
}

/** Owner-visible audit row (no ids required to be secret; still never a secret). */
export interface AuditEventView {
    type: AuditEventType;
    actorUserId: string | null;
    targetEmail: string | null;
    at: string;
}

/** The audit log abstraction: append (record) + read (listByTenant). */
export interface AuditPort {
    record(event: AuditEvent): Promise<void>;
    listByTenant(tenantId: string, limit?: number): Promise<AuditEventView[]>;
}

const toView = (e: AuditEvent): AuditEventView => ({ type: e.type, actorUserId: e.actorUserId, targetEmail: e.targetEmail ?? null, at: e.at });

/** No-op sink (default). Records nothing, lists nothing — safe when audit is off. */
export function nullAuditPort(): AuditPort {
    return {
        async record() { /* no-op */ },
        async listByTenant() { return []; },
    };
}

/** In-memory sink for tests: stores + lists (newest first), tenant-scoped. */
export function memoryAuditPort(): AuditPort {
    const events: AuditEvent[] = [];
    return {
        async record(e) { events.push(e); },
        async listByTenant(tenantId, limit = 100) {
            return events.filter(e => e.tenantId === tenantId).reverse().slice(0, limit).map(toView);
        },
    };
}

export type AuditSink = (record: Record<string, unknown>) => void;

/**
 * Development sink: emits a structured, secret-free record with a MASKED email
 * (observability without PII in logs). Cannot list (it does not store) → returns
 * []. Real forensics use the pg sink.
 */
export function consoleAuditPort(sink: AuditSink = (r) => console.log(JSON.stringify(r))): AuditPort {
    return {
        async record(e) {
            sink({ event: 'audit', type: e.type, tenantId: e.tenantId, actor: e.actorUserId, target: e.targetUserId ?? null, to: e.targetEmail ? maskEmail(e.targetEmail) : null, at: e.at });
        },
        async listByTenant() { return []; },
    };
}

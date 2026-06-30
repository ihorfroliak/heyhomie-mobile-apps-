/**
 * GDPR / RODO consent + data-subject rights model.
 *
 * Records which consents a user gave, when, and to which document version (so
 * re-consent can be requested when a policy changes). Also models the data-subject
 * requests required by GDPR (access/export, erasure, rectification).
 *
 * NOTE: this is the data model only — the binding legal text lives in /legal and
 * must be reviewed by a qualified lawyer.
 */

export type ConsentType = 'terms' | 'privacy' | 'marketing';

/** Consents that must be granted before an account can be used. */
export const REQUIRED_CONSENTS: ConsentType[] = ['terms', 'privacy'];

export interface ConsentRecord {
    type: ConsentType;
    granted: boolean;
    /** Version of the document consented to (e.g. '2025-07-01'). */
    version: string;
    /** ISO timestamp of the decision — proof of consent. */
    at: string;
}

export function recordConsent(type: ConsentType, granted: boolean, version: string, at: string = new Date().toISOString()): ConsentRecord {
    return { type, granted, version, at };
}

/** Latest decision per consent type (newest `at` wins). */
function latest(records: ConsentRecord[]): Map<ConsentType, ConsentRecord> {
    const map = new Map<ConsentType, ConsentRecord>();
    for (const r of records) {
        const prev = map.get(r.type);
        if (!prev || r.at >= prev.at) map.set(r.type, r);
    }
    return map;
}

/** True only if every REQUIRED consent has a latest record that is granted. */
export function hasRequiredConsents(records: ConsentRecord[]): boolean {
    const map = latest(records);
    return REQUIRED_CONSENTS.every(type => map.get(type)?.granted === true);
}

/** GDPR / RODO data-subject request types. */
export type DataRequestType = 'export' | 'erasure' | 'rectification';

export interface DataRequest {
    type: DataRequestType;
    userId: string;
    at: string;
}

export function makeDataRequest(type: DataRequestType, userId: string, at: string = new Date().toISOString()): DataRequest {
    return { type, userId, at };
}

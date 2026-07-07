/**
 * Billing details for invoicing to a company (Polish faktura). Optional on an
 * order — only captured when the client explicitly asks for an invoice to a
 * specific company/address. Admin can add or edit these later (even backdated).
 * Pure + tested.
 */

export interface BillingDetails {
    companyName: string;
    nip: string; // Polish tax id — 10 digits (validated)
    line1: string; // street + number
    zipCode: string;
    city: string;
    email?: string; // where the invoice is sent
}

/** Strip spaces/dashes and a leading "PL" from a NIP string. */
export const normalizeNip = (raw: string): string => raw.replace(/[\s-]/g, '').replace(/^PL/i, '');

/**
 * Polish NIP validation with the official checksum (weights + mod 11).
 * 10 digits; the 10th is a check digit.
 */
export function isValidNip(raw: string): boolean {
    const nip = normalizeNip(raw);
    if (!/^\d{10}$/.test(nip)) return false;
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(nip[i]), 0);
    const check = sum % 11;
    return check !== 10 && check === Number(nip[9]);
}

/** Format a NIP as 123-456-32-18 (display only). */
export function formatNip(raw: string): string {
    const nip = normalizeNip(raw);
    if (nip.length !== 10) return raw;
    return `${nip.slice(0, 3)}-${nip.slice(3, 6)}-${nip.slice(6, 8)}-${nip.slice(8, 10)}`;
}

export interface BillingValidation {
    valid: boolean;
    missing: (keyof BillingDetails)[];
    nipValid: boolean;
}

const REQUIRED: (keyof BillingDetails)[] = ['companyName', 'nip', 'line1', 'zipCode', 'city'];

/** Which required fields are missing/invalid — drives the "Save" enabled state. */
export function validateBilling(b: Partial<BillingDetails>): BillingValidation {
    const missing = REQUIRED.filter(k => !String(b[k] ?? '').trim());
    const nipValid = !!b.nip && isValidNip(b.nip);
    return { valid: missing.length === 0 && nipValid, missing, nipValid };
}

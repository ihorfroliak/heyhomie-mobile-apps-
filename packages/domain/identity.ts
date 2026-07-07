/**
 * Client identity. Onboarding is deliberately minimal to reduce friction: a
 * client signs up with a Polish phone number OR an email (phone preferred),
 * verified by OTP — no passwords. Name is optional; we default to "Friend" and
 * an admin can fill the real name later. Pure + tested.
 */
import { isValidEmail } from './validation';

export const DEFAULT_FIRST_NAME = 'Friend';

export interface Contact {
    phone?: string;
    email?: string;
}

export interface ClientAccount {
    id: string;
    phone?: string; // stored normalized (+48XXXXXXXXX)
    email?: string;
    firstName: string; // defaults to DEFAULT_FIRST_NAME
    lastName?: string;
    createdAt: string;
    /** Which channel verified the account (OTP). */
    verifiedVia?: 'phone' | 'email';
}

/** Normalize a Polish number to +48XXXXXXXXX (handles 0048/48/spaces/dashes/9-digit). */
export function normalizePhone(raw: string): string {
    let d = raw.replace(/[\s\-()]/g, '');
    if (d.startsWith('0048')) d = '+48' + d.slice(4);
    else if (/^48\d{9}$/.test(d)) d = '+' + d;
    else if (/^\d{9}$/.test(d)) d = '+48' + d;
    return d;
}

export const isValidPolishPhone = (raw: string): boolean => /^\+48\d{9}$/.test(normalizePhone(raw));

/** Display a normalized PL number as +48 123 456 789. */
export function formatPhone(raw: string): string {
    const n = normalizePhone(raw);
    if (!/^\+48\d{9}$/.test(n)) return raw;
    const d = n.slice(3);
    return `+48 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)}`;
}

export const displayName = (a: Pick<ClientAccount, 'firstName' | 'lastName'>): string =>
    a.lastName ? `${a.firstName} ${a.lastName[0]}.` : a.firstName;

export interface SignupValidation {
    valid: boolean;
    phoneValid: boolean;
    emailValid: boolean;
}

/** Minimal signup rule: at least one valid contact channel. Name not required. */
export function validateSignup(c: Contact): SignupValidation {
    const phoneValid = !!c.phone && isValidPolishPhone(c.phone);
    const emailValid = !!c.email && isValidEmail(c.email);
    return { valid: phoneValid || emailValid, phoneValid, emailValid };
}

/** Stable key for dedupe/lookup — normalized phone, else lowercased email. */
export function contactKey(c: Contact): string {
    if (c.phone && isValidPolishPhone(c.phone)) return normalizePhone(c.phone);
    return (c.email ?? '').trim().toLowerCase();
}

/** Find an existing account by phone or email (returning users). */
export function findAccount(accounts: ClientAccount[], c: Contact): ClientAccount | undefined {
    const phone = c.phone ? normalizePhone(c.phone) : undefined;
    const email = c.email ? c.email.trim().toLowerCase() : undefined;
    return accounts.find(a => (!!phone && a.phone === phone) || (!!email && (a.email ?? '').toLowerCase() === email));
}

/** Create a new minimal account; name falls back to "Friend". */
export function newAccount(id: string, c: Contact, opts: { firstName?: string; lastName?: string; createdAt: string }): ClientAccount {
    return {
        id,
        phone: c.phone ? normalizePhone(c.phone) : undefined,
        email: c.email?.trim() || undefined,
        firstName: (opts.firstName ?? '').trim() || DEFAULT_FIRST_NAME,
        lastName: opts.lastName?.trim() || undefined,
        createdAt: opts.createdAt,
        verifiedVia: c.phone ? 'phone' : 'email',
    };
}

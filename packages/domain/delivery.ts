/**
 * Flower delivery — the one non-cleaning service booked in-app. A delivery has
 * its own details: WHO receives it (often not the buyer), WHERE, WHEN (date +
 * time slot) and an optional gift note. Pure + tested; the client booking form
 * and the mock store both validate through here.
 */
import type { Localized } from './cleaning';
import { isValidPolishPhone } from './identity';

const L = (pl: string, en: string, uk: string): Localized => ({ pl, en, uk });

export type DeliverySlotId = 'morning' | 'afternoon' | 'evening';

export interface DeliverySlot {
    id: DeliverySlotId;
    label: Localized;
    window: string; // display hours
}

export const DELIVERY_SLOTS: DeliverySlot[] = [
    { id: 'morning', label: L('Rano', 'Morning', 'Зранку'), window: '9:00–12:00' },
    { id: 'afternoon', label: L('Po południu', 'Afternoon', 'Вдень'), window: '12:00–17:00' },
    { id: 'evening', label: L('Wieczorem', 'Evening', 'Ввечері'), window: '17:00–21:00' },
];

export const DELIVERY_NOTE_MAX = 300;

export interface DeliveryDetails {
    recipientName: string;
    /** Recipient's phone so the courier can reach them — optional, PL format if given. */
    recipientPhone?: string;
    line1: string; // street + number
    city: string; // city id (the coverage city the client booked in)
    date: string; // YYYY-MM-DD
    slot: DeliverySlotId;
    /** Gift note printed on the card. */
    note?: string;
}

export interface DeliveryValidation {
    valid: boolean;
    missing: (keyof DeliveryDetails)[];
    phoneValid: boolean;
}

const SLOT_IDS = new Set<DeliverySlotId>(DELIVERY_SLOTS.map(s => s.id));

/** Which required fields are missing/invalid — drives the Continue enabled state. */
export function validateDelivery(d: Partial<DeliveryDetails>): DeliveryValidation {
    const missing: (keyof DeliveryDetails)[] = [];
    if (!String(d.recipientName ?? '').trim()) missing.push('recipientName');
    if (!String(d.line1 ?? '').trim()) missing.push('line1');
    if (!String(d.city ?? '').trim()) missing.push('city');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '')) missing.push('date');
    if (!d.slot || !SLOT_IDS.has(d.slot)) missing.push('slot');
    // Phone is optional, but if given it must be a real PL number.
    const phoneValid = !d.recipientPhone || isValidPolishPhone(d.recipientPhone);
    if (!phoneValid) missing.push('recipientPhone');
    return { valid: missing.length === 0, missing, phoneValid };
}

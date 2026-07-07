/**
 * Payments — settled ONLY after the mission is completed. Nothing is charged at
 * booking. The morning after a completed visit (03:00 local, the next day past
 * midnight) a nightly job runs per order:
 *   - card on file  → automatic charge via Stripe
 *   - no card       → a Stripe-hosted payment link is emailed to the client
 * An admin can also mark an order paid by hand (cash, transfer, correction).
 *
 * Pure model + helpers; the real charge/link/webhook is Stripe on the backend.
 * PaymentMethod is reused from missions.ts (card | pay_later | cash) — do NOT
 * redefine it here (that collides in the domain barrel).
 */
import type { Localized, Locale } from './cleaning';
import type { PaymentMethod } from './missions';

export type PaymentProvider = 'stripe';

export type PaymentStatus =
    | 'awaiting_completion' // booked; mission not finished — nothing to pay yet
    | 'due' // mission done; scheduled for the next 03:00 auto-run
    | 'processing' // Stripe charge in flight
    | 'link_sent' // no card on file — hosted link emailed, not paid yet
    | 'paid'
    | 'failed'
    | 'refunded';

export interface PaymentIntent {
    id: string;
    orderId: string;
    method: PaymentMethod;
    status: PaymentStatus;
    provider: PaymentProvider;
    createdAt: string;
    /** Confirmed at checkout / from the mission price; may be absent early. */
    amount?: number;
    currency: string;
    /** Where a pay-later link is emailed. */
    email?: string;
    /** When the mission finished — the trigger for settlement. */
    completedAt?: string;
    /** Scheduled auto-charge time (03:00 the day after completion). */
    chargeAt?: string;
    paidAt?: string;
    /** pay-later only: the hosted link the client opens, and where we sent it. */
    linkUrl?: string;
    linkSentTo?: string;
    /** Stripe PaymentIntent / Checkout id (set by the backend). */
    stripeRef?: string;
}

const L = (pl: string, en: string, uk: string): Localized => ({ pl, en, uk });

export interface PaymentMethodDef {
    id: PaymentMethod;
    label: Localized;
    blurb: Localized;
}

/** The two methods offered in the app (both settle AFTER the cleaning). */
export const PAYMENT_METHODS: PaymentMethodDef[] = [
    {
        id: 'card',
        label: L('Karta', 'Card', 'Картка'),
        blurb: L('Automatyczne obciążenie po usłudze', 'Auto-charged after the cleaning', 'Автосписання після послуги'),
    },
    {
        id: 'pay_later',
        label: L('Zapłać później', 'Pay later', 'Оплатити пізніше'),
        blurb: L('Link do zapłaty na e-mail po usłudze', 'Payment link emailed after the cleaning', 'Посилання на оплату на пошту після послуги'),
    },
];

/** Labels for every method (incl. 'cash', backend-only, not offered in the app). */
const METHOD_LABELS: Record<PaymentMethod, Localized> = {
    card: PAYMENT_METHODS[0].label,
    pay_later: PAYMENT_METHODS[1].label,
    cash: L('Gotówka', 'Cash', 'Готівка'),
};

export const paymentMethodLabel = (m: PaymentMethod, locale: Locale): string => METHOD_LABELS[m][locale];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, Localized> = {
    awaiting_completion: L('Po usłudze', 'After the service', 'Після послуги'),
    due: L('Do rozliczenia', 'Due', 'До оплати'),
    processing: L('Przetwarzanie', 'Processing', 'Обробка'),
    link_sent: L('Link wysłany', 'Link sent', 'Посилання надіслано'),
    paid: L('Opłacone', 'Paid', 'Оплачено'),
    failed: L('Nieudane', 'Failed', 'Не вдалося'),
    refunded: L('Zwrócone', 'Refunded', 'Повернено'),
};

/** UI tone hint (maps to design semantic colours in the app). */
export type PaymentTone = 'success' | 'warning' | 'danger' | 'neutral';
export const paymentStatusTone = (s: PaymentStatus): PaymentTone =>
    s === 'paid' ? 'success' : s === 'failed' ? 'danger' : s === 'awaiting_completion' || s === 'refunded' ? 'neutral' : 'warning';

export const isPaid = (p: PaymentIntent): boolean => p.status === 'paid';
export const isSettled = (p: PaymentIntent): boolean => p.status === 'paid' || p.status === 'refunded';

/** Stripe-hosted payment link for pay-later. Backend returns the real Checkout URL. */
export const payLaterLink = (orderId: string): string => `https://pay.heyhomie.pl/o/${orderId}`;

/** 03:00 local time on the day AFTER the mission completed — when settlement runs. */
export function nextChargeAt(completedAtIso: string): string {
    const d = new Date(completedAtIso);
    d.setDate(d.getDate() + 1);
    d.setHours(3, 0, 0, 0);
    return d.toISOString();
}

export interface CreatePaymentInput {
    orderId: string;
    method: PaymentMethod;
    amount?: number;
    currency?: string;
    /** Email a pay-later link will be sent to (after completion). */
    email?: string;
    now?: string;
}

/** Payment intent for a fresh booking — nothing is due until the mission is done. */
export function createPaymentIntent(input: CreatePaymentInput): PaymentIntent {
    return {
        id: `pay-${input.orderId}`,
        orderId: input.orderId,
        method: input.method,
        status: 'awaiting_completion',
        provider: 'stripe',
        createdAt: input.now ?? new Date().toISOString(),
        amount: input.amount,
        currency: input.currency ?? 'PLN',
        email: input.email,
    };
}

/** Mission finished → schedule settlement for the next 03:00 (day after completion). */
export function markDue(p: PaymentIntent, completedAtIso: string, amount?: number): PaymentIntent {
    return { ...p, status: 'due', completedAt: completedAtIso, chargeAt: nextChargeAt(completedAtIso), amount: amount ?? p.amount };
}

/** Whether an intent is ready for the nightly run at `nowIso`. */
export const isChargeReady = (p: PaymentIntent, nowIso: string): boolean => p.status === 'due' && !!p.chargeAt && p.chargeAt <= nowIso;

/** All intents the 03:00 job should process now. */
export const duePayments = (intents: PaymentIntent[], nowIso: string): PaymentIntent[] => intents.filter(p => isChargeReady(p, nowIso));

/**
 * Run settlement for one due intent (the nightly 03:00 job):
 *  - card / cash → auto-charge via Stripe (confirmed near-instantly in this mock)
 *  - pay_later   → email the Stripe-hosted link; status waits on the client
 */
export function runCharge(p: PaymentIntent, now?: string): PaymentIntent {
    const at = now ?? new Date().toISOString();
    if (p.method === 'pay_later') {
        return { ...p, status: 'link_sent', linkUrl: payLaterLink(p.orderId), linkSentTo: p.email };
    }
    return { ...p, status: 'paid', paidAt: at, stripeRef: `pi_${p.orderId}` };
}

/** Settle a payment (client paid the link, provider webhook, or admin override). */
export function markPaid(p: PaymentIntent, now?: string): PaymentIntent {
    return { ...p, status: 'paid', paidAt: now ?? new Date().toISOString() };
}

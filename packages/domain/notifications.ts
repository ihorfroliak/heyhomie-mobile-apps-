/**
 * Notification catalog + message builder. Pure: it decides WHICH channels a
 * given event goes out on and renders the subject/body. Actual delivery (email
 * via Mailgun, SMS via Twilio, push via Expo) happens in the backend/api layer.
 * Key events wired: invoice by email, visit reschedule (client- OR admin-made),
 * visit cancellation, booking confirmation, 24h reminder, homie on the way.
 */

export type NotificationChannel = 'email' | 'sms' | 'push';

export type NotificationKind =
    | 'booking_confirmed'
    | 'visit_rescheduled'
    | 'visit_canceled'
    | 'invoice_issued'
    | 'homie_on_the_way'
    | 'reminder_24h'
    | 'callback_received'
    | 'payment_link'
    | 'payment_charged';

export type Actor = 'client' | 'admin' | 'system';

export interface NotificationRecipient {
    name?: string;
    email?: string;
    phone?: string;
    pushToken?: string;
}

export interface NotificationEvent {
    kind: NotificationKind;
    orderId?: string;
    /** Original slot (ISO) — for reschedule/cancel/reminder. */
    scheduledAt?: string;
    /** New slot (ISO) — for reschedule. */
    newScheduledAt?: string;
    /** Who triggered it (shown so the other side knows who moved the visit). */
    actor?: Actor;
    invoiceNumber?: string;
    amount?: number;
    currency?: string;
    homieName?: string;
    /** Late-cancel fee, if any. */
    fee?: number;
    /** Human-readable service name — for callback_received. */
    serviceLabel?: string;
    /** Hosted payment link — for payment_link (pay-later). */
    paymentUrl?: string;
}

export interface NotificationMessage {
    channel: NotificationChannel;
    kind: NotificationKind;
    subject?: string; // email only
    body: string;
}

/** Channels an event kind should fan out to. */
export function channelsFor(kind: NotificationKind): NotificationChannel[] {
    switch (kind) {
        case 'invoice_issued':
        case 'payment_link':
        case 'payment_charged':
            return ['email'];
        case 'homie_on_the_way':
            return ['sms', 'push'];
        case 'callback_received':
            // Lead-service callbacks are phone-first (the client just left a number).
            return ['sms', 'email'];
        case 'booking_confirmed':
        case 'visit_rescheduled':
        case 'visit_canceled':
        case 'reminder_24h':
            return ['email', 'push'];
    }
}

const canReceive = (r: NotificationRecipient, ch: NotificationChannel): boolean =>
    (ch === 'email' && !!r.email) || (ch === 'sms' && !!r.phone) || (ch === 'push' && !!r.pushToken);

const day = (iso?: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');
const money = (e: NotificationEvent) => (e.amount != null ? `${e.amount.toFixed(2)} ${e.currency ?? 'PLN'}` : '');

/** Subject + body for an event (English base templates; localise in the mailer). */
export function renderNotification(e: NotificationEvent): { subject: string; body: string } {
    switch (e.kind) {
        case 'booking_confirmed':
            return { subject: 'Booking confirmed', body: `Your cleaning is booked for ${day(e.scheduledAt)}.` };
        case 'visit_rescheduled': {
            const who = e.actor === 'admin' ? 'We' : 'You';
            return {
                subject: 'Visit rescheduled',
                body: `${who} moved your visit from ${day(e.scheduledAt)} to ${day(e.newScheduledAt)}.`,
            };
        }
        case 'visit_canceled':
            return {
                subject: 'Visit canceled',
                body: `Your visit on ${day(e.scheduledAt)} was canceled${e.fee ? `. A late-cancellation fee of ${e.fee.toFixed(2)} ${e.currency ?? 'PLN'} applies` : ''}.`,
            };
        case 'invoice_issued':
            return { subject: `Invoice ${e.invoiceNumber ?? ''}`.trim(), body: `Your invoice ${e.invoiceNumber ?? ''} for ${money(e)} is attached.` };
        case 'homie_on_the_way':
            return { subject: 'Your homie is on the way', body: `${e.homieName ?? 'Your homie'} is on the way.` };
        case 'reminder_24h':
            return { subject: 'Cleaning tomorrow', body: `Reminder: your cleaning is on ${day(e.scheduledAt)}.` };
        case 'callback_received':
            return {
                subject: 'We got your request',
                body: `Thanks! A manager will call you back about ${e.serviceLabel ?? 'your request'} within one business day.`,
            };
        case 'payment_link':
            return {
                subject: 'Complete your payment',
                body: `Your cleaning is done. Pay when you're ready: ${e.paymentUrl ?? ''}`.trim(),
            };
        case 'payment_charged':
            return {
                subject: 'Payment received',
                body: `We charged your card ${money(e)} for your cleaning. Thank you!`.replace('  ', ' '),
            };
    }
}

/** Build the concrete messages for an event, limited to channels the recipient can receive. */
export function buildNotifications(e: NotificationEvent, recipient: NotificationRecipient): NotificationMessage[] {
    const { subject, body } = renderNotification(e);
    return channelsFor(e.kind)
        .filter(ch => canReceive(recipient, ch))
        .map(channel => ({ channel, kind: e.kind, body, ...(channel === 'email' ? { subject } : {}) }));
}

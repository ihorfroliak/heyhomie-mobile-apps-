/**
 * In-memory booking store — the MOCK BACKEND for bookings and leads. Lives in
 * the shared api package so every app reads the same state (client submits,
 * admin pipeline sees it). Swap the array mutations + notify() transport for
 * real API calls when live; the function signatures are the contract.
 */
import {
    findAccount,
    newAccount,
    normalizePhone,
    serviceName,
    clampLength,
    createPaymentIntent,
    markDue,
    markPaid,
    runCharge,
    duePayments,
    DELIVERY_NOTE_MAX,
    type ClientAccount,
    type BookingDraft,
    type Contact,
    type Lead,
    type DeliveryDetails,
    type PaymentIntent,
    type PaymentMethod,
} from '../domain';
import { demoAccounts } from './demo';
import { notify } from './notifyClient';
import type { KeyValueStore } from './preferences';

type Listener = () => void;

const STORE_KEY = 'heyhomie.orders.v1';

let accounts: ClientAccount[] = [...demoAccounts];
let drafts: BookingDraft[] = [];
let leads: Lead[] = [];
let payments: PaymentIntent[] = [];
let canceled: string[] = []; // order ids canceled by client/admin
let seq = 0; // monotonic suffix so ids never collide within the same millisecond
const uid = (prefix: string): string => `${prefix}-${Date.now()}-${++seq}`;
const listeners = new Set<Listener>();

/**
 * Durable persistence seam. Inject a KeyValueStore (AsyncStorage in the apps,
 * memory in tests) via initBookingStore; every mutation is written through it so
 * orders survive an app reload. This is also the exact boundary a real backend
 * gateway replaces — screens keep calling the same functions.
 * NOTE: each app is a separate bundle with its own storage, so this makes state
 * durable PER APP; cross-app/device sharing still requires the shared backend.
 */
let kv: KeyValueStore | null = null;
const persist = (): void => {
    if (kv) void kv.setItem(STORE_KEY, JSON.stringify({ accounts, drafts, leads, payments, canceled }));
};
const emit = () => {
    listeners.forEach(l => l());
    persist();
};

/** Hydrate from the persistence store (call once at app startup). */
export async function initBookingStore(store: KeyValueStore): Promise<void> {
    kv = store;
    const raw = await store.getItem(STORE_KEY);
    if (raw) {
        try {
            const s = JSON.parse(raw) as { accounts?: ClientAccount[]; drafts?: BookingDraft[]; leads?: Lead[]; payments?: PaymentIntent[]; canceled?: string[] };
            accounts = s.accounts ?? accounts;
            drafts = s.drafts ?? drafts;
            leads = s.leads ?? leads;
            payments = s.payments ?? payments;
            canceled = s.canceled ?? canceled;
        } catch {
            // corrupt payload — keep current in-memory state, overwrite on next mutation
        }
    } else {
        persist(); // first run: seed the store with current state
    }
    listeners.forEach(l => l());
}

/** Clear in-memory state + detach the store (tests / sign-out). */
export function resetBookingStore(): void {
    kv = null;
    accounts = [...demoAccounts];
    drafts = [];
    leads = [];
    payments = [];
    canceled = [];
}

export const subscribeBookings = (l: Listener): (() => void) => {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
};

/** Stable snapshots for useSyncExternalStore (references change only on emit). */
export const getStoreDrafts = (): BookingDraft[] => drafts;
export const getStoreLeads = (): Lead[] => leads;
export const getStoreAccounts = (): ClientAccount[] => accounts;
export const getStorePayments = (): PaymentIntent[] => payments;
export const getStoreCanceled = (): string[] => canceled;
export const paymentForOrder = (orderId: string): PaymentIntent | undefined => payments.find(p => p.orderId === orderId);

const replacePayment = (orderId: string, updated: PaymentIntent) => {
    payments = payments.map(x => (x.orderId === orderId ? updated : x));
    emit();
};

/** Idempotent confirm — drafts are created confirmed; re-confirm clears a cancel. */
export function confirmOrder(orderId: string): void {
    if (canceled.includes(orderId)) {
        canceled = canceled.filter(id => id !== orderId);
        emit();
    }
}

/** Cancel an order (flag). Fee logic stays in the domain (`cancellationFee`). */
export function cancelOrder(orderId: string): void {
    if (!drafts.some(d => d.id === orderId) || canceled.includes(orderId)) return;
    canceled = [...canceled, orderId];
    emit();
}

/**
 * Settle ONE order now (per-order form of the 03:00 run): a due card is charged,
 * a link_sent order is marked paid. Mirrors runNightlyCharges for a single id.
 */
export async function settleOrderNow(orderId: string, now?: string): Promise<PaymentIntent | undefined> {
    const p = payments.find(x => x.orderId === orderId);
    if (!p) return undefined;
    const at = now ?? new Date().toISOString();
    if (p.status === 'due') {
        const charged = runCharge(p, at);
        replacePayment(orderId, charged);
        const acc = accounts.find(a => a.id === draftClient(orderId));
        const recipient = { name: acc?.firstName, phone: acc?.phone, email: acc?.email ?? p.email };
        if (charged.status === 'paid') await notify({ kind: 'payment_charged', orderId, amount: charged.amount, currency: charged.currency }, recipient);
        else if (charged.status === 'link_sent' && charged.linkUrl) await notify({ kind: 'payment_link', orderId, paymentUrl: charged.linkUrl }, recipient);
        return charged;
    }
    if (p.status === 'link_sent') {
        const paid = markPaid(p, at);
        replacePayment(orderId, paid);
        return paid;
    }
    return p;
}

/**
 * Mission finished → the payment becomes due, scheduled for the next 03:00 job.
 * (Backend fires this on the mission-completed event.)
 */
export function completeOrder(orderId: string, completedAt?: string): PaymentIntent | undefined {
    const p = payments.find(x => x.orderId === orderId);
    if (!p || p.status !== 'awaiting_completion') return p;
    const updated = markDue(p, completedAt ?? new Date().toISOString());
    replacePayment(orderId, updated);
    return updated;
}

/**
 * The nightly 03:00 settlement run: charge every due card via Stripe and email a
 * link for every card-less order. Returns what it processed. (Backend cron.)
 */
export async function runNightlyCharges(now?: string): Promise<PaymentIntent[]> {
    const at = now ?? new Date().toISOString();
    const due = duePayments(payments, at);
    for (const p of due) {
        const charged = runCharge(p, at);
        payments = payments.map(x => (x.orderId === p.orderId ? charged : x));
        const acc = accounts.find(a => a.id === draftClient(p.orderId));
        const recipient = { name: acc?.firstName, phone: acc?.phone, email: acc?.email ?? p.email };
        if (charged.status === 'paid') {
            await notify({ kind: 'payment_charged', orderId: p.orderId, amount: charged.amount, currency: charged.currency }, recipient);
        } else if (charged.status === 'link_sent' && charged.linkUrl) {
            await notify({ kind: 'payment_link', orderId: p.orderId, paymentUrl: charged.linkUrl }, recipient);
        }
    }
    if (due.length) emit();
    return due;
}

const draftClient = (orderId: string): string | undefined => drafts.find(d => d.id === orderId)?.clientId;

/** Settle a pay-later payment (client opened the Stripe link / provider webhook). */
export function settlePayment(orderId: string): PaymentIntent | undefined {
    const p = payments.find(x => x.orderId === orderId);
    if (!p || p.status === 'paid') return p;
    const updated = markPaid(p);
    replacePayment(orderId, updated);
    return updated;
}

/** Admin marks an order paid by hand (cash, transfer, correction). */
export function markOrderPaidByAdmin(orderId: string, now?: string): PaymentIntent | undefined {
    const p = payments.find(x => x.orderId === orderId);
    if (!p || p.status === 'paid') return p;
    const updated = markPaid(p, now);
    replacePayment(orderId, updated);
    return updated;
}

export interface SubmitBookingInput {
    contact: Contact;
    firstName?: string;
    cityId: string;
    serviceId: string;
    estValue?: number;
    scheduledAt?: string;
    /** Flower-delivery bookings: recipient / address / slot / gift note. */
    delivery?: DeliveryDetails;
    /** How the client chose to pay. Defaults to 'card'. */
    paymentMethod?: PaymentMethod;
}

export interface SubmitBookingResult {
    account: ClientAccount;
    isNewAccount: boolean;
    draft: BookingDraft;
    payment: PaymentIntent;
}

/** Resolve or create the account, record a confirmed draft, send confirmation. */
export async function submitBooking(input: SubmitBookingInput): Promise<SubmitBookingResult> {
    let account = findAccount(accounts, input.contact);
    const isNewAccount = !account;
    if (!account) {
        account = newAccount(uid('cl'), input.contact, { firstName: input.firstName, createdAt: new Date().toISOString() });
        accounts = [...accounts, account];
    }

    const delivery = input.delivery
        ? { ...input.delivery, note: input.delivery.note ? clampLength(input.delivery.note, DELIVERY_NOTE_MAX) : undefined }
        : undefined;

    const draft: BookingDraft = {
        id: uid('dr'),
        clientId: account.id,
        contact: input.contact,
        cityId: input.cityId,
        serviceId: input.serviceId,
        stage: 'confirmed',
        updatedAt: new Date().toISOString(),
        estValue: input.estValue,
        delivery,
    };
    // Payment intent — nothing is charged now; settlement is post-completion
    // (auto Stripe charge on file, or an emailed link, at 03:00 the next day).
    const method: PaymentMethod = input.paymentMethod ?? 'card';
    const payment = createPaymentIntent({ orderId: draft.id, method, amount: input.estValue, email: account.email });

    drafts = [...drafts, draft];
    payments = [...payments, payment];
    emit();

    // Only the booking confirmation goes out now; payment happens after the visit.
    await notify(
        { kind: 'booking_confirmed', orderId: draft.id, scheduledAt: input.scheduledAt },
        { name: account.firstName, phone: account.phone, email: account.email },
    );

    return { account, isNewAccount, draft, payment };
}

export interface SubmitLeadInput {
    phone: string;
    serviceId: string;
    cityId: string;
}

/**
 * Lead-service callback (office / post-renovation): record a Lead so the admin
 * pipeline can follow up, and confirm to the client by SMS/email.
 */
export async function submitLeadCallback(input: SubmitLeadInput): Promise<Lead> {
    const phone = normalizePhone(input.phone);
    const lead: Lead = {
        id: uid('lead'),
        contact: { phone },
        source: 'callback',
        serviceInterest: input.serviceId,
        cityId: input.cityId,
        createdAt: new Date().toISOString(),
        status: 'new',
    };
    leads = [...leads, lead];
    emit();

    await notify(
        { kind: 'callback_received', serviceLabel: serviceName(input.serviceId, 'en') },
        { phone },
    );

    return lead;
}

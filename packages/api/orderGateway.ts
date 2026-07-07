/**
 * OrderGateway — the ONLY allowed surface for booking/order state.
 *
 * The contract lives in orderContract.ts (frozen). This file holds the LOCAL
 * adapter (wraps the private bookingStore) and the active binding. The HTTP
 * adapter is httpOrderGateway.ts. Swapping backends = change `orderGateway`
 * below; no UI change.
 */
import type { BookingDraft, PaymentIntent } from '../domain';
import * as store from './bookingStore';
import type { Order, OrderStatus, OrderGateway } from './orderContract';
// Types are exported from the barrel via ./orderContract (single source).

// ── projection (draft + joined payment + cancel flag → contract Order) ────────
function statusOf(pay: PaymentIntent | undefined, isCanceled: boolean): OrderStatus {
    if (isCanceled) return 'canceled';
    if (pay?.status === 'paid') return 'paid';
    if (pay && pay.status !== 'awaiting_completion') return 'completed'; // due / processing / link_sent
    return 'confirmed';
}

function toOrder(d: BookingDraft, canceledIds: string[]): Order {
    const pay = store.paymentForOrder(d.id);
    return {
        id: d.id,
        clientId: d.clientId,
        serviceId: d.serviceId,
        cityId: d.cityId,
        contact: d.contact,
        delivery: d.delivery,
        updatedAt: d.updatedAt,
        status: statusOf(pay, canceledIds.includes(d.id)),
        payment: pay,
    };
}

const buildOrders = (): Order[] => {
    const canceledIds = store.getStoreCanceled();
    return store.getStoreDrafts().map(d => toOrder(d, canceledIds));
};

// ── Local adapter ────────────────────────────────────────────────────────────
// Stable snapshot: rebuild the cache on every store emit so the reference only
// changes when state changes. Subscribed once at module load (before any screen
// mounts) so the cache is fresh before UI listeners run.
let ordersCache: Order[] = buildOrders();
store.subscribeBookings(() => {
    ordersCache = buildOrders();
});

export const localOrderGateway: OrderGateway = {
    init: (kv) => store.initBookingStore(kv),
    subscribe: (l) => store.subscribeBookings(l),

    submitOrder: (input) => store.submitBooking(input),
    getOrder: (id) => {
        const d = store.getStoreDrafts().find(x => x.id === id);
        return d ? toOrder(d, store.getStoreCanceled()) : undefined;
    },
    listOrders: () => buildOrders(),
    confirmOrder: (id) => {
        store.confirmOrder(id);
        return localOrderGateway.getOrder(id);
    },
    completeOrder: (id, completedAt) => {
        store.completeOrder(id, completedAt);
        return localOrderGateway.getOrder(id);
    },
    cancelOrder: (id) => {
        store.cancelOrder(id);
        return localOrderGateway.getOrder(id);
    },
    settleOrder: async (id, now) => {
        await store.settleOrderNow(id, now);
        return localOrderGateway.getOrder(id);
    },
    markPaid: (id) => {
        store.markOrderPaidByAdmin(id);
        return localOrderGateway.getOrder(id);
    },

    ordersSnapshot: () => ordersCache,
    leadsSnapshot: () => store.getStoreLeads(),

    captureLead: (input) => store.submitLeadCallback(input),
};

/**
 * The active binding. Local by default so the apps run offline. Flip to
 * httpOrderGateway (see httpOrderGateway.ts) once the backend is deployed —
 * a one-line change, no UI edits.
 */
export const orderGateway: OrderGateway = localOrderGateway;

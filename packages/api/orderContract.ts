/**
 * The FROZEN order contract — the only stable API surface. UI, the Local adapter,
 * the Http adapter and the backend all agree on these types. Nothing here knows
 * about storage or transport. (Build 04: extracted from orderGateway.ts so the
 * server can share the exact Order shape without importing an adapter.)
 */
import type { PaymentIntent, DeliveryDetails } from '../domain';
import type { SubmitBookingInput, SubmitBookingResult, SubmitLeadInput } from './bookingStore';
import type { KeyValueStore } from './preferences';
import type { Lead } from '../domain';

export type SubmitOrderInput = SubmitBookingInput;
export type SubmitOrderResult = SubmitBookingResult;
export type LeadInput = SubmitLeadInput;

/** Canonical order status (contract). Backends map their internal states to this. */
export type OrderStatus = 'confirmed' | 'completed' | 'canceled' | 'paid';

/** Backend-agnostic projection of an order. Same shape a real API returns. */
export interface Order {
    id: string;
    clientId?: string;
    serviceId?: string;
    cityId?: string;
    contact?: { phone?: string; email?: string };
    delivery?: DeliveryDetails;
    updatedAt: string;
    status: OrderStatus;
    payment?: PaymentIntent;
}

export interface OrderGateway {
    /** Composition root injects storage/transport here (called once at startup). */
    init(kv: KeyValueStore): Promise<void>;
    /** Subscribe to state changes (for useSyncExternalStore). */
    subscribe(listener: () => void): () => void;

    // ── the 8 canonical primitives ──
    submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult>;
    getOrder(id: string): Order | undefined;
    listOrders(): Order[];
    confirmOrder(id: string): Order | undefined;
    completeOrder(id: string, completedAt?: string): Order | undefined;
    cancelOrder(id: string): Order | undefined;
    settleOrder(id: string, now?: string): Promise<Order | undefined>;
    markPaid(id: string): Order | undefined;

    // ── reactive read models (stable snapshots) ──
    ordersSnapshot(): Order[];
    leadsSnapshot(): Lead[];

    // ── adjacent funnel op (lead capture) ──
    captureLead(input: LeadInput): Promise<Lead>;
}

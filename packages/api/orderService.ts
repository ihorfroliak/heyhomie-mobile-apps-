/**
 * Authoritative order service — the backend's business logic, framework-free.
 * Repo-injected so the SAME transitions run in tests (memory repo) and in the
 * deployed Fastify service (Postgres repo). Money-status semantics come from the
 * domain payment lifecycle, so Local and Http adapters can never diverge.
 *
 * Build 05: every method takes an `AuthContext`. Reads are tenant-scoped at the
 * repo (cross-tenant rows are invisible); mutations are deny-by-default via
 * `requireOwned` (cross-tenant / missing → FORBIDDEN_TENANT_ACCESS). tenantId is
 * a server-side column, NEVER exposed in the contract Order.
 *
 * Server status enum: draft | confirmed | canceled | paid | settled.
 */
import {
    createPaymentIntent,
    markDue,
    markPaid as domainMarkPaid,
    runCharge,
    clampLength,
    DELIVERY_NOTE_MAX,
    type PaymentIntent,
    type PaymentMethod,
    type DeliveryDetails,
    type Contact,
} from '../domain';
import type { Order, OrderStatus, SubmitOrderInput, SubmitOrderResult } from './orderContract';
import { requireOwned, type AuthContext } from './auth';

export type ServerOrderStatus = 'draft' | 'confirmed' | 'canceled' | 'paid' | 'settled';

export interface ServerOrder {
    id: string;
    tenantId: string; // server-side only — never in the contract Order
    status: ServerOrderStatus;
    createdAt: string;
    updatedAt: string;
    payload: {
        clientId: string;
        serviceId?: string;
        cityId?: string;
        contact?: Contact;
        delivery?: DeliveryDetails;
        paymentMethod: PaymentMethod;
        payment: PaymentIntent;
    };
}

/** Repo is ALWAYS tenant-scoped — no unscoped read/write exists. */
export interface OrderRepo {
    get(id: string, tenantId: string): Promise<ServerOrder | undefined>;
    put(order: ServerOrder): Promise<void>;
    list(tenantId: string): Promise<ServerOrder[]>;
}

/** In-memory repo (tests / the in-process fake backend). Tenant-scoped. */
export function memoryOrderRepo(): OrderRepo {
    const map = new Map<string, ServerOrder>();
    return {
        async get(id, tenantId) {
            const o = map.get(id);
            return o && o.tenantId === tenantId ? o : undefined;
        },
        async put(o) { map.set(o.id, o); },
        async list(tenantId) { return [...map.values()].filter(o => o.tenantId === tenantId); },
    };
}

const SERVER_TO_CONTRACT: Record<ServerOrderStatus, OrderStatus> = {
    draft: 'confirmed',
    confirmed: 'confirmed',
    canceled: 'canceled',
    settled: 'completed', // mission done, awaiting settlement
    paid: 'paid',
};

/** Map an authoritative ServerOrder to the frozen contract Order (drops tenantId). */
export function toContractOrder(o: ServerOrder): Order {
    return {
        id: o.id,
        clientId: o.payload.clientId,
        serviceId: o.payload.serviceId,
        cityId: o.payload.cityId,
        contact: o.payload.contact,
        delivery: o.payload.delivery,
        updatedAt: o.updatedAt,
        status: SERVER_TO_CONTRACT[o.status],
        payment: o.payload.payment,
    };
}

export interface OrderService {
    create(input: SubmitOrderInput, auth: AuthContext): Promise<SubmitOrderResult>;
    get(id: string, auth: AuthContext): Promise<ServerOrder | undefined>;
    list(auth: AuthContext): Promise<ServerOrder[]>;
    confirm(id: string, auth: AuthContext): Promise<ServerOrder | undefined>;
    cancel(id: string, auth: AuthContext): Promise<ServerOrder | undefined>;
    complete(id: string, auth: AuthContext, completedAt?: string): Promise<ServerOrder | undefined>;
    settle(id: string, auth: AuthContext, now?: string): Promise<ServerOrder | undefined>;
    markPaid(id: string, auth: AuthContext, now?: string): Promise<ServerOrder | undefined>;
    subscribe(listener: () => void): () => void;
}

let seq = 0;
const uid = (p: string) => `${p}-${Date.now()}-${++seq}`;

export function makeOrderService(repo: OrderRepo): OrderService {
    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach(l => l());

    const save = async (o: ServerOrder, now: string): Promise<ServerOrder> => {
        const next = { ...o, updatedAt: now };
        await repo.put(next);
        emit();
        return next;
    };

    /** Load an order the caller is allowed to mutate, else deny (no existence leak). */
    const owned = async (id: string, auth: AuthContext): Promise<ServerOrder> =>
        requireOwned(await repo.get(id, auth.tenantId), auth);

    return {
        async create(input, auth) {
            const now = new Date().toISOString();
            const id = uid('ord');
            const clientId = uid('cl');
            const method: PaymentMethod = input.paymentMethod ?? 'card';
            const payment = createPaymentIntent({ orderId: id, method, amount: input.estValue, email: input.contact.email });
            const delivery = input.delivery
                ? { ...input.delivery, note: input.delivery.note ? clampLength(input.delivery.note, DELIVERY_NOTE_MAX) : undefined }
                : undefined;
            const order: ServerOrder = {
                id,
                tenantId: auth.tenantId,
                status: 'confirmed',
                createdAt: now,
                updatedAt: now,
                payload: { clientId, serviceId: input.serviceId, cityId: input.cityId, contact: input.contact, delivery, paymentMethod: method, payment },
            };
            await repo.put(order);
            emit();
            const account = { id: clientId, firstName: (input.firstName ?? '').trim() || 'Friend', phone: input.contact.phone, email: input.contact.email, createdAt: now };
            const draft = { id, clientId, contact: input.contact, cityId: input.cityId, serviceId: input.serviceId, stage: 'confirmed' as const, updatedAt: now, delivery };
            return { account, isNewAccount: true, draft, payment };
        },
        get: (id, auth) => repo.get(id, auth.tenantId),
        list: (auth) => repo.list(auth.tenantId),
        async confirm(id, auth) {
            const o = await owned(id, auth);
            if (o.status === 'canceled') return save({ ...o, status: 'confirmed' }, new Date().toISOString());
            return o; // idempotent
        },
        async cancel(id, auth) {
            const o = await owned(id, auth);
            if (o.status === 'canceled') return o;
            return save({ ...o, status: 'canceled' }, new Date().toISOString());
        },
        async complete(id, auth, completedAt) {
            const o = await owned(id, auth);
            if (o.payload.payment.status !== 'awaiting_completion') return o;
            const at = completedAt ?? new Date().toISOString();
            const payment = markDue(o.payload.payment, at);
            return save({ ...o, status: 'settled', payload: { ...o.payload, payment } }, at);
        },
        async settle(id, auth, now) {
            const o = await owned(id, auth);
            const at = now ?? new Date().toISOString();
            const p = o.payload.payment;
            if (p.status === 'due') {
                const charged = runCharge(p, at);
                const status: ServerOrderStatus = charged.status === 'paid' ? 'paid' : 'settled';
                return save({ ...o, status, payload: { ...o.payload, payment: charged } }, at);
            }
            if (p.status === 'link_sent') {
                return save({ ...o, status: 'paid', payload: { ...o.payload, payment: domainMarkPaid(p, at) } }, at);
            }
            return o;
        },
        async markPaid(id, auth, now) {
            const o = await owned(id, auth);
            if (o.payload.payment.status === 'paid') return o;
            const at = now ?? new Date().toISOString();
            return save({ ...o, status: 'paid', payload: { ...o.payload, payment: domainMarkPaid(o.payload.payment, at) } }, at);
        },
        subscribe(l) {
            listeners.add(l);
            return () => listeners.delete(l);
        },
    };
}

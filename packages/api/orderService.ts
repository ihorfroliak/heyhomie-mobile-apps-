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
import { ConflictError } from './errors';

export type ServerOrderStatus = 'draft' | 'confirmed' | 'canceled' | 'paid' | 'settled';

export interface ServerOrder {
    id: string;
    tenantId: string; // server-side only — never in the contract Order
    /** Optimistic-concurrency version. Bumped on every write; the compare-and-swap
     *  in `update` rejects a stale write → no lost updates under parallel requests. */
    version: number;
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

/**
 * Repo is ALWAYS tenant-scoped — no unscoped read/write exists — and updates are
 * optimistic: `update(next, expectedVersion)` writes only if the row is still at
 * `expectedVersion`, else throws ConflictError. The service retries on conflict.
 */
export interface OrderRepo {
    get(id: string, tenantId: string): Promise<ServerOrder | undefined>;
    insert(order: ServerOrder): Promise<void>;
    update(order: ServerOrder, expectedVersion: number): Promise<ServerOrder>;
    list(tenantId: string): Promise<ServerOrder[]>;
}

/** In-memory repo (tests / the in-process fake backend). Tenant-scoped + CAS. */
export function memoryOrderRepo(): OrderRepo {
    const map = new Map<string, ServerOrder>();
    return {
        async get(id, tenantId) {
            const o = map.get(id);
            return o && o.tenantId === tenantId ? o : undefined;
        },
        async insert(o) {
            if (map.has(o.id)) throw new ConflictError('duplicate order id');
            map.set(o.id, o);
        },
        async update(o, expectedVersion) {
            const cur = map.get(o.id);
            // compare-and-swap: reject stale writers (lost-update guard).
            if (!cur || cur.tenantId !== o.tenantId || cur.version !== expectedVersion) throw new ConflictError('version conflict');
            const next = { ...o, version: expectedVersion + 1 };
            map.set(o.id, next);
            return next;
        },
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

/** Max optimistic retries. Losers become idempotent no-ops fast, so this is
 *  ample even for hundreds of contenders on one row. */
const MAX_CAS_RETRIES = 100;

/**
 * Pure state transitions (no I/O). Each returns the SAME object reference when it
 * is a no-op (→ the service skips the write), or a new one to persist. Terminal
 * invariants live here so they hold regardless of caller: a canceled order takes
 * no money transition; a paid order can't be canceled (would need a refund flow).
 */
type Transition = (o: ServerOrder, at: string) => ServerOrder;

const confirmT: Transition = (o) => (o.status === 'canceled' ? { ...o, status: 'confirmed' } : o);
const cancelT: Transition = (o) => (o.status === 'canceled' || o.payload.payment.status === 'paid' ? o : { ...o, status: 'canceled' });
const completeT = (completedAt: string): Transition => (o, at) => {
    if (o.status === 'canceled' || o.payload.payment.status !== 'awaiting_completion') return o;
    return { ...o, status: 'settled', payload: { ...o.payload, payment: markDue(o.payload.payment, completedAt || at) } };
};
const settleT: Transition = (o, at) => {
    if (o.status === 'canceled') return o;
    const p = o.payload.payment;
    if (p.status === 'due') {
        const charged = runCharge(p, at);
        return { ...o, status: charged.status === 'paid' ? 'paid' : 'settled', payload: { ...o.payload, payment: charged } };
    }
    if (p.status === 'link_sent') return { ...o, status: 'paid', payload: { ...o.payload, payment: domainMarkPaid(p, at) } };
    return o;
};
const markPaidT: Transition = (o, at) => {
    if (o.status === 'canceled' || o.payload.payment.status === 'paid') return o;
    return { ...o, status: 'paid', payload: { ...o.payload, payment: domainMarkPaid(o.payload.payment, at) } };
};

/**
 * Optional telemetry sink — orthogonal to business logic (observability only).
 * `mutation` fires once per completed service call with the op name, tenant,
 * order, whether a write was applied (vs idempotent no-op) and how many CAS
 * conflicts were retried. The server maps this onto Prometheus counters.
 */
export interface ServiceTelemetry {
    mutation?: (info: { op: string; orderId: string; tenantId: string; applied: boolean; conflictRetries: number }) => void;
}

export function makeOrderService(repo: OrderRepo, telemetry: ServiceTelemetry = {}): OrderService {
    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach(l => l());

    /**
     * Optimistic read-modify-write: read → apply the pure transition → CAS. On a
     * version conflict, re-read and re-apply — because transitions are idempotent
     * this converges to exactly-once effect (a loser re-reads the winner's state
     * and its transition becomes a no-op). Deny cross-tenant before any work.
     */
    const mutate = async (op: string, id: string, auth: AuthContext, transition: Transition): Promise<ServerOrder> => {
        for (let i = 0; i < MAX_CAS_RETRIES; i++) {
            const cur = requireOwned(await repo.get(id, auth.tenantId), auth);
            const at = new Date().toISOString();
            const next = transition(cur, at);
            if (next === cur) {
                telemetry.mutation?.({ op, orderId: id, tenantId: auth.tenantId, applied: false, conflictRetries: i });
                return cur; // no-op → no write, no version bump
            }
            try {
                const saved = await repo.update({ ...next, updatedAt: at }, cur.version);
                emit();
                telemetry.mutation?.({ op, orderId: id, tenantId: auth.tenantId, applied: true, conflictRetries: i });
                return saved;
            } catch (e) {
                if (e instanceof ConflictError) continue; // stale — re-read and retry
                throw e;
            }
        }
        throw new ConflictError('order update contention exceeded retry budget');
    };

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
                version: 1,
                status: 'confirmed',
                createdAt: now,
                updatedAt: now,
                payload: { clientId, serviceId: input.serviceId, cityId: input.cityId, contact: input.contact, delivery, paymentMethod: method, payment },
            };
            await repo.insert(order);
            emit();
            telemetry.mutation?.({ op: 'create', orderId: id, tenantId: auth.tenantId, applied: true, conflictRetries: 0 });
            const account = { id: clientId, firstName: (input.firstName ?? '').trim() || 'Friend', phone: input.contact.phone, email: input.contact.email, createdAt: now };
            const draft = { id, clientId, contact: input.contact, cityId: input.cityId, serviceId: input.serviceId, stage: 'confirmed' as const, updatedAt: now, delivery };
            return { account, isNewAccount: true, draft, payment };
        },
        get: (id, auth) => repo.get(id, auth.tenantId),
        list: (auth) => repo.list(auth.tenantId),
        confirm: (id, auth) => mutate('confirm', id, auth, confirmT),
        cancel: (id, auth) => mutate('cancel', id, auth, cancelT),
        complete: (id, auth, completedAt) => mutate('complete', id, auth, completeT(completedAt ?? '')),
        settle: (id, auth) => mutate('settle', id, auth, settleT),
        markPaid: (id, auth) => mutate('markPaid', id, auth, markPaidT),
        subscribe(l) {
            listeners.add(l);
            return () => listeners.delete(l);
        },
    };
}

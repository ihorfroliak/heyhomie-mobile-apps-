/**
 * HTTP adapter — drop-in OrderGateway backed by the orders service. No local
 * store logic. Reads come from a cache fed by the change feed (`/orders/stream`);
 * mutations POST to the backend and reconcile through the same stream (eventual
 * consistency — sync methods return the current cache, the stream delivers truth).
 *
 * The gateway is transport-agnostic via `OrderBackendPort`: the real port speaks
 * HTTP+SSE; the in-process fake (fakeBackend.ts) drives the SAME orderService so
 * the contract test proves the mapping without a live server.
 */
import type { Order, OrderGateway, SubmitOrderInput, SubmitOrderResult } from './orderContract';

export interface OrderBackendPort {
    /** Subscribe to full-snapshot updates; emits the initial snapshot on connect. */
    connect(onSnapshot: (orders: Order[]) => void): () => void;
    submit(input: SubmitOrderInput): Promise<SubmitOrderResult>;
    confirm(id: string): Promise<void>;
    cancel(id: string): Promise<void>;
    complete(id: string, completedAt?: string): Promise<void>;
    settle(id: string, now?: string): Promise<void>;
    markPaid(id: string): Promise<void>;
}

export function makeHttpOrderGateway(port: OrderBackendPort): OrderGateway {
    let cache: Order[] = [];
    let index = new Map<string, Order>();
    const listeners = new Set<() => void>();
    let disconnect: (() => void) | null = null;

    const setSnapshot = (orders: Order[]) => {
        cache = orders; // new reference each snapshot → useSyncExternalStore-safe
        index = new Map(orders.map(o => [o.id, o]));
        listeners.forEach(l => l());
    };

    return {
        async init() {
            if (!disconnect) disconnect = port.connect(setSnapshot);
        },
        subscribe(l) {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        submitOrder: (input) => port.submit(input),
        getOrder: (id) => index.get(id),
        listOrders: () => cache,
        // Sync mutations: fire-and-reconcile — POST async, stream delivers truth.
        confirmOrder: (id) => { void port.confirm(id); return index.get(id); },
        completeOrder: (id, at) => { void port.complete(id, at); return index.get(id); },
        cancelOrder: (id) => { void port.cancel(id); return index.get(id); },
        markPaid: (id) => { void port.markPaid(id); return index.get(id); },
        settleOrder: async (id, now) => { await port.settle(id, now); return index.get(id); },
        ordersSnapshot: () => cache,
        leadsSnapshot: () => [], // leads are a separate context, out of Build 04 scope
        captureLead: async () => {
            throw new Error('leads not served by the orders backend (out of Build 04 scope)');
        },
    };
}

/* ── Real HTTP + SSE port (used once the backend is deployed) ─────────────── */

type FetchLike = typeof fetch;
interface EventSourceLike {
    onmessage: ((ev: { data: string }) => void) | null;
    close(): void;
}
type EventSourceFactory = (url: string) => EventSourceLike;

export interface HttpPortConfig {
    baseUrl: string;
    /** Opaque bearer token minted by the server's auth. Tenant/user are inside it —
     *  the UI never sees or sets a tenant. Provide a getter for token refresh. */
    getToken: () => string | undefined;
    fetchImpl?: FetchLike;
    /** SSE factory; defaults to global EventSource where available. */
    eventSource?: EventSourceFactory;
}

/** Maps the OrderGateway port to REST endpoints + the `/orders/stream` SSE feed. */
export function httpOrderPort(config: HttpPortConfig): OrderBackendPort {
    const base = config.baseUrl.replace(/\/$/, '');
    const doFetch: FetchLike = config.fetchImpl ?? (globalThis.fetch as FetchLike);
    const authHeaders = (): Record<string, string> => {
        const t = config.getToken();
        return { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) };
    };
    const post = async (path: string, body?: unknown): Promise<Response> =>
        doFetch(`${base}${path}`, { method: 'POST', headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });

    return {
        connect(onSnapshot) {
            // EventSource can't set headers in browsers — the token rides as a query
            // param, verified server-side (same trust boundary as the Bearer header).
            const t = config.getToken();
            const url = `${base}/orders/stream${t ? `?token=${encodeURIComponent(t)}` : ''}`;
            const factory = config.eventSource ?? ((u: string) => new (globalThis as unknown as { EventSource: new (u: string) => EventSourceLike }).EventSource(u));
            const es = factory(url);
            es.onmessage = (ev) => {
                try { onSnapshot(JSON.parse(ev.data) as Order[]); } catch { /* skip malformed frame */ }
            };
            return () => es.close();
        },
        submit: async (input) => (await post('/orders', input)).json() as Promise<SubmitOrderResult>,
        confirm: async (id) => { await post(`/orders/${id}/confirm`); },
        cancel: async (id) => { await post(`/orders/${id}/cancel`); },
        complete: async (id, completedAt) => { await post(`/orders/${id}/complete`, { completedAt }); },
        settle: async (id, now) => { await post(`/orders/${id}/settle`, { now }); },
        markPaid: async (id) => { await post(`/orders/${id}/mark-paid`); },
    };
}

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
import { HttpStatusError, RetryBudget, backoffDelay, dedupe, withRetry, withTimeout } from './httpResilience';
import { idempotencyKeyFor } from './idempotency';

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
    onerror?: ((ev?: unknown) => void) | null;
    close(): void;
}
type EventSourceFactory = (url: string) => EventSourceLike;

/** Injectable timers so reconnect/heartbeat logic is deterministically testable. */
export interface TimerHost {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
    now: () => number;
}
const realTimers: TimerHost = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now() };

export interface HttpPortConfig {
    baseUrl: string;
    /** Opaque bearer token minted by the server's auth. Tenant/user are inside it —
     *  the UI never sees or sets a tenant. Provide a getter for token refresh. */
    getToken: () => string | undefined;
    fetchImpl?: FetchLike;
    /** SSE factory; defaults to global EventSource where available. */
    eventSource?: EventSourceFactory;
    /** Per-request timeout (ms). Default 10s. */
    timeoutMs?: number;
    /** Retry tuning for idempotent requests. */
    retry?: { maxRetries?: number; baseMs?: number; maxMs?: number; maxWindowMs?: number };
    /** Stream: consider the connection dead if no frame/heartbeat within this window. */
    heartbeatMs?: number;
    /** Stream reconnect backoff bounds. */
    reconnectBaseMs?: number;
    reconnectMaxMs?: number;
    timers?: TimerHost;
    /** Observability sink: retry attempts, timeouts, SSE reconnects. */
    onTelemetry?: (event: 'retry' | 'timeout' | 'sse_reconnect') => void;
}

/** Maps the OrderGateway port to REST endpoints + the `/orders/stream` SSE feed,
 *  with timeouts, bounded retries on idempotent ops, dedupe, and a self-healing
 *  stream (reconnect + heartbeat watchdog). */
export function httpOrderPort(config: HttpPortConfig): OrderBackendPort {
    const base = config.baseUrl.replace(/\/$/, '');
    const doFetch: FetchLike = config.fetchImpl ?? (globalThis.fetch as FetchLike);
    const timers = config.timers ?? realTimers;
    const timeoutMs = config.timeoutMs ?? 10_000;
    const heartbeatMs = config.heartbeatMs ?? 30_000;
    const reconnectBaseMs = config.reconnectBaseMs ?? 500;
    const reconnectMaxMs = config.reconnectMaxMs ?? 15_000;
    const rOpts = {
        maxRetries: config.retry?.maxRetries ?? 3,
        baseMs: config.retry?.baseMs ?? 200,
        maxMs: config.retry?.maxMs ?? 3_000,
        maxWindowMs: config.retry?.maxWindowMs ?? 15_000,
    };
    const budget = new RetryBudget(20, 5); // shared cap: no retry storms
    const dedup = dedupe();
    const tel = config.onTelemetry ?? (() => {});
    let corrSeq = 0;
    // One correlationId per logical call — retries of the same call REUSE it, so
    // server logs group all attempts of one operation under one id.
    const newCorrelationId = () => `c-${Date.now().toString(36)}-${(++corrSeq).toString(36)}`;

    const authHeaders = (correlationId: string, extra?: Record<string, string>): Record<string, string> => {
        const t = config.getToken();
        return {
            'content-type': 'application/json',
            'x-correlation-id': correlationId,
            ...(t ? { authorization: `Bearer ${t}` } : {}),
            ...extra,
        };
    };
    const rawPost = (path: string, body: unknown, signal: AbortSignal, correlationId: string, extra?: Record<string, string>) =>
        doFetch(`${base}${path}`, { method: 'POST', headers: authHeaders(correlationId, extra), body: body !== undefined ? JSON.stringify(body) : undefined, signal }).then(res => {
            if (!res.ok) throw new HttpStatusError(res.status, `POST ${path} → ${res.status}`);
            return res;
        });

    const once = async (path: string, body?: unknown, correlationId: string = newCorrelationId(), extra?: Record<string, string>) => {
        try {
            return await withTimeout(signal => rawPost(path, body, signal, correlationId, extra), timeoutMs);
        } catch (e) {
            if (e instanceof Error && e.message.includes('timeout')) tel('timeout');
            throw e;
        }
    };
    /** Idempotent mutation: retried within budget + deduped by (op,id) against double-fire. */
    const idempotent = (path: string, key: string, body?: unknown) => {
        const correlationId = newCorrelationId();
        return dedup(key, () => withRetry((attempt) => {
            if (attempt > 0) tel('retry');
            return once(path, body, correlationId);
        }, { ...rOpts, budget }));
    };

    return {
        connect(onSnapshot) {
            let es: EventSourceLike | null = null;
            let attempt = 0;
            let hbHandle: unknown = null;
            let reconnectHandle: unknown = null;
            let lastMsg = timers.now();
            let closed = false;

            const stopTimers = () => {
                if (hbHandle) { timers.clear(hbHandle); hbHandle = null; }
                if (reconnectHandle) { timers.clear(reconnectHandle); reconnectHandle = null; }
            };
            const scheduleReconnect = () => {
                if (closed) return;
                stopTimers();
                try { es?.close(); } catch { /* ignore */ }
                es = null;
                tel('sse_reconnect');
                const delay = backoffDelay(attempt++, { baseMs: reconnectBaseMs, maxMs: reconnectMaxMs });
                reconnectHandle = timers.set(open, delay);
            };
            const watchHeartbeat = () => {
                if (closed) return;
                if (timers.now() - lastMsg > heartbeatMs * 2) { scheduleReconnect(); return; } // dead connection
                hbHandle = timers.set(watchHeartbeat, heartbeatMs);
            };
            function open() {
                if (closed) return;
                const t = config.getToken();
                // Full-snapshot frames make replay trivial: (re)connect always re-emits
                // current state, so no missed-event cursor is needed.
                const url = `${base}/orders/stream${t ? `?token=${encodeURIComponent(t)}` : ''}`;
                const factory = config.eventSource ?? ((u: string) => new (globalThis as unknown as { EventSource: new (u: string) => EventSourceLike }).EventSource(u));
                es = factory(url);
                lastMsg = timers.now();
                es.onmessage = (ev) => {
                    lastMsg = timers.now();
                    attempt = 0; // healthy frame resets backoff
                    try { onSnapshot(JSON.parse(ev.data) as Order[]); } catch { /* skip malformed frame */ }
                };
                es.onerror = () => scheduleReconnect();
                hbHandle = timers.set(watchHeartbeat, heartbeatMs);
            }

            open();
            return () => { closed = true; stopTimers(); try { es?.close(); } catch { /* ignore */ } es = null; };
        },
        // create is NOT auto-retried (avoids dup orders), but carries a content-hash
        // Idempotency-Key so a client/user retry of the SAME booking is deduped
        // server-side into one order (Build 17).
        submit: async (input) => (await once('/orders', input, newCorrelationId(), { 'idempotency-key': idempotencyKeyFor(input) })).json() as Promise<SubmitOrderResult>,
        confirm: async (id) => { await idempotent(`/orders/${id}/confirm`, `confirm:${id}`); },
        cancel: async (id) => { await idempotent(`/orders/${id}/cancel`, `cancel:${id}`); },
        complete: async (id, completedAt) => { await idempotent(`/orders/${id}/complete`, `complete:${id}`, { completedAt }); },
        settle: async (id, now) => { await idempotent(`/orders/${id}/settle`, `settle:${id}`, { now }); },
        markPaid: async (id) => { await idempotent(`/orders/${id}/mark-paid`, `markPaid:${id}`); },
    };
}

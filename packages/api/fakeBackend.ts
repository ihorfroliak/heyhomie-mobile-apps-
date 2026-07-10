/**
 * In-process fake of the orders backend. Implements OrderBackendPort over the
 * REAL orderService (memory repo) — the exact logic the Fastify server deploys.
 * Lets the contract test run httpOrderGateway end-to-end with no live server.
 *
 * A session has ONE tenant (like a real authenticated connection): `auth` is
 * captured here and passed to the shared service on every call — the gateway
 * stays auth-agnostic. Optionally share a `service` across sessions to model
 * two tenants hitting the same backend.
 */
import type { OrderBackendPort } from './httpOrderGateway';
import type { Order } from './orderContract';
import type { AuthContext } from './auth';
import { makeOrderService, memoryOrderRepo, toContractOrder, type OrderService } from './orderService';

export function fakeOrderBackend(auth: AuthContext, service?: OrderService): OrderBackendPort {
    const svc = service ?? makeOrderService(memoryOrderRepo());
    const snapshotListeners = new Set<(o: Order[]) => void>();

    const pushSnapshot = async () => {
        const orders = (await svc.list(auth)).map(toContractOrder); // tenant-scoped
        snapshotListeners.forEach(l => l(orders));
    };
    // Subscribe to the service only while at least one connection is open —
    // otherwise a shared service would accumulate one dangling subscription per
    // fake session (listener leak found in the Build 09 resource audit).
    let unsubService: (() => void) | null = null;

    return {
        connect(onSnapshot) {
            snapshotListeners.add(onSnapshot);
            if (!unsubService) unsubService = svc.subscribe(() => { void pushSnapshot(); });
            void pushSnapshot(); // initial frame
            return () => {
                snapshotListeners.delete(onSnapshot);
                if (snapshotListeners.size === 0 && unsubService) { unsubService(); unsubService = null; }
            };
        },
        submit: (input) => svc.create(input, auth),
        confirm: async (id) => { await svc.confirm(id, auth); },
        cancel: async (id) => { await svc.cancel(id, auth); },
        complete: async (id, at) => { await svc.complete(id, auth, at); },
        settle: async (id, now) => { await svc.settle(id, auth, now); },
        markPaid: async (id) => { await svc.markPaid(id, auth); },
    };
}

/**
 * In-process fake of the orders backend. Implements OrderBackendPort over the
 * REAL orderService (memory repo) — the exact logic the Fastify server deploys.
 * Lets the contract test run httpOrderGateway end-to-end with no live server.
 */
import type { OrderBackendPort } from './httpOrderGateway';
import type { Order } from './orderContract';
import type { AuthContext } from './auth';
import { makeOrderService, memoryOrderRepo, toContractOrder, type OrderService, type OrderRepo } from './orderService';

/**
 * In-process fake of the orders backend. A session has ONE tenant (like a real
 * authenticated connection): `auth` is captured here and passed to the shared
 * service on every call — the gateway stays auth-agnostic. Optionally share a
 * `service` across sessions to model two tenants hitting the same backend.
 */
export function fakeOrderBackend(auth: AuthContext, service?: OrderService): OrderBackendPort {
    const svc = service ?? makeOrderService(memoryOrderRepo());
    const snapshotListeners = new Set<(o: Order[]) => void>();

    const pushSnapshot = async () => {
        const orders = (await svc.list(auth)).map(toContractOrder); // tenant-scoped
        snapshotListeners.forEach(l => l(orders));
    };
    svc.subscribe(() => { void pushSnapshot(); });

    return {
        connect(onSnapshot) {
            snapshotListeners.add(onSnapshot);
            void pushSnapshot(); // initial frame
            return () => snapshotListeners.delete(onSnapshot);
        },
        submit: (input) => svc.create(input, auth),
        confirm: async (id) => { await svc.confirm(id, auth); },
        cancel: async (id) => { await svc.cancel(id, auth); },
        complete: async (id, at) => { await svc.complete(id, auth, at); },
        settle: async (id, now) => { await svc.settle(id, auth, now); },
        markPaid: async (id) => { await svc.markPaid(id, auth); },
    };
}

/** Shared service so tests can wire two tenant sessions against one backend. */
export function makeSharedFakeService(): OrderService {
    return makeOrderService(memoryOrderRepo());
}

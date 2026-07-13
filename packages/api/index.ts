export * from './mock';
export * from './demo';
export * from './config';
export * from './http';
export * from './homieClient';
export * from './session';
export * from './preferences';
export * from './marketingClient';
export * from './accountingClient';
export * from './notifyClient';
// bookingStore is a PRIVATE implementation detail — NOT exported. UI must go
// through the OrderGateway. Importing the store from '@heyhomie/api' will fail.
export * from './errors'; // canonical AppError hierarchy
export * from './auth'; // AuthContext, tenant guard, token-claims validation (pure)
export * from './authSession'; // pure credential/session service + AuthRepo/AuthCrypto ports (Build 18)
export * from './authClient'; // client auth: login/refresh/logout + sync getToken/authFetch (Build 20)
export * from './notificationPort'; // capability-token delivery seam (invite/reset) — Build 26
export * from './orderValidation'; // boundary input validation
export * from './rateLimiter'; // in-memory token-bucket limiter
export * from './metrics'; // pure Prometheus registry (Counter/Gauge/Histogram)
export * from './idempotency'; // create-dedup store + content-hash key (Build 17)
export * from './serverConfig'; // fail-fast env validation (server boot)
export * from './orderContract'; // frozen types (Order, OrderGateway, Submit* ...)
export * from './orderGateway'; // Local adapter + active `orderGateway` binding
export * from './httpOrderGateway'; // Http adapter + real port (drop-in)
export * from './orderService'; // authoritative service (shared by server + fake)
export * from './fakeBackend'; // in-process backend for tests/dev

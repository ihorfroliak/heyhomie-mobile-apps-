/**
 * Server metric set over the pure registry. Every metric documented in
 * docs/observability/metrics_reference.md. Exposed at GET /metrics (public,
 * safe: counts + latencies only — no ids, no PII, no secrets).
 */
import { MetricsRegistry, type ServiceTelemetry } from '@heyhomie/api';

export function makeServerMetrics() {
    const registry = new MetricsRegistry();

    const httpRequests = registry.counter('http_requests_total', 'HTTP requests by method/route/status');
    const httpDuration = registry.histogram('http_request_duration_seconds', 'Request latency', [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]);
    const activeRequests = registry.gauge('active_requests', 'In-flight HTTP requests');

    const orderMutations = registry.counter('order_mutations_total', 'Order mutations by op/applied (create/confirm/cancel/complete/settle/markPaid)');
    const repoConflicts = registry.counter('repository_conflicts_total', 'Optimistic-CAS conflicts retried');

    const errors = registry.counter('errors_total', 'Canonical errors by code/status/retryable');
    const authFailures = registry.counter('auth_failures_total', 'Rejected authentications (401)');
    const tenantForbidden = registry.counter('tenant_forbidden_total', 'Cross-tenant denials (403)');
    const sseConnections = registry.gauge('sse_connections_active', 'Open SSE change-feed connections');

    /** Bridge orderService telemetry → Prometheus. */
    const serviceTelemetry: ServiceTelemetry = {
        mutation: (i) => {
            orderMutations.inc({ op: i.op, applied: String(i.applied) });
            if (i.conflictRetries > 0) repoConflicts.inc({}, i.conflictRetries);
        },
    };

    return { registry, httpRequests, httpDuration, activeRequests, orderMutations, repoConflicts, errors, authFailures, tenantForbidden, sseConnections, serviceTelemetry };
}

export type ServerMetrics = ReturnType<typeof makeServerMetrics>;

/**
 * Minimal Prometheus metrics — pure TS, zero dependencies (no prom-client, no
 * OpenTelemetry per Build 06 constraints). Counter + Histogram with labels,
 * rendered in the Prometheus text exposition format. Fully unit-testable; the
 * server exposes `registry.render()` at GET /metrics.
 */

type Labels = Record<string, string>;

/** Stable series key: sorted label pairs. */
const seriesKey = (labels: Labels): string =>
    Object.keys(labels).sort().map(k => `${k}="${labels[k].replace(/"/g, '\\"')}"`).join(',');

const seriesSuffix = (key: string): string => (key ? `{${key}}` : '');

export class Counter {
    private series = new Map<string, number>();
    constructor(public readonly name: string, public readonly help: string) {}
    inc(labels: Labels = {}, value = 1): void {
        const k = seriesKey(labels);
        this.series.set(k, (this.series.get(k) ?? 0) + value);
    }
    value(labels: Labels = {}): number {
        return this.series.get(seriesKey(labels)) ?? 0;
    }
    render(): string {
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
        if (this.series.size === 0) lines.push(`${this.name} 0`);
        for (const [k, v] of this.series) lines.push(`${this.name}${seriesSuffix(k)} ${v}`);
        return lines.join('\n');
    }
}

export class Gauge {
    private series = new Map<string, number>();
    constructor(public readonly name: string, public readonly help: string) {}
    set(value: number, labels: Labels = {}): void { this.series.set(seriesKey(labels), value); }
    add(delta: number, labels: Labels = {}): void {
        const k = seriesKey(labels);
        this.series.set(k, (this.series.get(k) ?? 0) + delta);
    }
    value(labels: Labels = {}): number { return this.series.get(seriesKey(labels)) ?? 0; }
    render(): string {
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
        if (this.series.size === 0) lines.push(`${this.name} 0`);
        for (const [k, v] of this.series) lines.push(`${this.name}${seriesSuffix(k)} ${v}`);
        return lines.join('\n');
    }
}

export class Histogram {
    private buckets: number[];
    private counts = new Map<string, number[]>(); // per-series cumulative-later bucket counts
    private sums = new Map<string, number>();
    private totals = new Map<string, number>();
    constructor(public readonly name: string, public readonly help: string, buckets: number[]) {
        this.buckets = [...buckets].sort((a, b) => a - b);
    }
    observe(value: number, labels: Labels = {}): void {
        const k = seriesKey(labels);
        if (!this.counts.has(k)) this.counts.set(k, this.buckets.map(() => 0));
        const c = this.counts.get(k) as number[];
        for (let i = 0; i < this.buckets.length; i++) if (value <= this.buckets[i]) c[i] += 1;
        this.sums.set(k, (this.sums.get(k) ?? 0) + value);
        this.totals.set(k, (this.totals.get(k) ?? 0) + 1);
    }
    count(labels: Labels = {}): number { return this.totals.get(seriesKey(labels)) ?? 0; }
    render(): string {
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
        for (const [k, c] of this.counts) {
            for (let i = 0; i < this.buckets.length; i++) {
                const le = seriesKey({}) === k && !k ? `le="${this.buckets[i]}"` : `${k}${k ? ',' : ''}le="${this.buckets[i]}"`;
                lines.push(`${this.name}_bucket{${le}} ${c[i]}`);
            }
            lines.push(`${this.name}_bucket{${k}${k ? ',' : ''}le="+Inf"} ${this.totals.get(k) ?? 0}`);
            lines.push(`${this.name}_sum${seriesSuffix(k)} ${this.sums.get(k) ?? 0}`);
            lines.push(`${this.name}_count${seriesSuffix(k)} ${this.totals.get(k) ?? 0}`);
        }
        return lines.join('\n');
    }
}

export class MetricsRegistry {
    private metrics: (Counter | Gauge | Histogram)[] = [];
    counter(name: string, help: string): Counter { const m = new Counter(name, help); this.metrics.push(m); return m; }
    gauge(name: string, help: string): Gauge { const m = new Gauge(name, help); this.metrics.push(m); return m; }
    histogram(name: string, help: string, buckets: number[]): Histogram { const m = new Histogram(name, help, buckets); this.metrics.push(m); return m; }
    render(): string { return this.metrics.map(m => m.render()).join('\n') + '\n'; }
}

/** Cohort retention — group clients by first-order month, track repeat activity. */
import type { Mission } from './missions';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Add k months to a 'YYYY-MM' string. */
export function addMonths(ym: string, k: number): string {
    const [y, m] = ym.split('-').map(Number);
    const total = (y * 12 + (m - 1)) + k;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export interface Cohort {
    month: string; // cohort = first-order month
    size: number;
    /** retention[k] = share (0–1) of the cohort active k months after the cohort month. */
    retention: number[];
}

/**
 * Retention by acquisition cohort. Uses completed missions: a client's cohort is
 * their first order month; retention[k] measures who ordered again k months later.
 */
export function cohortRetention(missions: Mission[], maxOffset = 3): Cohort[] {
    const monthsByClient = new Map<string, Set<string>>();
    for (const m of missions) {
        if (m.status !== 'done') continue;
        const set = monthsByClient.get(m.client.id) ?? new Set<string>();
        set.add(m.scheduledAt.slice(0, 7));
        monthsByClient.set(m.client.id, set);
    }

    const cohortOf = new Map<string, string>();
    for (const [client, months] of monthsByClient) cohortOf.set(client, [...months].sort()[0]);

    const groups = new Map<string, string[]>();
    for (const [client, cohort] of cohortOf) {
        const arr = groups.get(cohort) ?? [];
        arr.push(client);
        groups.set(cohort, arr);
    }

    return [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, clients]) => {
            const retention: number[] = [];
            for (let k = 0; k <= maxOffset; k++) {
                const target = addMonths(month, k);
                const active = clients.filter(c => monthsByClient.get(c)!.has(target)).length;
                retention.push(round2(active / clients.length));
            }
            return { month, size: clients.length, retention };
        });
}

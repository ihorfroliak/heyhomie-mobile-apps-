/**
 * CRM — client 360, lifetime value and RFM-lite segmentation.
 *
 * Profiles are aggregated from completed missions (the same source the backend
 * holds). Communication events come from the backend (Twilio / Mailgun) — modelled
 * here so the admin can show a unified history. Pure + tested.
 */
import type { Mission, AcquisitionSource } from './missions';

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayMs = 86_400_000;
const daysBetween = (aIso: string, bIso: string) => Math.floor((new Date(`${bIso.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${aIso.slice(0, 10)}T00:00:00Z`).getTime()) / dayMs);

export interface ClientProfile {
    id: string;
    firstName: string;
    lastInitial?: string;
    city?: string;
    orders: number; // completed missions
    totalSpent: number; // lifetime value
    avgOrder: number;
    firstOrderAt?: string;
    lastOrderAt?: string;
    source?: AcquisitionSource;
}

/** Aggregate completed missions into one profile per client (highest LTV first). */
export function clientProfiles(missions: Mission[]): ClientProfile[] {
    const map = new Map<string, ClientProfile>();
    for (const m of missions) {
        if (m.status !== 'done') continue;
        const c = m.client;
        const p =
            map.get(c.id) ??
            ({ id: c.id, firstName: c.firstName, lastInitial: c.lastInitial, city: m.address.city, orders: 0, totalSpent: 0, avgOrder: 0, source: m.acquisitionSource } as ClientProfile);
        p.orders += 1;
        p.totalSpent = round2(p.totalSpent + m.price);
        if (!p.firstOrderAt || m.scheduledAt < p.firstOrderAt) p.firstOrderAt = m.scheduledAt;
        if (!p.lastOrderAt || m.scheduledAt > p.lastOrderAt) p.lastOrderAt = m.scheduledAt;
        map.set(c.id, p);
    }
    return [...map.values()]
        .map(p => ({ ...p, avgOrder: p.orders ? Math.round(p.totalSpent / p.orders) : 0 }))
        .sort((a, b) => b.totalSpent - a.totalSpent);
}

export function clientProfile(missions: Mission[], clientId: string): ClientProfile | undefined {
    return clientProfiles(missions).find(p => p.id === clientId);
}

/** Completed missions of one client, newest first (for the 360 history). */
export function clientMissions(missions: Mission[], clientId: string): Mission[] {
    return missions.filter(m => m.client.id === clientId).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

export type Segment = 'champion' | 'loyal' | 'new' | 'at_risk' | 'lost';

/**
 * RFM-lite segment for a client as of `refIso`:
 *  lost      — no order in > 180 days
 *  at_risk   — last order 90–180 days ago
 *  champion  — 3+ orders and active (≤ 90 days)
 *  new       — 1 order, within 30 days
 *  loyal     — everything else active
 */
export function segmentFor(p: ClientProfile, refIso: string): Segment {
    if (!p.lastOrderAt) return 'lost';
    const recency = daysBetween(p.lastOrderAt, refIso);
    if (recency > 180) return 'lost';
    if (recency > 90) return 'at_risk';
    if (p.orders >= 3) return 'champion';
    if (p.orders === 1 && recency <= 30) return 'new';
    return 'loyal';
}

export function segmentCounts(profiles: ClientProfile[], refIso: string): Record<Segment, number> {
    const counts: Record<Segment, number> = { champion: 0, loyal: 0, new: 0, at_risk: 0, lost: 0 };
    for (const p of profiles) counts[segmentFor(p, refIso)] += 1;
    return counts;
}

/** Communication event (data from Twilio / Mailgun; modelled for a unified log). */
export interface CommEvent {
    id: string;
    clientId: string;
    channel: 'sms' | 'email' | 'call';
    direction: 'in' | 'out';
    at: string;
    summary: string;
}

export const clientComms = (comms: CommEvent[], clientId: string): CommEvent[] => comms.filter(c => c.clientId === clientId).sort((a, b) => b.at.localeCompare(a.at));

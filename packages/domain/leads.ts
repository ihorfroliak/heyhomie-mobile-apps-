/**
 * Leads — potential clients we can follow up with. Sources: a callback request
 * from a lead-only service (office / post-renovation), an abandoned booking that
 * left a contact, a referral, or an import. Pure + tested.
 */
import { abandonedDrafts, type BookingDraft } from './funnel';
import type { Contact } from './identity';

export type LeadSource = 'callback' | 'abandoned_booking' | 'referral' | 'import';
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost';

export interface Lead {
    id: string;
    contact: Contact;
    source: LeadSource;
    serviceInterest?: string; // catalog service id
    cityId?: string;
    createdAt: string;
    status: LeadStatus;
    note?: string;
}

export const isOpenLead = (l: Lead): boolean => l.status === 'new' || l.status === 'contacted';

export const openLeads = (leads: Lead[]): Lead[] => leads.filter(isOpenLead);

export function leadCounts(leads: Lead[]): Record<LeadStatus, number> {
    const c: Record<LeadStatus, number> = { new: 0, contacted: 0, converted: 0, lost: 0 };
    for (const l of leads) c[l.status] += 1;
    return c;
}

/** Convert abandoned drafts that left a contact into follow-up leads. */
export function leadsFromDrafts(drafts: BookingDraft[], nowIso: string, thresholdMin?: number): Lead[] {
    return abandonedDrafts(drafts, nowIso, thresholdMin)
        .filter(d => d.contact && (d.contact.phone || d.contact.email))
        .map(d => ({
            id: `lead-${d.id}`,
            contact: d.contact!,
            source: 'abandoned_booking' as LeadSource,
            serviceInterest: d.serviceId,
            cityId: d.cityId,
            createdAt: d.updatedAt,
            status: 'new' as LeadStatus,
        }));
}

/** Merge explicit leads with those derived from abandoned drafts, de-duped by contact. */
export function allLeads(explicit: Lead[], drafts: BookingDraft[], nowIso: string, thresholdMin?: number): Lead[] {
    const derived = leadsFromDrafts(drafts, nowIso, thresholdMin);
    const seen = new Set(explicit.map(l => l.contact.phone ?? l.contact.email));
    return [...explicit, ...derived.filter(l => !seen.has(l.contact.phone ?? l.contact.email))];
}

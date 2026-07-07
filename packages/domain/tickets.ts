/** Support tickets — from clients and homies. Pure + tested. */

export type TicketStatus = 'open' | 'pending' | 'resolved';
export type TicketPriority = 'low' | 'normal' | 'high';
export type TicketAuthor = 'client' | 'homie';

export interface Ticket {
    id: string;
    subject: string;
    author: TicketAuthor;
    authorName: string;
    status: TicketStatus;
    priority: TicketPriority;
    createdAt: string;
}

const PRIORITY_ORDER: Record<TicketPriority, number> = { high: 0, normal: 1, low: 2 };

export function ticketCounts(tickets: Ticket[]): Record<TicketStatus, number> {
    const counts: Record<TicketStatus, number> = { open: 0, pending: 0, resolved: 0 };
    for (const t of tickets) counts[t.status] += 1;
    return counts;
}

/** Unresolved tickets, most urgent first (priority, then newest). */
export function openTickets(tickets: Ticket[]): Ticket[] {
    return tickets
        .filter(t => t.status !== 'resolved')
        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt.localeCompare(a.createdAt));
}

/** Workflow order; a quick action cycles through it (resolved wraps back to open = reopen). */
export const TICKET_FLOW: TicketStatus[] = ['open', 'pending', 'resolved'];

export const nextTicketStatus = (s: TicketStatus): TicketStatus =>
    TICKET_FLOW[(TICKET_FLOW.indexOf(s) + 1) % TICKET_FLOW.length];

/** Set one ticket's status by id (returns a new array). */
export const setTicketStatus = (tickets: Ticket[], id: string, status: TicketStatus): Ticket[] =>
    tickets.map(t => (t.id === id ? { ...t, status } : t));

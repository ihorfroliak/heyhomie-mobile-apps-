/**
 * Invoicing / accounting. Invoices are pulled from Stripe (card payments) and
 * Fakturownia.pl (Polish e-invoicing / JPK). This module models them and derives
 * the accounting summary the admin needs. Pure + tested.
 */

import type { BillingDetails } from './billing';

const round2 = (n: number) => Math.round(n * 100) / 100;

export type InvoiceSource = 'stripe' | 'fakturownia';
export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue';

export interface Invoice {
    id: string;
    number: string;
    source: InvoiceSource;
    clientName?: string;
    issueDate: string; // YYYY-MM-DD
    dueDate?: string;
    net: number;
    vat: number;
    gross: number;
    currency: string; // 'PLN'
    /** Stored status; overdue is derived from dueDate via invoiceStatus(). */
    status: Exclude<InvoiceStatus, 'overdue'>;
    /** Company billing details — added at booking or later by admin (even backdated). */
    billing?: BillingDetails;
}

/** Attach/replace billing details on an invoice (admin edit, incl. backdated). */
export const withBilling = (inv: Invoice, billing: BillingDetails): Invoice => ({ ...inv, billing });

const day = (iso: string) => iso.slice(0, 10);

/** Effective status: unpaid past its due date becomes overdue. */
export function invoiceStatus(inv: Invoice, refIso: string): InvoiceStatus {
    if (inv.status === 'paid') return 'paid';
    if (inv.dueDate && day(inv.dueDate) < day(refIso)) return 'overdue';
    return 'unpaid';
}

export interface InvoiceSummary {
    count: number;
    net: number;
    vat: number;
    gross: number;
    paid: number; // gross of paid
    unpaid: number; // gross of unpaid (not overdue)
    overdue: number; // gross of overdue
}

export function invoiceSummary(invoices: Invoice[], refIso: string): InvoiceSummary {
    const s: InvoiceSummary = { count: invoices.length, net: 0, vat: 0, gross: 0, paid: 0, unpaid: 0, overdue: 0 };
    for (const inv of invoices) {
        s.net = round2(s.net + inv.net);
        s.vat = round2(s.vat + inv.vat);
        s.gross = round2(s.gross + inv.gross);
        const st = invoiceStatus(inv, refIso);
        s[st] = round2(s[st] + inv.gross);
    }
    return s;
}

/** Invoices issued within [start, end] (inclusive). */
export function invoicesInRange(invoices: Invoice[], start: string, end: string): Invoice[] {
    return invoices.filter(inv => day(inv.issueDate) >= day(start) && day(inv.issueDate) <= day(end));
}

/** VAT collected grouped by source — useful for reconciliation. */
export function vatBySource(invoices: Invoice[]): { source: InvoiceSource; vat: number }[] {
    const acc = new Map<InvoiceSource, number>();
    for (const inv of invoices) acc.set(inv.source, round2((acc.get(inv.source) ?? 0) + inv.vat));
    return [...acc.entries()].map(([source, vat]) => ({ source, vat }));
}

const fmtMoney = (n: number, currency: string) => `${n.toFixed(2)} ${currency === 'PLN' ? 'zł' : currency}`;

/** Self-contained HTML for a single invoice (PDF via expo-print / print on web). */
export function invoiceHtml(inv: Invoice, opts: { companyName?: string } = {}): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
* { font-family: Arial, sans-serif; color: #14133a; }
body { padding: 32px; }
h1 { font-size: 20px; margin: 0; }
.sub { color: #727189; font-size: 12px; margin: 4px 0 24px; }
.meta { font-size: 12px; margin-bottom: 20px; }
.meta b { color: #14133a; }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
th { background: #14133a; color: #fff; text-align: left; padding: 8px; }
td { padding: 8px; border-bottom: 1px solid #e2e2eb; }
td.r, th.r { text-align: right; }
.total { text-align: right; font-size: 15px; font-weight: bold; margin-top: 14px; }
.foot { color: #9aa0b4; font-size: 10px; margin-top: 28px; }
</style></head><body>
<h1>${opts.companyName ?? 'HeyHomie'} — invoice ${inv.number}</h1>
<div class="sub">Source: ${inv.source} · issued ${inv.issueDate}${inv.dueDate ? ` · due ${inv.dueDate}` : ''}</div>
<div class="meta"><b>Bill to:</b> ${inv.billing
        ? `${inv.billing.companyName}<br/>NIP: ${inv.billing.nip}<br/>${inv.billing.line1}, ${inv.billing.zipCode} ${inv.billing.city}`
        : (inv.clientName ?? '—')}</div>
<table>
  <thead><tr><th>Description</th><th class="r">Net</th><th class="r">VAT</th><th class="r">Gross</th></tr></thead>
  <tbody><tr><td>Cleaning services</td><td class="r">${fmtMoney(inv.net, inv.currency)}</td><td class="r">${fmtMoney(inv.vat, inv.currency)}</td><td class="r">${fmtMoney(inv.gross, inv.currency)}</td></tr></tbody>
</table>
<div class="total">Total: ${fmtMoney(inv.gross, inv.currency)}</div>
<div class="foot">Status: ${inv.status}. This document mirrors the record from ${inv.source}; the legally-issued invoice is the source of truth.</div>
</body></html>`;
}

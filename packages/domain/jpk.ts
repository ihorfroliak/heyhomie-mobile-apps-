/**
 * JPK_V7 (Polish VAT ledger) — SIMPLIFIED sales summary + export.
 *
 * WARNING: this is a simplified aggregation for internal review, NOT a submittable
 * JPK_V7 file. Fakturownia.pl / the accountant generate the legally-valid JPK.
 */
import type { Invoice } from './invoicing';
import { invoicesInRange } from './invoicing';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface JpkRateRow {
    rate: number; // VAT % derived from net/vat
    net: number;
    vat: number;
}

export interface JpkSummary {
    periodStart: string;
    periodEnd: string;
    count: number;
    salesNet: number;
    salesVat: number;
    salesGross: number;
    byRate: JpkRateRow[];
}

export function jpkSummary(invoices: Invoice[], start: string, end: string): JpkSummary {
    const inRange = invoicesInRange(invoices, start, end);
    const rates = new Map<number, { net: number; vat: number }>();
    let net = 0;
    let vat = 0;
    let gross = 0;
    for (const inv of inRange) {
        net += inv.net;
        vat += inv.vat;
        gross += inv.gross;
        const rate = inv.net > 0 ? Math.round((inv.vat / inv.net) * 100) : 0;
        const e = rates.get(rate) ?? { net: 0, vat: 0 };
        e.net += inv.net;
        e.vat += inv.vat;
        rates.set(rate, e);
    }
    return {
        periodStart: start,
        periodEnd: end,
        count: inRange.length,
        salesNet: round2(net),
        salesVat: round2(vat),
        salesGross: round2(gross),
        byRate: [...rates.entries()].map(([rate, e]) => ({ rate, net: round2(e.net), vat: round2(e.vat) })).sort((a, b) => b.rate - a.rate),
    };
}

/** Simplified JPK-style XML for internal review. Not a submittable JPK_V7 file. */
export function jpkXml(s: JpkSummary): string {
    const rows = s.byRate.map(r => `    <StawkaVAT rate="${r.rate}"><Netto>${r.net.toFixed(2)}</Netto><VAT>${r.vat.toFixed(2)}</VAT></StawkaVAT>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<JPK_V7_SIMPLIFIED>
  <Naglowek>
    <Okres od="${s.periodStart}" do="${s.periodEnd}"/>
    <LiczbaFaktur>${s.count}</LiczbaFaktur>
  </Naglowek>
  <SprzedazWiersze>
    <SprzedazNetto>${s.salesNet.toFixed(2)}</SprzedazNetto>
    <PodatekNalezny>${s.salesVat.toFixed(2)}</PodatekNalezny>
    <SprzedazBrutto>${s.salesGross.toFixed(2)}</SprzedazBrutto>
${rows}
  </SprzedazWiersze>
</JPK_V7_SIMPLIFIED>`;
}

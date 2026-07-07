# Accounting & HR

Phase 2 modules: worker contracts (HR) and invoicing/accounting. Invoices are
pulled from **Stripe** (card payments) and **Fakturownia.pl** (Polish e-invoicing).

## Modules

| Area | Domain | Screen |
|------|--------|--------|
| Contracts / HR | `packages/domain/hr.ts` — Contract, lifecycle status, expiry, ZUS/tax flag | `admin/app/contracts.tsx` |
| Invoicing | `packages/domain/invoicing.ts` — Invoice, status, summary, VAT by source | `admin/app/invoices.tsx` |

Data flow: `AccountingClient.getInvoices()` (mock now) → domain summaries → screen.

## HR / contracts
- Two types under Polish law: `zlecenie` (umowa zlecenia — ZUS/tax handled by us,
  `hasPayrollObligations` = true) and `b2b` (subcontractor invoices us).
- `contractStatus` derives active / pending / expired / terminated from the dates;
  `expiringSoon` flags contracts ending within N days for renewal.
- Contracts + documents live in our backend (surface via the API when live).

## Invoicing — going live

### Stripe
- Pull invoices/charges via the Stripe API (`invoices.list`, `charges.list`).
- Map to `Invoice` (`net`, `vat`, `gross`, `status`). Use the **secret key
  server-side only**.

### Fakturownia.pl
- REST API: `GET https://{domain}.fakturownia.pl/invoices.json?api_token=...`.
- Fakturownia issues legally-compliant Polish invoices and supports **JPK_V7**;
  it is the source of truth for VAT reporting. Map its fields to `Invoice`.

### Credentials (never committed — see `.env.example`)
```
STRIPE_SECRET_KEY=...
FAKTUROWNIA_API_TOKEN=...
FAKTUROWNIA_DOMAIN=mycompany
```
Resolved into `AccountingConfig`. OAuth/secret handling stays on a server proxy so
the apps never hold long-lived keys.

## Reconciliation
`invoiceSummary` gives net / VAT / gross and paid / unpaid / overdue buckets;
`vatBySource` splits VAT by Stripe vs Fakturownia for cross-checking with the
finance report before filing.

## Tested
`packages/domain/accounting.test.ts` — 15 tests (contract lifecycle, invoice
status, summary, VAT by source).

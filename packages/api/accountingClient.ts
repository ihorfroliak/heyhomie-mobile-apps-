/**
 * Accounting data source — invoices from Stripe + Fakturownia.pl.
 * Interface consumed by the admin; mock now, real adapters when live.
 */
import type { Invoice } from '../domain';
import { demoInvoices } from './demo';

export interface AccountingClient {
    getInvoices(): Promise<Invoice[]>;
}

export function mockAccountingClient(): AccountingClient {
    return {
        async getInvoices() {
            return demoInvoices;
        },
    };
}

/** Credentials for the live adapters — supplied via environment, never committed. */
export interface AccountingConfig {
    /** Stripe secret key — server-side only. */
    stripeSecretKey?: string;
    /** Fakturownia API token + subdomain (e.g. `mycompany`). */
    fakturowniaApiToken?: string;
    fakturowniaDomain?: string;
}

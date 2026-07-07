/** Run with: npx -y tsx packages/domain/phase3.test.ts */
import { isLowStock, lowStockItems, inventoryValue, reorderList, adjustStock, restock, restockTarget, replaceItem, type SupplyItem } from './inventory';
import { ticketCounts, openTickets, nextTicketStatus, setTicketStatus, type Ticket } from './tickets';
import { cohortRetention, addMonths } from './cohorts';
import { jpkSummary, jpkXml } from './jpk';
import { invoiceHtml, type Invoice } from './invoicing';
import type { Mission } from './missions';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

// inventory
const supplies: SupplyItem[] = [
    { id: 's1', name: 'Eco all-purpose', unit: 'l', stock: 2, reorderLevel: 5, unitCost: 20 },
    { id: 's2', name: 'Microfiber cloths', unit: 'pcs', stock: 40, reorderLevel: 20, unitCost: 3 },
];
ok('low stock detected', isLowStock(supplies[0]) && !isLowStock(supplies[1]));
eq('low stock list', lowStockItems(supplies).map(i => i.id), ['s1']);
eq('inventory value', inventoryValue(supplies), 2 * 20 + 40 * 3);
eq('reorder to 2x level', reorderList(supplies), [{ id: 's1', name: 'Eco all-purpose', suggestQty: 8, cost: 160 }]);
eq('adjustStock adds', adjustStock(supplies[0], 3).stock, 5);
eq('adjustStock never negative', adjustStock(supplies[0], -10).stock, 0);
eq('restock target is 2x level', restockTarget(supplies[0]), 10);
eq('restock lifts to target', restock(supplies[0]).stock, 10);
eq('restock is a no-op when already stocked', restock(supplies[1]).stock, supplies[1].stock);
eq('replaceItem swaps by id', replaceItem(supplies, adjustStock(supplies[0], 1)).map(i => i.stock), [3, 40]);

// tickets
const tickets: Ticket[] = [
    { id: 't1', subject: 'Late', author: 'client', authorName: 'Anna', status: 'open', priority: 'high', createdAt: '2025-05-16T09:00:00Z' },
    { id: 't2', subject: 'Question', author: 'homie', authorName: 'Olena', status: 'pending', priority: 'low', createdAt: '2025-05-15T09:00:00Z' },
    { id: 't3', subject: 'Done', author: 'client', authorName: 'Marek', status: 'resolved', priority: 'normal', createdAt: '2025-05-14T09:00:00Z' },
];
eq('ticket counts', ticketCounts(tickets), { open: 1, pending: 1, resolved: 1 });
eq('open tickets high first', openTickets(tickets).map(t => t.id), ['t1', 't2']);
eq('status cycles open->pending', nextTicketStatus('open'), 'pending');
eq('status cycles resolved->open (reopen)', nextTicketStatus('resolved'), 'open');
eq('setTicketStatus updates one', setTicketStatus(tickets, 't1', 'resolved').find(t => t.id === 't1')!.status, 'resolved');

// cohorts
eq('addMonths rolls year', addMonths('2025-11', 3), '2026-02');
const cm = (id: string, client: string, month: string): Mission => ({ id, status: 'done', plan: 'standard', params: { rooms: 1, kitchens: 1, bathrooms: 1 }, addOns: [], scheduledAt: `${month}-10`, durationMinutes: 180, travelBufferMinutes: 15, workerCount: 1, address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'krakow' }, client: { id: client, firstName: 'C' }, price: 200, currency: 'PLN' }) as Mission;
// cl1 ordered Apr + May; cl2 only Apr → April cohort size 2, retention[1] = 0.5
const co = cohortRetention([cm('a', 'cl1', '2025-04'), cm('b', 'cl1', '2025-05'), cm('c', 'cl2', '2025-04')]);
eq('april cohort size 2', co[0].size, 2);
eq('april cohort retention m0=1, m1=0.5', [co[0].retention[0], co[0].retention[1]], [1, 0.5]);

// jpk
const invoices: Invoice[] = [
    { id: 'i1', number: 'FV1', source: 'stripe', issueDate: '2025-05-10', net: 200, vat: 46, gross: 246, currency: 'PLN', status: 'paid' },
    { id: 'i2', number: 'FV2', source: 'fakturownia', issueDate: '2025-05-12', net: 100, vat: 23, gross: 123, currency: 'PLN', status: 'unpaid' },
];
const jpk = jpkSummary(invoices, '2025-05-01', '2025-05-31');
eq('jpk totals', [jpk.salesNet, jpk.salesVat, jpk.salesGross], [300, 69, 369]);
eq('jpk single 23% rate row', jpk.byRate, [{ rate: 23, net: 300, vat: 69 }]);
ok('jpk xml has period + totals', jpkXml(jpk).includes('2025-05-01') && jpkXml(jpk).includes('300.00'));

// invoice html
ok('invoice html is a document with the number', invoiceHtml(invoices[0]).startsWith('<!DOCTYPE html>') && invoiceHtml(invoices[0]).includes('FV1'));

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All phase-3 tests passed.');

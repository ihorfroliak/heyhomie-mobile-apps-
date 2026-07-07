/** Run with: npx -y tsx packages/domain/accounting.test.ts */
import { contractStatus, isContractValid, expiringSoon, contractCounts, hasPayrollObligations, type Contract } from './hr';
import { invoiceStatus, invoiceSummary, invoicesInRange, vatBySource, type Invoice } from './invoicing';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const REF = '2025-05-16';
const c = (over: Partial<Contract>): Contract => ({ id: 'x', homieId: 'h', homieName: 'H', type: 'zlecenie', status: 'active', startDate: '2025-01-01', documents: [], ...over });

// contracts
eq('active (started, no end)', contractStatus(c({}), REF), 'active');
eq('pending (future start)', contractStatus(c({ startDate: '2025-06-01' }), REF), 'pending');
eq('expired (past end)', contractStatus(c({ endDate: '2025-04-01' }), REF), 'expired');
eq('terminated respected', contractStatus(c({ status: 'terminated' }), REF), 'terminated');
ok('isContractValid', isContractValid(c({}), REF) && !isContractValid(c({ endDate: '2025-04-01' }), REF));

const contracts = [
    c({ id: 'a1' }),
    c({ id: 'a2', type: 'b2b', endDate: '2025-06-01', contractorId: 'ctr1' }),
    c({ id: 'p1', startDate: '2025-06-01' }),
    c({ id: 'e1', endDate: '2025-04-01' }),
    c({ id: 't1', status: 'terminated' }),
];
eq('expiring soon = a2', expiringSoon(contracts, REF).map(x => x.id), ['a2']);
eq('contract counts', contractCounts(contracts, REF), { active: 2, pending: 1, expired: 1, terminated: 1 });
ok('zlecenie has payroll obligations, b2b does not', hasPayrollObligations('zlecenie') && !hasPayrollObligations('b2b'));

// invoices
const inv = (over: Partial<Invoice>): Invoice => ({ id: 'i', number: 'FV/1', source: 'stripe', issueDate: '2025-05-10', net: 100, vat: 23, gross: 123, currency: 'PLN', status: 'unpaid', ...over });
eq('paid stays paid', invoiceStatus(inv({ status: 'paid' }), REF), 'paid');
eq('unpaid + future due = unpaid', invoiceStatus(inv({ dueDate: '2025-06-30' }), REF), 'unpaid');
eq('unpaid + past due = overdue', invoiceStatus(inv({ dueDate: '2025-05-01' }), REF), 'overdue');

const invoices: Invoice[] = [
    inv({ id: 'v1', source: 'stripe', net: 200, vat: 46, gross: 246, status: 'paid' }),
    inv({ id: 'v2', source: 'fakturownia', dueDate: '2025-06-30' }),
    inv({ id: 'v3', source: 'fakturownia', dueDate: '2025-05-01' }),
];
const s = invoiceSummary(invoices, REF);
eq('summary net/vat/gross', [s.net, s.vat, s.gross], [400, 92, 492]);
eq('summary buckets paid/unpaid/overdue', [s.paid, s.unpaid, s.overdue], [246, 123, 123]);
eq('invoices in May', invoicesInRange(invoices, '2025-05-01', '2025-05-31').length, 3);
eq('vat by source', vatBySource(invoices), [{ source: 'stripe', vat: 46 }, { source: 'fakturownia', vat: 46 }]);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All accounting/HR tests passed.');

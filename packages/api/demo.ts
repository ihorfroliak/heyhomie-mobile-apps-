/** Sample data so the apps render meaningful screens before the backend is wired. */
import type { Mission, RecurringService, Address, AcquisitionSource, AdCampaign, AnalyticsSnapshot, CommEvent, PersonRef, Contract, Invoice, SupplyItem, Ticket, AvailabilityMap, Tip, ClientAccount, BookingDraft, Lead } from '../domain';
import { SERVICE_IDS } from '../domain';

/** Build a city row: master switch + the subset of services offered there. */
const coverage = (cityId: string, enabled: boolean, offered: string[]): AvailabilityMap[number] => ({
    cityId,
    enabled,
    services: Object.fromEntries(SERVICE_IDS.map(id => [id, offered.includes(id)])),
});

const sourceForId = (id: string): AcquisitionSource => {
    if (id === 'd3') return 'referral';
    if (id === 'd1' || id === 'd5') return 'organic';
    return 'google_ads';
};

const CLIENTS: Record<string, PersonRef> = {
    cl1: { id: 'cl1', firstName: 'Marek', lastInitial: 'R' },
    cl2: { id: 'cl2', firstName: 'Anna', lastInitial: 'K' },
    cl3: { id: 'cl3', firstName: 'Piotr', lastInitial: 'M' },
};

const clientForId = (id: string): PersonRef => {
    if (id === 'd3') return CLIENTS.cl3;
    if (id === 'd2' || id === 'd5' || id === 'd7') return CLIENTS.cl2;
    return CLIENTS.cl1; // d1, d4, d6
};

const homeAddress: Address = { id: 'a1', name: 'Home', line1: 'ul. Studencka 17/10', zipCode: '31-116', city: 'krakow', notes: 'Entry code 1234, 3rd floor' };

export const demoMissions: Mission[] = [
    {
        id: 'm1040',
        status: 'homie_found',
        plan: 'standard',
        params: { rooms: 1, kitchens: 1, bathrooms: 1 },
        addOns: [{ id: 'windows', quantity: 2 }],
        petsPresent: true,
        scheduledAt: '2025-05-20T10:00:00Z',
        durationMinutes: 240,
        travelBufferMinutes: 15,
        workerCount: 1,
        address: homeAddress,
        client: { id: 'c1', firstName: 'Marek', lastInitial: 'R' },
        homie: { id: 'h1', firstName: 'Olena', rating: 4.9 },
        homieEtaAt: '2025-05-20T09:45:00Z',
        price: 229,
        currency: 'PLN',
    },
    {
        id: 'm1039',
        status: 'done',
        plan: 'standard',
        params: { rooms: 1, kitchens: 1, bathrooms: 1 },
        addOns: [],
        scheduledAt: '2025-05-12T10:00:00Z',
        durationMinutes: 180,
        travelBufferMinutes: 15,
        workerCount: 1,
        address: homeAddress,
        client: { id: 'c1', firstName: 'Marek', lastInitial: 'R' },
        homie: { id: 'h1', firstName: 'Olena', rating: 4.9 },
        checkInAt: '2025-05-12T10:02:00Z',
        checkOutAt: '2025-05-12T13:05:00Z',
        price: 189,
        currency: 'PLN',
        rating: 5,
    },
];

/** Open missions a worker can accept (status searching_homie). */
export const demoAvailableMissions: Mission[] = [
    {
        id: 'av1',
        status: 'searching_homie',
        plan: 'standard',
        params: { rooms: 2, kitchens: 1, bathrooms: 1 },
        addOns: [],
        scheduledAt: '2025-05-21T10:00:00Z',
        durationMinutes: 210,
        travelBufferMinutes: 15,
        workerCount: 1,
        address: { id: 'a2', name: 'Client', line1: 'Kazimierz', zipCode: '31-000', city: 'krakow' },
        client: { id: 'c2', firstName: 'Anna', lastInitial: 'K' },
        price: 219,
        currency: 'PLN',
    },
    {
        id: 'av2',
        status: 'searching_homie',
        plan: 'general',
        params: { rooms: 3, kitchens: 1, bathrooms: 2 },
        addOns: [],
        scheduledAt: '2025-05-22T09:00:00Z',
        durationMinutes: 300,
        travelBufferMinutes: 20,
        workerCount: 2,
        address: { id: 'a3', name: 'Client', line1: 'Podgórze', zipCode: '30-000', city: 'krakow' },
        client: { id: 'c3', firstName: 'Piotr', lastInitial: 'M' },
        price: 359,
        currency: 'PLN',
    },
];

const baseDone = (id: string, day: string, price: number, city: string, plan: 'standard' | 'general', homie: { id: string; firstName: string }): Mission => ({
    id,
    status: 'done',
    plan,
    params: { rooms: 1, kitchens: 1, bathrooms: 1 },
    addOns: [],
    createdAt: `${day}T08:00:00Z`,
    assignedAt: `${day}T08:40:00Z`,
    scheduledAt: `${day}T10:00:00Z`,
    durationMinutes: 180,
    travelBufferMinutes: 15,
    workerCount: 1,
    address: { id: 'x', name: 'Home', line1: city, zipCode: '00-000', city },
    client: clientForId(id),
    homie,
    price,
    currency: 'PLN',
    rating: 5,
    acquisitionSource: sourceForId(id),
});

/** A richer completed-mission set for the admin analytics screen. */
export const demoAnalyticsMissions: Mission[] = [
    baseDone('d1', '2025-05-12', 189, 'krakow', 'standard', { id: 'h1', firstName: 'Olena' }),
    baseDone('d2', '2025-05-13', 256, 'krakow', 'general', { id: 'h1', firstName: 'Olena' }),
    baseDone('d3', '2025-05-13', 180, 'warsaw', 'standard', { id: 'h2', firstName: 'Marta' }),
    baseDone('d4', '2025-05-14', 219, 'krakow', 'standard', { id: 'h2', firstName: 'Marta' }),
    baseDone('d5', '2025-05-15', 320, 'wroclaw', 'general', { id: 'h3', firstName: 'Yulia' }),
    baseDone('d6', '2025-05-16', 189, 'krakow', 'standard', { id: 'h1', firstName: 'Olena' }),
    { ...baseDone('d7', '2025-05-16', 200, 'warsaw', 'standard', { id: 'h2', firstName: 'Marta' }), status: 'canceled' },
];

/**
 * Multi-month completed missions for the cohort/retention view. Each client's
 * first-order month defines their cohort; later months show repeat activity.
 */
const cohortMission = (id: string, clientId: string, month: string): Mission => ({
    id,
    status: 'done',
    plan: 'standard',
    params: { rooms: 1, kitchens: 1, bathrooms: 1 },
    addOns: [],
    scheduledAt: `${month}-10T10:00:00Z`,
    durationMinutes: 180,
    travelBufferMinutes: 15,
    workerCount: 1,
    address: { id: 'x', name: 'Home', line1: 'krakow', zipCode: '00-000', city: 'krakow' },
    client: { id: clientId, firstName: 'Client' },
    homie: { id: 'h1', firstName: 'Olena' },
    price: 200,
    currency: 'PLN',
    rating: 5,
});

export const demoCohortMissions: Mission[] = [
    // Feb cohort: cl1 stays all 4 months, cl2 returns only in April
    cohortMission('cm1', 'cl1', '2025-02'),
    cohortMission('cm2', 'cl1', '2025-03'),
    cohortMission('cm3', 'cl1', '2025-04'),
    cohortMission('cm4', 'cl1', '2025-05'),
    cohortMission('cm5', 'cl2', '2025-02'),
    cohortMission('cm6', 'cl2', '2025-04'),
    // March cohort: cl3 returns once
    cohortMission('cm7', 'cl3', '2025-03'),
    cohortMission('cm8', 'cl3', '2025-04'),
    // April cohort: cl4 returns in May, cl5 does not
    cohortMission('cm9', 'cl4', '2025-04'),
    cohortMission('cm10', 'cl4', '2025-05'),
    cohortMission('cm11', 'cl5', '2025-04'),
];

/** Google Ads campaigns (mock — replace with Google Ads API data when live). */
export const demoCampaigns: AdCampaign[] = [
    { id: 'g1', name: 'Kraków – sprzątanie', source: 'google_ads', spend: 420, impressions: 38000, clicks: 1200, conversions: 34 },
    { id: 'g2', name: 'Warszawa – sprzątanie', source: 'google_ads', spend: 310, impressions: 26000, clicks: 820, conversions: 19 },
    { id: 'g3', name: 'Generalne – po remoncie', source: 'google_ads', spend: 180, impressions: 12000, clicks: 360, conversions: 11 },
];

/** Communication log (mock — from Twilio / Mailgun when live). */
export const demoCommLog: CommEvent[] = [
    { id: 'e1', clientId: 'cl1', channel: 'sms', direction: 'out', at: '2025-05-16T08:00:00Z', summary: 'Booking reminder sent' },
    { id: 'e2', clientId: 'cl1', channel: 'call', direction: 'in', at: '2025-05-15T14:20:00Z', summary: 'Asked to move Monday slot' },
    { id: 'e3', clientId: 'cl1', channel: 'email', direction: 'out', at: '2025-05-12T13:10:00Z', summary: 'Post-cleaning follow-up' },
    { id: 'e4', clientId: 'cl2', channel: 'sms', direction: 'out', at: '2025-05-15T09:00:00Z', summary: 'Homie on the way' },
];

/** Worker contracts (mock — from our backend when live). */
export const demoContracts: Contract[] = [
    { id: 'k1', homieId: 'h1', homieName: 'Olena K.', type: 'zlecenie', status: 'active', startDate: '2025-01-01', ratePct: 0.7, documents: [{ id: 'd1', kind: 'id', name: 'ID card', uploadedAt: '2025-01-01' }, { id: 'd2', kind: 'contract', name: 'Umowa zlecenia', uploadedAt: '2025-01-01' }] },
    { id: 'k2', homieId: 'h2', homieName: 'Marta W.', type: 'b2b', status: 'active', startDate: '2025-03-01', endDate: '2025-06-01', contractorId: 'ctr-1', ratePct: 0.6, documents: [{ id: 'd3', kind: 'contract', name: 'B2B agreement', uploadedAt: '2025-03-01' }] },
    { id: 'k3', homieId: 'h3', homieName: 'Yulia D.', type: 'zlecenie', status: 'active', startDate: '2025-02-01', ratePct: 0.7, documents: [{ id: 'd4', kind: 'id', name: 'ID card', uploadedAt: '2025-02-01' }] },
];

/** Invoices (mock — from Stripe + Fakturownia.pl when live). */
export const demoInvoices: Invoice[] = [
    { id: 'v1', number: 'FV/2025/05/1', source: 'stripe', clientName: 'Marek R.', issueDate: '2025-05-12', net: 200, vat: 46, gross: 246, currency: 'PLN', status: 'paid' },
    { id: 'v2', number: 'FV/2025/05/2', source: 'fakturownia', clientName: 'Anna K.', issueDate: '2025-05-15', dueDate: '2025-06-30', net: 300, vat: 69, gross: 369, currency: 'PLN', status: 'unpaid' },
    { id: 'v3', number: 'FV/2025/05/3', source: 'fakturownia', clientName: 'Piotr M.', issueDate: '2025-05-06', dueDate: '2025-05-05', net: 100, vat: 23, gross: 123, currency: 'PLN', status: 'unpaid' },
];

/** Eco cleaning supplies stock (mock). */
export const demoSupplies: SupplyItem[] = [
    { id: 's1', name: 'Eco all-purpose cleaner', unit: 'l', stock: 3, reorderLevel: 6, unitCost: 22 },
    { id: 's2', name: 'Bathroom / descaler', unit: 'l', stock: 8, reorderLevel: 5, unitCost: 26 },
    { id: 's3', name: 'Microfiber cloths', unit: 'pcs', stock: 45, reorderLevel: 30, unitCost: 3 },
    { id: 's4', name: 'Glass cleaner', unit: 'l', stock: 2, reorderLevel: 4, unitCost: 18 },
    { id: 's5', name: 'Trash bags', unit: 'pack', stock: 12, reorderLevel: 6, unitCost: 9 },
];

/** Support tickets (mock). */
export const demoTickets: Ticket[] = [
    { id: 't1', subject: 'Homie arrived late', author: 'client', authorName: 'Anna K.', status: 'open', priority: 'high', createdAt: '2025-05-16T09:10:00Z' },
    { id: 't2', subject: 'Cannot update my IBAN', author: 'homie', authorName: 'Marta W.', status: 'open', priority: 'normal', createdAt: '2025-05-16T08:30:00Z' },
    { id: 't3', subject: 'Reschedule request', author: 'client', authorName: 'Marek R.', status: 'pending', priority: 'normal', createdAt: '2025-05-15T14:00:00Z' },
    { id: 't4', subject: 'App crash on booking', author: 'client', authorName: 'Piotr M.', status: 'resolved', priority: 'low', createdAt: '2025-05-13T11:00:00Z' },
];

/**
 * City × service coverage (mock — from our backend when live). Kraków is the
 * launch city with the full menu; coverage thins out from there. Gdańsk has a
 * planned service selection but its master switch is still off (not launched).
 */
export const demoAvailability: AvailabilityMap = [
    coverage('krakow', true, ['standard_cleaning', 'general_cleaning', 'window_cleaning', 'bathroom_deep', 'kitchen_deep', 'upholstery_cleaning', 'flower_delivery']),
    coverage('warszawa', true, ['standard_cleaning', 'general_cleaning', 'window_cleaning', 'bathroom_deep', 'kitchen_deep']),
    coverage('wroclaw', true, ['standard_cleaning', 'general_cleaning', 'window_cleaning']),
    coverage('poznan', true, ['standard_cleaning', 'general_cleaning']),
    coverage('gdansk', false, ['standard_cleaning', 'general_cleaning']),
    coverage('lodz', false, []),
    coverage('katowice', false, []),
    coverage('gdynia', false, []),
];

/** Tips left by clients after done orders (mock). 100% goes to the worker. */
export const demoTips: Tip[] = [
    { id: 'tip1', orderId: 'm1039', workerId: 'h1', amount: 25, currency: 'PLN', createdAt: '2025-05-12T13:20:00Z' },
    { id: 'tip2', orderId: 'd2', workerId: 'h1', amount: 15, currency: 'PLN', createdAt: '2025-05-13T13:20:00Z' },
    { id: 'tip3', orderId: 'd5', workerId: 'h3', amount: 20, currency: 'PLN', createdAt: '2025-05-15T13:20:00Z' },
];

/** Client accounts (mock — minimal-signup: phone or email, name optional). */
export const demoAccounts: ClientAccount[] = [
    { id: 'cl1', phone: '+48501234567', email: 'marek@example.pl', firstName: 'Marek', lastName: 'Rutkowski', createdAt: '2025-02-01', verifiedVia: 'phone' },
    { id: 'cl2', phone: '+48602345678', firstName: 'Anna', lastName: 'Kowalska', createdAt: '2025-03-10', verifiedVia: 'phone' },
    { id: 'cl3', email: 'friend99@example.pl', firstName: 'Friend', createdAt: '2025-05-16', verifiedVia: 'email' }, // signed up with just an email
];

/** In-flight / abandoned booking drafts (mock — funnel + re-engagement). */
export const demoDrafts: BookingDraft[] = [
    { id: 'dr1', clientId: 'cl1', cityId: 'krakow', serviceId: 'standard_cleaning', stage: 'confirmed', updatedAt: '2025-05-16T09:00:00Z', estValue: 219 },
    { id: 'dr2', clientId: 'cl2', cityId: 'krakow', serviceId: 'general_cleaning', stage: 'scheduled', updatedAt: '2025-05-16T08:10:00Z', estValue: 320 },
    { id: 'dr3', contact: { phone: '+48703456789' }, cityId: 'warszawa', serviceId: 'window_cleaning', stage: 'configured', updatedAt: '2025-05-15T18:00:00Z', estValue: 150 },
    { id: 'dr4', contact: { email: 'lead@example.pl' }, cityId: 'krakow', serviceId: 'general_cleaning', stage: 'contact_entered', updatedAt: '2025-05-15T20:30:00Z', estValue: 280 },
    { id: 'dr5', cityId: 'wroclaw', serviceId: 'standard_cleaning', stage: 'service_selected', updatedAt: '2025-05-16T10:40:00Z' },
];

/** Explicit leads (mock — e.g. office / post-renovation callback requests). */
export const demoLeads: Lead[] = [
    { id: 'ld1', contact: { phone: '+48511223344' }, source: 'callback', serviceInterest: 'office_cleaning', cityId: 'krakow', createdAt: '2025-05-16T11:00:00Z', status: 'new' },
    { id: 'ld2', contact: { phone: '+48522334455', email: 'biuro@firma.pl' }, source: 'callback', serviceInterest: 'post_renovation', cityId: 'warszawa', createdAt: '2025-05-15T15:20:00Z', status: 'contacted' },
];

/** GA4 snapshot (mock — replace with the GA4 Data API when live). */
export const demoAnalyticsSnapshot: AnalyticsSnapshot = {
    sessions: 8400,
    users: 6100,
    newUsers: 4200,
    bounceRatePct: 42,
    avgSessionSec: 96,
    conversions: 210,
};

export const demoServices: RecurringService[] = [
    {
        id: 's1',
        kind: 'service',
        plan: 'standard',
        addOns: [],
        frequency: 'weekly',
        assignedHomie: { id: 'h1', firstName: 'Olena', rating: 4.9 },
        address: homeAddress,
        paymentMethod: 'pay_later',
        active: true,
        upcomingMissions: [
            { ...demoMissions[0], id: 's1-m1', status: 'homie_found', addOns: [], durationMinutes: 180, price: 189, serviceId: 's1', scheduledAt: '2025-05-26T10:00:00Z' },
        ],
    },
];

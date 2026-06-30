/** Sample data so the apps render meaningful screens before the backend is wired. */
import type { Mission, RecurringService, Address } from '../domain';

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
    client: { id: 'c', firstName: 'Client' },
    homie,
    price,
    currency: 'PLN',
    rating: 5,
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

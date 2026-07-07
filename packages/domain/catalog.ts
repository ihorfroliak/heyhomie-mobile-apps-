/**
 * Service catalog — the full menu HeyHomie can offer, beyond the original
 * standard/general cleaning. Availability is per-city (see availability.ts):
 * a service defined here is only bookable where an admin has switched it on.
 * Pure data + lookups; pricing stays on the backend.
 */
import type { Locale } from './cleaning';
import type { Frequency } from './missions';

export type ServiceCategory = 'cleaning' | 'specialized' | 'delivery' | 'commercial';

/**
 * How a booking is fulfilled:
 *  - 'mission'  = a cleaning Mission on our normal flow
 *  - 'delivery' = a non-cleaning delivery job (flowers)
 *  - 'lead'     = not booked in-app; the client is routed to call/leave a number
 *                 so a manager can quote and schedule (offices, post-renovation).
 */
export type Fulfillment = 'mission' | 'delivery' | 'lead';

/** Charging basis — a hint for the booking UI; exact prices come from the backend. */
export type PricingUnit = 'hour' | 'window' | 'item' | 'order';

export interface ServiceDef {
    id: string; // stable key, e.g. 'window_cleaning'
    category: ServiceCategory;
    fulfillment: Fulfillment;
    unit: PricingUnit;
    names: Record<Locale, string>;
    /** Short marketing line per locale, for cards in the client app. */
    tagline: Record<Locale, string>;
}

export const SERVICES: ServiceDef[] = [
    {
        id: 'standard_cleaning',
        category: 'cleaning',
        fulfillment: 'mission',
        unit: 'hour',
        names: { pl: 'Sprzątanie standardowe', en: 'Standard cleaning', uk: 'Стандартне прибирання' },
        tagline: { pl: 'Regularne odświeżenie mieszkania', en: 'Regular home refresh', uk: 'Регулярне освіження оселі' },
    },
    {
        id: 'general_cleaning',
        category: 'cleaning',
        fulfillment: 'mission',
        unit: 'hour',
        names: { pl: 'Sprzątanie generalne', en: 'Deep cleaning', uk: 'Генеральне прибирання' },
        tagline: { pl: 'Dokładne sprzątanie od podstaw', en: 'Thorough top-to-bottom clean', uk: 'Ретельне прибирання під ключ' },
    },
    {
        id: 'window_cleaning',
        category: 'specialized',
        fulfillment: 'mission',
        unit: 'window',
        names: { pl: 'Mycie okien', en: 'Window cleaning', uk: 'Миття вікон' },
        tagline: { pl: 'Czyste okna bez smug', en: 'Streak-free windows', uk: 'Чисті вікна без розводів' },
    },
    {
        id: 'bathroom_deep',
        category: 'specialized',
        fulfillment: 'mission',
        unit: 'hour',
        names: { pl: 'Generalne sprzątanie łazienki', en: 'Deep bathroom cleaning', uk: 'Генеральне прибирання ванної' },
        tagline: { pl: 'Kamień, fugi i armatura', en: 'Limescale, grout and fittings', uk: 'Наліт, шви та сантехніка' },
    },
    {
        id: 'kitchen_deep',
        category: 'specialized',
        fulfillment: 'mission',
        unit: 'hour',
        names: { pl: 'Generalne sprzątanie kuchni', en: 'Deep kitchen cleaning', uk: 'Генеральне прибирання кухні' },
        tagline: { pl: 'Tłuszcz, piekarnik i okap', en: 'Grease, oven and hood', uk: 'Жир, духовка та витяжка' },
    },
    {
        id: 'upholstery_cleaning',
        category: 'specialized',
        fulfillment: 'mission',
        unit: 'item',
        names: { pl: 'Pranie tapicerki i mebli', en: 'Upholstery & furniture cleaning', uk: 'Хімчистка меблів' },
        tagline: { pl: 'Kanapy, fotele, materace', en: 'Sofas, armchairs, mattresses', uk: 'Дивани, крісла, матраци' },
    },
    {
        id: 'flower_delivery',
        category: 'delivery',
        fulfillment: 'delivery',
        unit: 'order',
        names: { pl: 'Dostawa kwiatów', en: 'Flower delivery', uk: 'Доставка квітів' },
        tagline: { pl: 'Bukiety pod drzwi', en: 'Bouquets to the door', uk: 'Букети до дверей' },
    },
    {
        id: 'office_cleaning',
        category: 'commercial',
        fulfillment: 'lead',
        unit: 'order',
        names: { pl: 'Sprzątanie biur', en: 'Office cleaning', uk: 'Прибирання офісів' },
        tagline: { pl: 'Wycena po rozmowie z managerem', en: 'Quoted after a call with our manager', uk: 'Ціна після розмови з менеджером' },
    },
    {
        id: 'post_renovation',
        category: 'commercial',
        fulfillment: 'lead',
        unit: 'order',
        names: { pl: 'Sprzątanie po remoncie', en: 'Post-renovation cleaning', uk: 'Прибирання після ремонту' },
        tagline: { pl: 'Wycena indywidualna z managerem', en: 'Individual quote with our manager', uk: 'Індивідуальна ціна з менеджером' },
    },
];

/** Number a lead-fulfilment service routes the client to. */
export const CONTACT_PHONE = '+48 555 010 200';

export const isLeadService = (serviceId: string): boolean => serviceById(serviceId)?.fulfillment === 'lead';

export const SERVICE_IDS: string[] = SERVICES.map(s => s.id);

/**
 * Display metadata for the booking slider: cleaning comes first (the core
 * service), then specialised cleaning, and the lead / delivery services sit at
 * the end (office → post-renovation → flowers). An icon aids scannability.
 */
export const SERVICE_META: Record<string, { order: number; icon: string }> = {
    standard_cleaning: { order: 1, icon: '🧹' },
    general_cleaning: { order: 2, icon: '✨' },
    window_cleaning: { order: 3, icon: '🪟' },
    bathroom_deep: { order: 4, icon: '🛁' },
    kitchen_deep: { order: 5, icon: '🍳' },
    upholstery_cleaning: { order: 6, icon: '🛋️' },
    office_cleaning: { order: 7, icon: '🏢' },
    post_renovation: { order: 8, icon: '🧱' },
    flower_delivery: { order: 9, icon: '💐' },
};

export const serviceIcon = (id: string): string => SERVICE_META[id]?.icon ?? '•';
export const serviceOrder = (id: string): number => SERVICE_META[id]?.order ?? 999;

/** Sort service ids into the booking-slider order (cleaning first). */
export const sortedServiceIds = (ids: string[]): string[] => [...ids].sort((a, b) => serviceOrder(a) - serviceOrder(b));

export const serviceById = (id: string): ServiceDef | undefined => SERVICES.find(s => s.id === id);

export const serviceName = (id: string, locale: Locale): string => serviceById(id)?.names[locale] ?? id;

/**
 * Long-form details for a service: a paragraph the client reads before booking,
 * plus a "what's included" highlight list. Kept as a separate map so the compact
 * ServiceDef stays lean and content can grow without touching booking logic.
 */
export interface ServiceDetail {
    description: Record<Locale, string>;
    highlights: Record<Locale, string[]>;
}

const D = (pl: string, en: string, uk: string): Record<Locale, string> => ({ pl, en, uk });
const H = (pl: string[], en: string[], uk: string[]): Record<Locale, string[]> => ({ pl, en, uk });

export const SERVICE_DETAILS: Record<string, ServiceDetail> = {
    standard_cleaning: {
        description: D(
            'Regularne sprzątanie utrzymujące mieszkanie w świeżości: odkurzanie, mycie podłóg, łazienki i kuchni oraz ścieranie kurzu. Najlepsze jako cykliczna usługa co tydzień lub co dwa tygodnie.',
            'Regular upkeep that keeps your home fresh: vacuuming, floors, bathroom and kitchen surfaces, and dusting. Best as a weekly or bi-weekly routine.',
            'Регулярне прибирання, що тримає оселю свіжою: пилосос, підлоги, ванна й кухня, витирання пилу. Найкраще як щотижнева чи раз на два тижні послуга.',
        ),
        highlights: H(
            ['Odkurzanie i mycie podłóg', 'Łazienka i kuchnia', 'Ścieranie kurzu z powierzchni', 'Wynoszenie śmieci'],
            ['Vacuuming and mopping floors', 'Bathroom and kitchen', 'Dusting surfaces', 'Taking out the rubbish'],
            ['Пилосос і миття підлог', 'Ванна та кухня', 'Витирання пилу з поверхонь', 'Винесення сміття'],
        ),
    },
    general_cleaning: {
        description: D(
            'Dokładne sprzątanie od podstaw — sięgamy tam, gdzie zwykle nie zaglądamy: za sprzęty, do szafek, fugi i trudne zabrudzenia. Idealne na start współpracy albo po dłuższej przerwie.',
            'A thorough top-to-bottom clean that reaches where routine cleaning does not: behind appliances, inside cabinets, grout and stubborn grime. Ideal to start with or after a long gap.',
            'Ретельне прибирання під ключ — дістаємось туди, куди зазвичай не заглядають: за техніку, у шафки, шви та складні забруднення. Ідеально для старту або після довгої перерви.',
        ),
        highlights: H(
            ['Wszystko ze sprzątania standardowego', 'Za i pod sprzętami AGD', 'Wnętrza szafek na życzenie', 'Fugi i trudne zabrudzenia'],
            ['Everything in standard cleaning', 'Behind and under appliances', 'Inside cabinets on request', 'Grout and stubborn grime'],
            ['Усе зі стандартного прибирання', 'За та під побутовою технікою', 'Всередині шафок за бажанням', 'Шви та складні забруднення'],
        ),
    },
    window_cleaning: {
        description: D(
            'Mycie okien bez smug — od wewnątrz i na zewnątrz tam, gdzie jest bezpieczny dostęp. Rozliczamy za każde skrzydło lub taflę wydzieloną ramą.',
            'Streak-free window washing — inside and outside where safely reachable. Charged per sash or pane separated by a frame.',
            'Миття вікон без розводів — зсередини та ззовні там, де є безпечний доступ. Рахуємо за кожну стулку чи скло, відокремлене рамою.',
        ),
        highlights: H(
            ['Szyby bez smug', 'Ramy i parapety', 'Wewnątrz i na zewnątrz', 'Rozliczenie za skrzydło'],
            ['Streak-free glass', 'Frames and sills', 'Inside and outside', 'Priced per sash'],
            ['Скло без розводів', 'Рами та підвіконня', 'Зсередини та ззовні', 'Оплата за стулку'],
        ),
    },
    bathroom_deep: {
        description: D(
            'Generalne czyszczenie łazienki: kamień, fugi, armatura, kabina i glazura doprowadzone do blasku. Świetne jako uzupełnienie sprzątania standardowego.',
            'A deep bathroom reset: limescale, grout, fittings, shower and tiles brought back to a shine. A great add-on to standard cleaning.',
            'Генеральне прибирання ванної: наліт, шви, сантехніка, кабіна та плитка до блиску. Чудово доповнює стандартне прибирання.',
        ),
        highlights: H(
            ['Usuwanie kamienia', 'Fugi i glazura', 'Armatura i kabina', 'Lustra i powierzchnie'],
            ['Limescale removal', 'Grout and tiles', 'Fittings and shower', 'Mirrors and surfaces'],
            ['Видалення нальоту', 'Шви та плитка', 'Сантехніка та кабіна', 'Дзеркала та поверхні'],
        ),
    },
    kitchen_deep: {
        description: D(
            'Generalne czyszczenie kuchni: tłuszcz, piekarnik, okap i fronty szafek. Odzyskaj czystą, świeżą kuchnię bez godzin szorowania.',
            'A deep kitchen clean: grease, oven, hood and cabinet fronts. Get a fresh, spotless kitchen without hours of scrubbing.',
            'Генеральне прибирання кухні: жир, духовка, витяжка та фасади шафок. Поверніть чисту, свіжу кухню без годин відмивання.',
        ),
        highlights: H(
            ['Odtłuszczanie powierzchni', 'Piekarnik i okap', 'Fronty i blaty', 'Zlew i armatura'],
            ['Degreasing surfaces', 'Oven and hood', 'Fronts and worktops', 'Sink and taps'],
            ['Знежирення поверхонь', 'Духовка та витяжка', 'Фасади та стільниці', 'Мийка та змішувач'],
        ),
    },
    upholstery_cleaning: {
        description: D(
            'Pranie tapicerki i mebli metodą ekstrakcyjną: kanapy, fotele i materace. Usuwamy plamy, kurz i zapachy, przywracając świeżość tkanin.',
            'Extraction cleaning for upholstery: sofas, armchairs and mattresses. We lift stains, dust and odours to bring the fabric back to life.',
            'Хімчистка меблів методом екстракції: дивани, крісла та матраци. Прибираємо плями, пил і запахи, повертаючи свіжість тканині.',
        ),
        highlights: H(
            ['Kanapy i fotele', 'Materace', 'Usuwanie plam i zapachów', 'Rozliczenie za sztukę'],
            ['Sofas and armchairs', 'Mattresses', 'Stain and odour removal', 'Priced per item'],
            ['Дивани та крісла', 'Матраци', 'Видалення плям і запахів', 'Оплата за одиницю'],
        ),
    },
    flower_delivery: {
        description: D(
            'Świeże bukiety dostarczone pod drzwi wskazanej osoby, z Twoją dedykacją na bileciku. Wybierasz datę i przedział godzinowy — resztą zajmuje się nasz florysta.',
            'Fresh bouquets delivered to your recipient’s door, with your note on the card. Pick a date and time window — our florist handles the rest.',
            'Свіжі букети до дверей отримувача, з вашою запискою на листівці. Обираєте дату й проміжок часу — решту бере на себе флорист.',
        ),
        highlights: H(
            ['Świeże bukiety od florysty', 'Dedykacja na bileciku', 'Wybór daty i przedziału godzin', 'Dostawa pod wskazany adres'],
            ['Fresh florist bouquets', 'Your note on the card', 'Choose date and time window', 'Delivered to the address you give'],
            ['Свіжі букети від флориста', 'Ваша записка на листівці', 'Вибір дати та проміжку часу', 'Доставка на вказану адресу'],
        ),
    },
    office_cleaning: {
        description: D(
            'Sprzątanie biur i przestrzeni komercyjnych dopasowane do Twojego grafiku. Zakres i cenę ustalamy indywidualnie po krótkiej rozmowie z managerem.',
            'Cleaning for offices and commercial spaces tailored to your schedule. Scope and price are agreed individually after a short call with our manager.',
            'Прибирання офісів і комерційних приміщень під ваш графік. Обсяг і ціну узгоджуємо індивідуально після короткої розмови з менеджером.',
        ),
        highlights: H(
            ['Elastyczny grafik', 'Wycena indywidualna', 'Stały opiekun', 'Faktura VAT'],
            ['Flexible schedule', 'Individual quote', 'A dedicated contact', 'VAT invoice'],
            ['Гнучкий графік', 'Індивідуальна ціна', 'Персональний менеджер', 'Рахунок з ПДВ'],
        ),
    },
    post_renovation: {
        description: D(
            'Sprzątanie po remoncie: pył budowlany, resztki farby i zaprawy, doprowadzenie wnętrza do stanu „do zamieszkania”. Wycena indywidualna po oględzinach z managerem.',
            'Post-renovation cleaning: construction dust, paint and plaster residue, getting the space move-in ready. Priced individually after a review with our manager.',
            'Прибирання після ремонту: будівельний пил, залишки фарби й розчину, доведення приміщення до стану «заселяйся». Ціна індивідуальна після огляду з менеджером.',
        ),
        highlights: H(
            ['Usuwanie pyłu budowlanego', 'Resztki farby i zaprawy', 'Mycie okien po remoncie', 'Wycena po oględzinach'],
            ['Construction dust removal', 'Paint and plaster residue', 'Windows after the works', 'Quoted after a review'],
            ['Прибирання будівельного пилу', 'Залишки фарби та розчину', 'Миття вікон після робіт', 'Ціна після огляду'],
        ),
    },
};

export const serviceDetail = (id: string): ServiceDetail | undefined => SERVICE_DETAILS[id];

export const servicesByCategory = (category: ServiceCategory): ServiceDef[] => SERVICES.filter(s => s.category === category);

/** Cleaning cyclicity: the four options offered for standard/general cleaning. */
export const CLEANING_FREQUENCIES: Frequency[] = ['once', 'weekly', 'biweekly', 'monthly'];

/** Flower delivery cadences (UI must keep these clearly distinct). */
export const DELIVERY_FREQUENCIES: Frequency[] = ['once', 'weekly', 'biweekly', 'twice_week', 'thrice_week', 'every_workday', 'every_other_day'];

const ONE_OFF: Frequency[] = ['once'];

/**
 * Cadences allowed for a service:
 *  - cleaning (standard/general) → the four cleaning options
 *  - flower delivery            → the delivery cadences
 *  - lead services (office / post-renovation) → none (scheduled off-app by a manager)
 *  - everything else            → one-off only
 */
export function frequenciesFor(serviceId: string): Frequency[] {
    const s = serviceById(serviceId);
    if (!s || s.fulfillment === 'lead') return [];
    if (s.id === 'flower_delivery') return DELIVERY_FREQUENCIES;
    if (s.category === 'cleaning') return CLEANING_FREQUENCIES;
    return ONE_OFF;
}

/**
 * HeyHomie — cleaning domain: plans, time calculator, add-ons, staffing and
 * scope disclaimers. Framework-agnostic, pl/en/uk.
 *
 * Pricing is authoritative on the existing backend (Rails pricing config); this
 * module owns STRUCTURE + TIME so every app shows the same estimate. The full
 * scope-of-service checklist lives in `checklist.ts`.
 */

export type Locale = 'pl' | 'en' | 'uk';
export type Localized = Record<Locale, string>;

export type CleaningPlan = 'standard' | 'general';

const L = (pl: string, en: string, uk: string): Localized => ({ pl, en, uk });

/* ------------------------------------------------------------------ */
/* Time calculator                                                     */
/* ------------------------------------------------------------------ */

/** Per-unit work time (minutes) for the three main calculator variables. */
export const TIME_PER_BATHROOM = 60;
export const TIME_PER_KITCHEN = 60;
export const TIME_PER_ROOM = 30;
/** Every apartment has a hallway/corridor — always added. */
export const CORRIDOR_MINUTES = 30;

export const MIN_MISSION_HOURS = 3;
export const MIN_MISSION_MINUTES = MIN_MISSION_HOURS * 60;
export const TRAVEL_BUFFER_MINUTES = 15;

/** The three main variables a client sets when booking. */
export interface CleaningParams {
    rooms: number;
    kitchens: number;
    bathrooms: number;
}

/**
 * Base work time from the main variables + corridor, clamped to the 3h minimum.
 * Example: 1 bathroom (60) + 1 kitchen (60) + 1 room (30) + corridor (30) = 180 = 3h.
 */
export function computeBaseMinutes(params: CleaningParams): number {
    const raw =
        Math.max(0, params.bathrooms) * TIME_PER_BATHROOM +
        Math.max(0, params.kitchens) * TIME_PER_KITCHEN +
        Math.max(0, params.rooms) * TIME_PER_ROOM +
        CORRIDOR_MINUTES;
    return Math.max(raw, MIN_MISSION_MINUTES);
}

/* ------------------------------------------------------------------ */
/* Add-ons                                                             */
/* ------------------------------------------------------------------ */

export type AddOnId =
    | 'extra_hours'
    | 'ironing'
    | 'windows'
    | 'balcony'
    | 'dishes_large'
    | 'fridge'
    | 'microwave'
    | 'oven'
    | 'hood'
    | 'ventilator';

export type AddOnPricing = 'flat' | 'per_unit' | 'per_hour';

export interface AddOn {
    id: AddOnId;
    label: Localized;
    description: Localized;
    pricing: AddOnPricing;
    /** Unit shown beside the quantity stepper for per_unit / per_hour add-ons. */
    unitLabel?: Localized;
    /** Work time this add-on adds, per unit (minutes), used by the time calculator. */
    addedMinutesPerUnit: number;
    /**
     * true => this scope is already part of GENERAL (free), so it is only offered
     * as a paid add-on on STANDARD. false => available on any plan.
     */
    includedInGeneral: boolean;
}

export const addOns: AddOn[] = [
    {
        id: 'extra_hours',
        label: L('Dodatkowe godziny', 'Additional hours', 'Додаткові години'),
        description: L('Wydłuż sprzątanie o dodatkowy czas', 'Extend the cleaning by extra time', 'Подовжити прибирання на додатковий час'),
        pricing: 'per_hour',
        unitLabel: L('godz.', 'hour', 'год'),
        addedMinutesPerUnit: 60,
        includedInGeneral: false,
    },
    {
        id: 'ironing',
        label: L('Prasowanie', 'Ironing', 'Прасування'),
        description: L('Prasowanie wskazanych rzeczy, rozliczane godzinowo', 'Ironing selected items, billed hourly', 'Прасування зазначених речей, погодинна оплата'),
        pricing: 'per_hour',
        unitLabel: L('godz.', 'hour', 'год'),
        addedMinutesPerUnit: 60,
        includedInGeneral: false,
    },
    {
        id: 'windows',
        label: L('Mycie okien', 'Window washing', 'Миття вікон'),
        description: L('Policz każde skrzydło lub taflę szkła wydzieloną ramą', 'Count each sash or glass pane separated by frames', 'Рахуйте кожну стулку або скляну панель, відокремлену рамою'),
        pricing: 'per_unit',
        unitLabel: L('okno', 'window', 'вікно'),
        addedMinutesPerUnit: 30,
        includedInGeneral: false,
    },
    {
        id: 'balcony',
        label: L('Balkon / taras', 'Balcony / terrace', 'Балкон / тераса'),
        description: L('Umycie podłogi i barierek balkonu', 'Cleaning balcony floor and railings', 'Миття підлоги та поручнів балкона'),
        pricing: 'flat',
        addedMinutesPerUnit: 30,
        includedInGeneral: false,
    },
    {
        id: 'dishes_large',
        label: L('Mycie naczyń (duża ilość)', 'Dishes (large load)', 'Миття посуду (велика кількість)'),
        description: L('Załadunek zmywarki jest w cenie; duża ilość lub tłuste garnki i sprzęty — osobno', 'Loading the dishwasher is free; a large load or greasy pots and appliances is extra', 'Завантаження посудомийки безкоштовно; велика кількість або жирні каструлі та техніка — окремо'),
        pricing: 'flat',
        addedMinutesPerUnit: 30,
        includedInGeneral: false,
    },
    {
        id: 'fridge',
        label: L('Mycie lodówki', 'Fridge cleaning', 'Миття холодильника'),
        description: L('Umycie wnętrza lodówki', 'Cleaning the inside of the fridge', 'Миття всередині холодильника'),
        pricing: 'flat',
        addedMinutesPerUnit: 60,
        includedInGeneral: true,
    },
    {
        id: 'oven',
        label: L('Mycie piekarnika', 'Oven cleaning', 'Миття духовки'),
        description: L('Wyczyszczenie piekarnika wewnątrz', 'Cleaning the oven inside', 'Чищення духовки всередині'),
        pricing: 'flat',
        addedMinutesPerUnit: 60,
        includedInGeneral: true,
    },
    {
        id: 'hood',
        label: L('Mycie okapu', 'Cooker hood cleaning', 'Миття витяжки'),
        description: L('Umycie okapu wraz z filtrami tłuszczowymi', 'Cleaning the cooker hood incl. grease filters', 'Миття витяжки разом із жировими фільтрами'),
        pricing: 'flat',
        addedMinutesPerUnit: 60,
        includedInGeneral: true,
    },
    {
        id: 'microwave',
        label: L('Mycie mikrofalówki', 'Microwave cleaning', 'Миття мікрохвильовки'),
        description: L('Wyczyszczenie mikrofalówki wewnątrz', 'Cleaning the microwave inside', 'Чищення мікрохвильовки всередині'),
        pricing: 'flat',
        addedMinutesPerUnit: 15,
        includedInGeneral: true,
    },
    {
        id: 'ventilator',
        label: L('Wentylator / kratka went.', 'Extractor fan / vent grille', 'Вентилятор / вент. решітка'),
        description: L('Czyszczenie wentylatora lub kratki wentylacyjnej', 'Cleaning the extractor fan or vent grille', 'Чищення вентилятора або вентиляційної решітки'),
        pricing: 'flat',
        addedMinutesPerUnit: 15,
        includedInGeneral: true,
    },
];

/** Add-ons offered for a plan: on GENERAL, scopes already covered are hidden. */
export function addOnsFor(plan: CleaningPlan): AddOn[] {
    return plan === 'general' ? addOns.filter(a => !a.includedInGeneral) : addOns;
}

export interface SelectedAddOn {
    id: AddOnId;
    quantity: number;
}

export function addOnMinutes(selected: SelectedAddOn[]): number {
    return selected.reduce((sum, sel) => {
        const a = addOns.find(x => x.id === sel.id);
        return a ? sum + a.addedMinutesPerUnit * Math.max(1, sel.quantity) : sum;
    }, 0);
}

/** Full estimated work time: base (>= 3h) + add-ons. Travel buffer is separate. */
export function estimateMissionMinutes(params: CleaningParams, selected: SelectedAddOn[] = []): number {
    return computeBaseMinutes(params) + addOnMinutes(selected);
}

/* ------------------------------------------------------------------ */
/* Staffing (workers per mission)                                      */
/* ------------------------------------------------------------------ */

/** Apartments at/under this size get a single homie even for general cleaning. */
export const SINGLE_WORKER_MAX_SQM = 60;

export interface StaffingContext {
    /** Apartment area in m², if known. */
    areaSqm?: number;
    /** Mission generated by a recurring service. */
    recurring?: boolean;
}

/**
 * Standard cleaning = 1 homie. General cleaning = a 2-person team, EXCEPT when
 * the apartment is <= 60 m² or it's a recurring general service (then 1 homie).
 * A quality manager may additionally join a general cleaning on the ground.
 */
export function workersFor(plan: CleaningPlan, ctx: StaffingContext = {}): 1 | 2 {
    if (plan === 'standard') return 1;
    if (ctx.recurring) return 1;
    if (ctx.areaSqm != null && ctx.areaSqm <= SINGLE_WORKER_MAX_SQM) return 1;
    return 2;
}

/* ------------------------------------------------------------------ */
/* Scope disclaimers — what we don't do (with the real nuance)         */
/* ------------------------------------------------------------------ */

export interface ScopeNote {
    id: string;
    title: Localized; // the blunt limitation
    detail: Localized; // the practical nuance
}

export const scopeDisclaimers: ScopeNote[] = [
    {
        id: 'furniture',
        title: L('Nie przenosimy mebli', "We don't move furniture", 'Не переносимо меблі'),
        detail: L(
            'W miarę możliwości przesuniemy większe meble, ale nie gwarantujemy tego, jeśli homie nie jest w stanie zrobić tego bezpiecznie.',
            'We may move larger furniture where feasible, but cannot guarantee it if the homie cannot do so safely.',
            'За можливості пересунемо більші меблі, але не гарантуємо цього, якщо виконавець не може зробити це безпечно.'
        ),
    },
    {
        id: 'blinds',
        title: L('Nie czyścimy rolet i żaluzji', "We don't wash blinds or shutters", 'Не миємо ролети та жалюзі'),
        detail: L(
            'Możemy je przetrzeć, ale nie umyjemy, jeśli groziłoby to uszkodzeniem.',
            'We can wipe them, but will not wash them if it risks damage.',
            'Можемо протерти, але не миємо, якщо це може пошкодити їх.'
        ),
    },
    {
        id: 'chandeliers',
        title: L('Nie myjemy żyrandoli', "We don't wash chandeliers", 'Не миємо люстри'),
        detail: L(
            'Przetrzemy, jeśli da się bezpiecznie dosięgnąć, ale nie demontujemy, aby nic nie stłuc.',
            'We can wipe one if it can be reached safely, but do not dismantle it to avoid breakage.',
            'Протремо, якщо можна безпечно дістатися, але не знімаємо, щоб нічого не розбити.'
        ),
    },
    {
        id: 'stairwell',
        title: L('Nie myjemy klatki schodowej', "We don't clean the stairwell", 'Не миємо сходову клітку'),
        detail: L(
            'W standardzie tego nie robimy. Na życzenie i jeśli starczy czasu (np. przy sprzątaniu generalnym domu) — lub można domówić dodatkowe godziny.',
            "Not part of standard. On request and if time allows (e.g. during a general house cleaning) — or you can book extra hours.",
            'У стандарті цього не робимо. На прохання і якщо є час (напр. при генеральному прибиранні будинку) — або можна домовити додаткові години.'
        ),
    },
    {
        id: 'ceilings',
        title: L('Nie myjemy sufitów', "We don't wash ceilings", 'Не миємо стелі'),
        detail: L(
            'Usuwamy pajęczyny i możemy przetrzeć ścianę, ale nie myjemy sufitów.',
            'We remove cobwebs and can wipe a wall, but do not wash ceilings.',
            'Прибираємо павутиння і можемо протерти стіну, але не миємо стелі.'
        ),
    },
    {
        id: 'disinfection',
        title: L('Nie przeprowadzamy dezynfekcji pomieszczeń', "We don't disinfect whole rooms", 'Не проводимо дезінфекцію приміщень'),
        detail: L(
            'Lokalnie zdezynfekujemy np. lodówkę, szafkę czy konkretne powierzchnie. Pełna dezynfekcja pomieszczeń nie jest możliwa po zwykłej usłudze, niezależnie od jej rodzaju.',
            'We disinfect locally (e.g. a fridge, a cabinet, specific surfaces). Full room disinfection is not possible after a regular service, regardless of its type.',
            'Локально продезінфікуємо напр. холодильник, шафу чи окремі поверхні. Повна дезінфекція приміщень неможлива після звичайної послуги, незалежно від її типу.'
        ),
    },
];

/* ------------------------------------------------------------------ */
/* Good to know                                                        */
/* ------------------------------------------------------------------ */

export const goodToKnow: Localized[] = [
    L(
        'Zapewniamy ekologiczne / biochemiczne środki czystości. Nie zapewniamy narzędzi — przygotuj proszę odkurzacz lub miotłę, mop z wiadrem (oraz drabinkę, jeśli będzie potrzebna).',
        "We bring eco / biochemical cleaning products. We don't provide cleaning tools — please prepare a vacuum or broom, a mop and bucket (and a ladder if needed).",
        'Ми привозимо екологічні / біохімічні засоби. Інструменти не надаємо — підготуйте, будь ласка, пилосос або віник, швабру з відром (і драбину, якщо знадобиться).'
    ),
    L(
        'Pierwsze sprzątanie wykonujemy osobiście, aby poznać Twój dom i wspólnie ustalić szczegóły.',
        'The first cleaning is done in person, so we get to know your home and agree the details together.',
        'Перше прибирання проводимо особисто, щоб познайомитися з оселею та разом узгодити деталі.'
    ),
    L(
        'Zwierzęta mile widziane — cena bez zmian; prosimy o ich zabezpieczenie, zwłaszcza przy otwartych oknach.',
        'Pets welcome — the price stays the same; please keep them safe, especially while windows are open.',
        'Тваринам раді — ціна не змінюється; подбайте про їхню безпеку, особливо при відкритих вікнах.'
    ),
    L(
        'Po usłudze dzwonimy, aby upewnić się, że wszystko przebiegło zgodnie z planem.',
        'After the service we call you to make sure everything went to plan.',
        'Після послуги телефонуємо, щоб переконатися, що все пройшло за планом.'
    ),
];

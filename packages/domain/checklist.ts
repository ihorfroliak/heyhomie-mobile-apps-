/**
 * HeyHomie — authoritative cleaning scope-of-service checklist (pl/en/uk).
 * Transcribed from the official client-facing checklist PDFs.
 *
 * GENERAL cleaning = everything in STANDARD + every item flagged `generalOnly`.
 * Appliances inside (fridge, oven, hood + filters, extractor fan/vent grille,
 * microwave) are included in GENERAL at no extra charge; on STANDARD they are
 * available as paid add-ons (see cleaning.ts -> addOns).
 */

import type { Localized } from './cleaning';

export interface ChecklistItem {
    id: string;
    label: Localized;
    /** Belongs to the deeper GENERAL plan only. */
    generalOnly?: boolean;
}

export interface ChecklistArea {
    id: string;
    label: Localized;
    items: ChecklistItem[];
}

const L = (pl: string, en: string, uk: string): Localized => ({ pl, en, uk });

export const checklistAreas: ChecklistArea[] = [
    {
        id: 'home',
        label: L('W całym domu', 'Throughout the home', 'По всій оселі'),
        items: [
            { id: 'floors', label: L('Odkurzenie / zamiecenie i umycie podłóg oraz listew przypodłogowych', 'Vacuum / sweep and mop floors and skirting boards', 'Пропилососити / підмести та помити підлогу й плінтуси') },
            { id: 'dust', label: L('Wytarcie kurzu z dostępnych powierzchni do 3 m', 'Dust all accessible surfaces up to 3 m', 'Витерти пил з доступних поверхонь до 3 м') },
            { id: 'fronts', label: L('Wytarcie frontów szaf, szafek, komód i blatów', 'Wipe fronts of wardrobes, cabinets, dressers and countertops', 'Протерти фасади шаф, шафок, комодів і стільниць') },
            { id: 'doors', label: L('Wytarcie drzwi, klamek i framug z obu stron (kurz, odciski)', 'Wipe doors, handles and frames on both sides (dust, fingerprints)', 'Протерти двері, ручки та одвірки з обох боків (пил, відбитки)') },
            { id: 'mirrors', label: L('Umycie luster i ram', 'Clean mirrors and frames', 'Помити дзеркала й рами') },
            { id: 'windowsills', label: L('Przetarcie parapetów (wewnątrz)', 'Wipe windowsills (interior)', 'Протерти підвіконня (зсередини)') },
            { id: 'switches', label: L('Przetarcie włączników i gniazdek', 'Wipe switches and sockets', 'Протерти вимикачі та розетки') },
            { id: 'radiators_top', label: L('Przetarcie grzejników z wierzchu', 'Wipe tops of radiators', 'Протерти радіатори зверху') },
            { id: 'lamps', label: L('Przetarcie dostępnych lamp (bez demontażu)', 'Wipe accessible lamps (no dismantling)', 'Протерти доступні світильники (без демонтажу)') },
            { id: 'cobwebs', label: L('Usunięcie pajęczyn', 'Remove cobwebs', 'Прибрати павутиння') },
            { id: 'tidy', label: L('Uporządkowanie przedmiotów codziennego użytku (buty, książki, ubrania…)', 'Tidy everyday items (shoes, books, clothes…)', 'Розкласти речі щоденного вжитку (взуття, книжки, одяг…)') },
            { id: 'cables', label: L('Estetyczne zwinięcie i ukrycie kabli', 'Coil and hide cables neatly', 'Акуратно змотати й сховати кабелі') },
            { id: 'bins', label: L('Opróżnienie i umycie koszy; wyniesienie śmieci', 'Empty and wash bins; take out the rubbish', 'Спорожнити й помити смітники; винести сміття') },
            { id: 'cabinets_inside', generalOnly: true, label: L('Umycie i uporządkowanie wnętrza szaf i szafek', 'Wash and tidy the inside of wardrobes and cabinets', 'Помити та впорядкувати шафи й шафки всередині') },
            { id: 'deep_floors', generalOnly: true, label: L('Mycie podłóg z głębokiego brudu', 'Deep-clean floors (ingrained dirt)', 'Глибоке миття підлоги (в’їдливий бруд)') },
            { id: 'doors_deep', generalOnly: true, label: L('Dokładne mycie drzwi i ościeżnic', 'Wash doors and door frames thoroughly', 'Ретельно помити двері та одвірки') },
            { id: 'skirting_deep', generalOnly: true, label: L('Dokładne czyszczenie listew przypodłogowych', 'Deep-clean skirting boards', 'Ретельно почистити плінтуси') },
            { id: 'light_fixtures', generalOnly: true, label: L('Mycie opraw oświetleniowych', 'Wash light fixtures', 'Помити світильники') },
            { id: 'radiators_deep', generalOnly: true, label: L('Dokładne czyszczenie grzejników', 'Deep-clean radiators', 'Глибоко почистити радіатори') },
            { id: 'windowsills_inout', generalOnly: true, label: L('Mycie parapetów wewnątrz i na zewnątrz', 'Wash windowsills inside and out', 'Помити підвіконня зсередини та ззовні') },
            { id: 'disinfect', generalOnly: true, label: L('Dezynfekcja powierzchni profesjonalnymi środkami', 'Disinfect surfaces with professional products', 'Дезінфекція поверхонь професійними засобами') },
            { id: 'laundry', generalOnly: true, label: L('Pranie: nastawienie programu; rozwieszenie / wysuszenie i złożenie rzeczy (na życzenie)', 'Laundry: run a selected cycle; hang / dry and fold clothes (on request)', 'Прання: запустити цикл; розвісити / висушити та скласти речі (за бажанням)') },
        ],
    },
    {
        id: 'kitchen',
        label: L('Kuchnia', 'Kitchen', 'Кухня'),
        items: [
            { id: 'exteriors', label: L('Wytarcie zewnętrznych powierzchni szafek, blatów, półek i sprzętów', 'Wipe exteriors of cabinets, countertops, shelves and appliances', 'Протерти зовнішні поверхні шафок, стільниць, полиць і техніки') },
            { id: 'sink', label: L('Umycie zlewu i kranu; usunięcie lekkiego kamienia', 'Wash sink and tap; remove light limescale', 'Помити мийку та кран; прибрати легкий накип') },
            { id: 'kettle', label: L('Usunięcie kamienia z czajnika; umycie czajnika z zewnątrz', 'Descale the kettle; wash the kettle exterior', 'Видалити накип з чайника; помити чайник ззовні') },
            { id: 'appliances_ext', label: L('Wytarcie z zewnątrz lodówki, mikrofalówki, tostera i małego AGD', 'Wipe exterior of fridge, microwave, toaster and small appliances', 'Протерти ззовні холодильник, мікрохвильовку, тостер, дрібну техніку') },
            { id: 'backsplash', label: L('Umycie płytek nad blatem i płyty grzewczej', 'Wash backsplash tiles and the hob', 'Помити фартух і варильну поверхню') },
            { id: 'table', label: L('Przetarcie stołu i krzeseł', 'Wipe the table and chairs', 'Протерти стіл і стільці') },
            { id: 'dishes', label: L('Umycie naczyń (niewielka ilość) / załadowanie i włączenie zmywarki', 'Wash dishes (small load) / load and run the dishwasher', 'Помити посуд (невелика кількість) / завантажити й увімкнути посудомийку') },
            { id: 'sills_floor', label: L('Przetarcie parapetów i grzejników; mycie listew i podłogi', 'Wipe windowsills and radiators; wash skirting and floor', 'Протерти підвіконня та радіатори; помити плінтуси й підлогу') },
            { id: 'bins', label: L('Opróżnienie i umycie każdego kosza; wyniesienie śmieci', 'Empty and wash each bin; take out the rubbish', 'Спорожнити й помити кожен смітник; винести сміття') },
            { id: 'fridge_in', generalOnly: true, label: L('Umycie lodówki wewnątrz (z dezynfekcją)', 'Clean the fridge inside (with disinfection)', 'Помити холодильник усередині (з дезінфекцією)') },
            { id: 'oven_in', generalOnly: true, label: L('Wyczyszczenie piekarnika wewnątrz', 'Clean the oven inside', 'Почистити духовку всередині') },
            { id: 'hood', generalOnly: true, label: L('Umycie okapu, w tym filtrów przeciwtłuszczowych', 'Clean the cooker hood, incl. grease filters', 'Помити витяжку, зокрема жирові фільтри') },
            { id: 'vent', generalOnly: true, label: L('Czyszczenie wentylatora / kratki wentylacyjnej (z demontażem, jeśli możliwy)', 'Clean the extractor fan / vent grille (dismantled where possible)', 'Почистити вентилятор / вентиляційну решітку (з демонтажем, якщо можливо)') },
            { id: 'microwave_in', generalOnly: true, label: L('Wyczyszczenie mikrofalówki wewnątrz', 'Clean the microwave inside', 'Почистити мікрохвильовку всередині') },
            { id: 'cabinets_in', generalOnly: true, label: L('Mycie wszystkich szafek i szuflad w środku oraz ułożenie rzeczy', 'Wash all cabinets and drawers inside and re-arrange items', 'Помити всі шафки й шухляди всередині та розкласти речі') },
            { id: 'dishes_full', generalOnly: true, label: L('Pełne zmywanie naczyń (duża ilość)', 'Full dishwashing (large load)', 'Повне миття посуду (велика кількість)') },
            { id: 'dishwasher', generalOnly: true, label: L('Opróżnienie czystej zmywarki / włączenie i opróżnienie, jeśli pełna', 'Empty the clean dishwasher / run then empty if full', 'Спорожнити чисту посудомийку / увімкнути й спорожнити, якщо повна') },
            { id: 'disinfect', generalOnly: true, label: L('Dezynfekcja wszystkich powierzchni profesjonalnymi środkami', 'Disinfect all surfaces with professional products', 'Дезінфекція всіх поверхонь професійними засобами') },
        ],
    },
    {
        id: 'bathroom',
        label: L('Łazienka', 'Bathroom', 'Ванна кімната'),
        items: [
            { id: 'sanitary', label: L('Umycie i dezynfekcja toalety, prysznica, wanny, baterii i umywalki', 'Wash and disinfect the toilet, shower, bathtub, taps and washbasin', 'Помити та продезінфікувати унітаз, душ, ванну, змішувачі й умивальник') },
            { id: 'bidet', label: L('Umycie bidetu', 'Clean the bidet', 'Помити біде') },
            { id: 'glass', label: L('Wytarcie luster i powierzchni szklanych', 'Wipe mirrors and glass surfaces', 'Витерти дзеркала та скляні поверхні') },
            { id: 'tiles_loose', label: L('Usunięcie luźnych zabrudzeń z płytek', 'Remove loose dirt from tiles', 'Прибрати незначні забруднення з плитки') },
            { id: 'towels', label: L('Ułożenie ręczników; uporządkowanie kosmetyków i środków', 'Arrange towels; tidy cosmetics and supplies', 'Розкласти рушники; впорядкувати косметику й засоби') },
            { id: 'doors', label: L('Przetarcie drzwi, włączników i gniazdek', 'Wipe doors, switches and sockets', 'Протерти двері, вимикачі та розетки') },
            { id: 'floor', label: L('Umycie podłogi', 'Wash the floor', 'Помити підлогу') },
            { id: 'soap', generalOnly: true, label: L('Usunięcie osadu z mydła i lekkiego kamienia', 'Remove soap scum and light limescale', 'Видалити мильний наліт і легкий накип') },
            { id: 'descale', generalOnly: true, label: L('Odkamienienie baterii prysznica, wanny i umywalki', 'Descale shower, bath and basin fittings', 'Видалити накип зі змішувачів душу, ванни та умивальника') },
            { id: 'grout', generalOnly: true, label: L('Czyszczenie wszystkich fug (także w kabinie) i płytek ściennych', 'Clean all grout (incl. shower enclosure) and wall tiles', 'Почистити всі шви (зокрема в душовій кабіні) і настінну плитку') },
            { id: 'cabinets_in', generalOnly: true, label: L('Mycie wszystkich szafek w środku', 'Wash all cabinets inside', 'Помити всі шафки всередині') },
            { id: 'vent', generalOnly: true, label: L('Dokładne czyszczenie kratki wentylacyjnej (z demontażem, jeśli możliwy)', 'Deep-clean the ventilation grille (dismantled where possible)', 'Ретельно почистити вентиляційну решітку (з демонтажем, якщо можливо)') },
        ],
    },
    {
        id: 'wc',
        label: L('Toaleta (osobne WC)', 'Toilet (separate WC)', 'Туалет (окремий санвузол)'),
        items: [
            { id: 'bowl', label: L('Umycie muszli; przetarcie ścian przy toalecie', 'Clean the toilet bowl; wipe walls by the toilet', 'Помити унітаз; протерти стіни біля унітаза') },
            { id: 'tiles', label: L('Umycie płytek', 'Wash the tiles', 'Помити плитку') },
            { id: 'dust', label: L('Wytarcie kurzu z powierzchni i przedmiotów; uporządkowanie', 'Dust surfaces and objects; tidy items', 'Витерти пил з поверхонь і предметів; впорядкувати') },
            { id: 'door', label: L('Przetarcie drzwi', 'Wipe the door', 'Протерти двері') },
            { id: 'rug', label: L('Wyczyszczenie dywanika', 'Clean the rug', 'Почистити килимок') },
            { id: 'floor', label: L('Umycie podłogi', 'Wash the floor', 'Помити підлогу') },
            { id: 'descale', generalOnly: true, label: L('Odkamienianie i dokładne czyszczenie', 'Descaling and deep cleaning', 'Видалення накипу та ретельне чищення') },
            { id: 'vent', generalOnly: true, label: L('Czyszczenie kratki wentylacyjnej', 'Clean the ventilation grille', 'Чищення вентиляційної решітки') },
        ],
    },
    {
        id: 'bedroom',
        label: L('Sypialnia', 'Bedroom', 'Спальня'),
        items: [
            { id: 'furniture', label: L('Przetarcie szaf, szafek, regałów i biurka', 'Wipe wardrobes, cabinets, shelves and desk', 'Протерти шафи, шафки, стелажі та письмовий стіл') },
            { id: 'bed', label: L('Zmiana pościeli (na życzenie, jeśli klient ma czystą) i pościelenie łóżka', 'Change bed linen (on request, if a clean set is provided) and make the bed', 'Замінити постіль (за бажанням, якщо є чиста) та застелити ліжко') },
            { id: 'sills', label: L('Przetarcie parapetów (wewnątrz); usunięcie pajęczyn', 'Wipe windowsills (interior); remove cobwebs', 'Протерти підвіконня (зсередини); прибрати павутиння') },
            { id: 'cabinets_in', generalOnly: true, label: L('Umycie i uporządkowanie wnętrza szaf i szafek', 'Wash and tidy the inside of wardrobes and cabinets', 'Помити та впорядкувати шафи й шафки всередині') },
            { id: 'sills_inout', generalOnly: true, label: L('Mycie parapetów wewnątrz i na zewnątrz', 'Wash windowsills inside and out', 'Помити підвіконня зсередини та ззовні') },
            { id: 'mirrors_deep', generalOnly: true, label: L('Dokładne umycie luster', 'Clean mirrors thoroughly', 'Ретельно помити дзеркала') },
        ],
    },
    {
        id: 'living',
        label: L('Pokój dzienny', 'Living room', 'Вітальня'),
        items: [
            { id: 'tables', label: L('Przetarcie stołów i krzeseł', 'Wipe tables and chairs', 'Протерти столи та стільці') },
            { id: 'sofas', label: L('Odkurzenie sof (czystą końcówką); ułożenie poduszek', 'Vacuum sofas (clean nozzle); arrange cushions', 'Пропилососити дивани (чистою насадкою); поправити подушки') },
            { id: 'electronics', label: L('Wytarcie kurzu z RTV, półek i obrazów', 'Dust the TV, electronics, shelves and pictures', 'Витерти пил з ТВ, техніки, полиць і картин') },
            { id: 'sills', label: L('Przetarcie parapetów (wewnątrz)', 'Wipe windowsills (interior)', 'Протерти підвіконня (зсередини)') },
            { id: 'upholstery', generalOnly: true, label: L('Dokładne odkurzenie mebli tapicerowanych', 'Deep-vacuum upholstered furniture', 'Ретельно пропилососити м’які меблі') },
            { id: 'general_home', generalOnly: true, label: L('Wszystkie czynności generalne z „W całym domu” (wnętrza szafek, grzejniki itp.)', 'All general tasks from “Throughout the home” (insides of cabinets, radiators, etc.)', 'Усі генеральні роботи з розділу «По всій оселі» (шафки всередині, радіатори тощо)') },
        ],
    },
    {
        id: 'hall',
        label: L('Przedpokój', 'Entrance hall', 'Передпокій'),
        items: [
            { id: 'door_mat', label: L('Odkurzenie wycieraczki; przetarcie drzwi wejściowych z obu stron i progu', 'Vacuum the doormat; wipe the entrance door on both sides and the threshold', 'Пропилососити килимок; протерти вхідні двері (з обох боків) і поріг') },
            { id: 'floor_shoes', label: L('Odkurzenie / przetarcie podłogi i otwartych półek na buty; ułożenie obuwia', 'Vacuum / wipe the floor and open shoe shelves; arrange shoes', 'Пропилососити / протерти підлогу та відкриті полиці для взуття; розставити взуття') },
            { id: 'hangers', label: L('Uporządkowanie rzeczy na wieszakach', 'Organise items on hangers', 'Впорядкувати речі на вішаках') },
            { id: 'mirror', label: L('Umycie lustra; przetarcie włączników i gniazdek', 'Clean the mirror; wipe switches and sockets', 'Помити дзеркало; протерти вимикачі та розетки') },
            { id: 'cabinets_in', generalOnly: true, label: L('Umycie i uporządkowanie wszystkich szaf, komód i szafek w środku', 'Wash and tidy all wardrobes, dressers and cabinets inside', 'Помити та впорядкувати всі шафи, комоди й шафки всередині') },
            { id: 'pet_bowls', generalOnly: true, label: L('Dokładne umycie misek zwierząt (jeśli są)', 'Thoroughly wash pet bowls (if any)', 'Ретельно помити миски для тварин (якщо є)') },
        ],
    },
    {
        id: 'balcony',
        label: L('Balkon / taras — jeśli jest', 'Balcony / terrace — if present', 'Балкон / тераса — за наявності'),
        items: [
            { id: 'floor', label: L('Zamiecenie, wyczyszczenie i umycie podłogi; umycie barierek', 'Sweep, clean and wash the floor; wash the railings', 'Підмести, почистити й помити підлогу; помити поручні') },
            { id: 'furniture', label: L('Przetarcie mebli balkonowych; usunięcie luźnych zabrudzeń', 'Wipe balcony furniture; remove loose dirt', 'Протерти балконні меблі; прибрати незначні забруднення') },
            { id: 'ashtrays', label: L('Opróżnienie i umycie popielniczek; uporządkowanie', 'Empty and wash ashtrays; tidy items', 'Спорожнити й помити попільнички; впорядкувати') },
            { id: 'disinfect', generalOnly: true, label: L('Zastosowanie środków dezynfekujących na powierzchniach', 'Apply disinfecting agents to surfaces', 'Обробити поверхні дезінфікувальними засобами') },
        ],
    },
];

/** Note shown under the balcony section. */
export const heavyWorkNote: Localized = {
    pl: 'Duże tarasy, mycie Karcherem, usuwanie odchodów gołębi i podobne cięższe prace wyceniane są osobno.',
    en: 'Large terraces, pressure-washing (Kärcher), removing pigeon droppings and similar heavier work are quoted separately.',
    uk: 'Великі тераси, миття Karcher, прибирання пташиного посліду та подібні важчі роботи оцінюються окремо.',
};

/** Returns the checklist filtered for a plan (standard hides generalOnly items). */
export function checklistFor(plan: 'standard' | 'general'): ChecklistArea[] {
    if (plan === 'general') return checklistAreas;
    return checklistAreas.map(a => ({ ...a, items: a.items.filter(i => !i.generalOnly) })).filter(a => a.items.length > 0);
}

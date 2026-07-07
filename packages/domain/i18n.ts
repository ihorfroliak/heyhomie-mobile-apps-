/**
 * HeyHomie — shared labels and formatters (pl/en/uk).
 * Pure, framework-agnostic; used by every app for consistent wording.
 */
import type { Locale, Localized } from './cleaning';
import type { MissionStatus, Frequency } from './missions';

const L = (pl: string, en: string, uk: string): Localized => ({ pl, en, uk });

/** Pick a string for a locale, falling back to English. */
export const tr = (value: Localized, locale: Locale): string => value[locale] ?? value.en;

export const missionStatusLabel: Record<MissionStatus, Localized> = {
    searching_homie: L('Szukamy homie', 'Searching homie', 'Шукаємо виконавця'),
    homie_found: L('Homie przypisany', 'Homie assigned', 'Виконавця призначено'),
    in_progress: L('W trakcie', 'In progress', 'Виконується'),
    done: L('Zakończone', 'Done', 'Виконано'),
    canceled: L('Anulowane', 'Canceled', 'Скасовано'),
    unpaid: L('Nieopłacone', 'Unpaid', 'Не оплачено'),
    freezed: L('Wstrzymane', 'On hold', 'Призупинено'),
};

export const frequencyLabel: Record<Frequency, Localized> = {
    once: L('Jednorazowo', 'One-off', 'Разово'),
    weekly: L('Co tydzień', 'Weekly', 'Щотижня'),
    biweekly: L('Co dwa tygodnie', 'Bi-weekly', 'Раз на два тижні'),
    monthly: L('Co miesiąc', 'Monthly', 'Щомісяця'),
    every_workday: L('W dni robocze (pn–pt)', 'Every workday (Mon–Fri)', 'Щобудня (пн–пт)'),
    twice_week: L('Dwa razy w tygodniu', 'Twice a week', 'Двічі на тиждень'),
    thrice_week: L('Trzy razy w tygodniu', 'Three times a week', 'Тричі на тиждень'),
    every_other_day: L('Co drugi dzień', 'Every other day', 'Кожен другий день'),
};

/** Minutes -> "3h 00m" (or "45m" under an hour). */
export function formatDuration(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h === 0) return `${rest}m`;
    return `${h}h ${rest < 10 ? '0' : ''}${rest}m`;
}

/** Amount -> localized currency string, e.g. "189 zł". */
export function formatMoney(amount: number, currency = 'PLN', locale: Locale = 'pl'): string {
    try {
        const intlLocale = locale === 'uk' ? 'uk-UA' : locale === 'en' ? 'en-GB' : 'pl-PL';
        return new Intl.NumberFormat(intlLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
        return `${Math.round(amount)} ${currency}`;
    }
}

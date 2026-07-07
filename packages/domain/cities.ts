/**
 * Polish cities HeyHomie can operate in. A city existing here does NOT mean it
 * is live — an admin switches each city (and each service within it) on/off via
 * the availability map (see availability.ts). Kraków is the launch priority.
 */
import type { Locale } from './cleaning';

export interface City {
    id: string; // slug matching Mission.address.city, e.g. 'krakow'
    names: Record<Locale, string>;
    voivodeship: string;
    lat: number;
    lng: number;
}

export const CITIES: City[] = [
    { id: 'krakow', voivodeship: 'małopolskie', names: { pl: 'Kraków', en: 'Kraków', uk: 'Краків' }, lat: 50.0647, lng: 19.945 },
    { id: 'warszawa', voivodeship: 'mazowieckie', names: { pl: 'Warszawa', en: 'Warsaw', uk: 'Варшава' }, lat: 52.2297, lng: 21.0122 },
    { id: 'wroclaw', voivodeship: 'dolnośląskie', names: { pl: 'Wrocław', en: 'Wrocław', uk: 'Вроцлав' }, lat: 51.1079, lng: 17.0385 },
    { id: 'poznan', voivodeship: 'wielkopolskie', names: { pl: 'Poznań', en: 'Poznań', uk: 'Познань' }, lat: 52.4064, lng: 16.9252 },
    { id: 'gdansk', voivodeship: 'pomorskie', names: { pl: 'Gdańsk', en: 'Gdańsk', uk: 'Гданськ' }, lat: 54.352, lng: 18.6466 },
    { id: 'lodz', voivodeship: 'łódzkie', names: { pl: 'Łódź', en: 'Łódź', uk: 'Лодзь' }, lat: 51.7592, lng: 19.456 },
    { id: 'katowice', voivodeship: 'śląskie', names: { pl: 'Katowice', en: 'Katowice', uk: 'Катовіце' }, lat: 50.2649, lng: 19.0238 },
    { id: 'gdynia', voivodeship: 'pomorskie', names: { pl: 'Gdynia', en: 'Gdynia', uk: 'Гдиня' }, lat: 54.5189, lng: 18.5305 },
];

export const CITY_IDS: string[] = CITIES.map(c => c.id);

export const cityById = (id: string): City | undefined => CITIES.find(c => c.id === id);

export const cityName = (id: string, locale: Locale): string => cityById(id)?.names[locale] ?? id;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Great-circle (haversine) distance between two lat/lng points, in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371; // Earth radius, km
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return round1(2 * R * Math.asin(Math.sqrt(h)));
}

export interface NearestCity {
    cityId: string;
    distanceKm: number;
}

/**
 * The listed city closest to a coordinate. Returns null if the nearest one is
 * farther than `maxKm` (default 60) — so a user outside our footprint is not
 * snapped onto a distant city.
 */
export function nearestCity(lat: number, lng: number, opts: { maxKm?: number; cities?: City[] } = {}): NearestCity | null {
    const { maxKm = 60, cities = CITIES } = opts;
    let best: NearestCity | null = null;
    for (const c of cities) {
        const d = distanceKm(lat, lng, c.lat, c.lng);
        if (best === null || d < best.distanceKm) best = { cityId: c.id, distanceKm: d };
    }
    return best && best.distanceKm <= maxKm ? best : null;
}

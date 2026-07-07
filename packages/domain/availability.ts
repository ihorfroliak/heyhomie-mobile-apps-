/**
 * Coverage matrix: which cities are live, and which services are offered in each.
 * Two independent switches per offering:
 *   1. city.enabled      — master switch for the whole city
 *   2. services[id]       — per-service switch inside that city
 * A service is bookable only when BOTH are on. Turning a city off keeps its
 * per-service selection, so flipping the city back on restores the prior setup.
 * Pure + tested; the admin coverage screen drives it, the client booking reads it.
 */

export interface CityAvailability {
    cityId: string;
    /** Master switch — off means the whole city is not available yet. */
    enabled: boolean;
    /** serviceId -> offered in this city. */
    services: Record<string, boolean>;
}

export type AvailabilityMap = CityAvailability[];

const cityEntry = (map: AvailabilityMap, cityId: string): CityAvailability | undefined =>
    map.find(c => c.cityId === cityId);

/** Master switch state for a city. */
export const isCityEnabled = (map: AvailabilityMap, cityId: string): boolean => !!cityEntry(map, cityId)?.enabled;

/** A service is bookable only if the city is on AND the service is on within it. */
export const isServiceAvailable = (map: AvailabilityMap, cityId: string, serviceId: string): boolean => {
    const c = cityEntry(map, cityId);
    return !!c?.enabled && !!c.services[serviceId];
};

/** Service ids bookable in a city right now ([] if the city is off). */
export function availableServices(map: AvailabilityMap, cityId: string): string[] {
    const c = cityEntry(map, cityId);
    if (!c?.enabled) return [];
    return Object.keys(c.services).filter(id => c.services[id]);
}

/** City ids that are live (master switch on). */
export const enabledCities = (map: AvailabilityMap): string[] => map.filter(c => c.enabled).map(c => c.cityId);

/** City ids where a given service is live. */
export const citiesOffering = (map: AvailabilityMap, serviceId: string): string[] =>
    map.filter(c => c.enabled && c.services[serviceId]).map(c => c.cityId);

/** New map with a city's master switch toggled (or set to `next`). */
export function setCityEnabled(map: AvailabilityMap, cityId: string, next?: boolean): AvailabilityMap {
    return map.map(c => (c.cityId === cityId ? { ...c, enabled: next ?? !c.enabled } : c));
}

/** New map with one service in one city toggled (or set to `next`). */
export function setServiceEnabled(map: AvailabilityMap, cityId: string, serviceId: string, next?: boolean): AvailabilityMap {
    return map.map(c =>
        c.cityId === cityId ? { ...c, services: { ...c.services, [serviceId]: next ?? !c.services[serviceId] } } : c,
    );
}

export interface CoverageStats {
    citiesLive: number;
    citiesTotal: number;
    /** Distinct city×service pairs currently bookable. */
    liveOfferings: number;
    /** Highest possible offerings if every service were on in every listed city. */
    maxOfferings: number;
}

/** Roll-up for the admin dashboard. `serviceCount` = size of the service catalog. */
export function coverageStats(map: AvailabilityMap, serviceCount: number): CoverageStats {
    let liveOfferings = 0;
    for (const c of map) {
        if (!c.enabled) continue;
        liveOfferings += Object.values(c.services).filter(Boolean).length;
    }
    return {
        citiesLive: map.filter(c => c.enabled).length,
        citiesTotal: map.length,
        liveOfferings,
        maxOfferings: map.length * serviceCount,
    };
}

/**
 * Which city the client booking should preselect: the geolocated city if it is
 * actually live, otherwise the fallback (e.g. the client's saved address city).
 */
export function initialCity(map: AvailabilityMap, detectedCityId: string | null, fallbackCityId: string): string {
    return detectedCityId && isCityEnabled(map, detectedCityId) ? detectedCityId : fallbackCityId;
}

/** Seed a fresh map for the given cities/services with everything off. */
export function emptyAvailability(cityIds: string[], serviceIds: string[]): AvailabilityMap {
    return cityIds.map(cityId => ({
        cityId,
        enabled: false,
        services: Object.fromEntries(serviceIds.map(id => [id, false])),
    }));
}

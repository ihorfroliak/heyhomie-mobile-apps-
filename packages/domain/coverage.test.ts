/** Run with: npx -y tsx packages/domain/coverage.test.ts */
import { SERVICES, SERVICE_IDS, serviceById, serviceName, servicesByCategory } from './catalog';
import { CITIES, cityById, cityName, distanceKm, nearestCity } from './cities';
import {
    isCityEnabled,
    isServiceAvailable,
    availableServices,
    enabledCities,
    citiesOffering,
    setCityEnabled,
    setServiceEnabled,
    coverageStats,
    emptyAvailability,
    initialCity,
    type AvailabilityMap,
} from './availability';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

// catalog
ok('catalog has the new services', ['window_cleaning', 'bathroom_deep', 'kitchen_deep', 'upholstery_cleaning', 'flower_delivery'].every(id => !!serviceById(id)));
eq('service name resolves per locale', serviceName('flower_delivery', 'uk'), 'Доставка квітів');
eq('unknown service falls back to id', serviceName('nope', 'en'), 'nope');
eq('SERVICE_IDS matches SERVICES', SERVICE_IDS.length, SERVICES.length);
ok('delivery category isolates flower_delivery', servicesByCategory('delivery').map(s => s.id).join() === 'flower_delivery');

// cities
ok('krakow exists', !!cityById('krakow'));
eq('city name per locale', cityName('warszawa', 'en'), 'Warsaw');
ok('all cities have all three locales', CITIES.every(c => c.names.pl && c.names.en && c.names.uk));
ok('all cities have coordinates', CITIES.every(c => Number.isFinite(c.lat) && Number.isFinite(c.lng)));

// geo: distance Kraków -> Warszawa is ~250 km
const dKW = distanceKm(50.0647, 19.945, 52.2297, 21.0122);
ok('krakow-warszawa distance is ~250km', dKW > 240 && dKW < 260);
eq('distance to self is 0', distanceKm(50.0647, 19.945, 50.0647, 19.945), 0);
// nearest: a point next to Wrocław resolves to wroclaw
eq('nearest city near wroclaw', nearestCity(51.11, 17.03)?.cityId, 'wroclaw');
// a point right on Kraków resolves to krakow, tiny distance
ok('nearest on krakow is krakow and close', (() => { const n = nearestCity(50.0647, 19.945); return n?.cityId === 'krakow' && n.distanceKm < 5; })());
// Berlin is far from every listed city -> null within default 60km
eq('far-away coordinate yields null', nearestCity(52.52, 13.405), null);
// widening maxKm can still match the closest one
ok('wide radius matches nearest even when far', nearestCity(52.52, 13.405, { maxKm: 1000 })?.cityId === 'poznan');

// initialCity: detected wins only if live
const covMap: AvailabilityMap = [
    { cityId: 'krakow', enabled: true, services: {} },
    { cityId: 'gdansk', enabled: false, services: {} },
];
eq('initialCity uses detected when live', initialCity(covMap, 'krakow', 'warszawa'), 'krakow');
eq('initialCity falls back when detected is off', initialCity(covMap, 'gdansk', 'krakow'), 'krakow');
eq('initialCity falls back when nothing detected', initialCity(covMap, null, 'krakow'), 'krakow');

// availability
const map: AvailabilityMap = [
    { cityId: 'krakow', enabled: true, services: { standard_cleaning: true, window_cleaning: true, flower_delivery: false } },
    { cityId: 'gdansk', enabled: false, services: { standard_cleaning: true, window_cleaning: true } },
];
ok('krakow is enabled', isCityEnabled(map, 'krakow'));
ok('gdansk is disabled', !isCityEnabled(map, 'gdansk'));
ok('standard available in krakow', isServiceAvailable(map, 'krakow', 'standard_cleaning'));
ok('flower off in krakow', !isServiceAvailable(map, 'krakow', 'flower_delivery'));
ok('service blocked when city is off', !isServiceAvailable(map, 'gdansk', 'standard_cleaning'));
eq('available services in krakow', availableServices(map, 'krakow').sort(), ['standard_cleaning', 'window_cleaning']);
eq('available services in off city is empty', availableServices(map, 'gdansk'), []);
eq('enabled cities', enabledCities(map), ['krakow']);
eq('cities offering window cleaning', citiesOffering(map, 'window_cleaning'), ['krakow']);

// toggling is pure (returns new map, original unchanged)
const cityOn = setCityEnabled(map, 'gdansk', true);
ok('setCityEnabled turns gdansk on', isCityEnabled(cityOn, 'gdansk'));
ok('original map untouched', !isCityEnabled(map, 'gdansk'));
ok('gdansk service now visible after enabling city', isServiceAvailable(cityOn, 'gdansk', 'standard_cleaning'));

const svcOff = setServiceEnabled(map, 'krakow', 'window_cleaning', false);
ok('setServiceEnabled turns a service off', !isServiceAvailable(svcOff, 'krakow', 'window_cleaning'));
const svcToggle = setServiceEnabled(map, 'krakow', 'flower_delivery');
ok('setServiceEnabled with no arg flips', isServiceAvailable(svcToggle, 'krakow', 'flower_delivery'));

// re-enabling a city restores its prior service selection
const off = setCityEnabled(map, 'krakow', false);
const backOn = setCityEnabled(off, 'krakow', true);
eq('service selection survives a city off/on cycle', availableServices(backOn, 'krakow').sort(), ['standard_cleaning', 'window_cleaning']);

// stats
eq('coverage stats', coverageStats(map, 3), { citiesLive: 1, citiesTotal: 2, liveOfferings: 2, maxOfferings: 6 });

// empty seed
const seeded = emptyAvailability(['krakow', 'lodz'], ['a', 'b']);
eq('empty seed shape', seeded, [
    { cityId: 'krakow', enabled: false, services: { a: false, b: false } },
    { cityId: 'lodz', enabled: false, services: { a: false, b: false } },
]);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All coverage tests passed.');

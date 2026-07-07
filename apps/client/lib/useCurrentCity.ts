import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { nearestCity, isCityEnabled, type AvailabilityMap } from '@heyhomie/domain';

export type LocationStatus =
    | 'detecting' // permission/position request in flight
    | 'ok' // matched a live city
    | 'denied' // user declined location permission
    | 'unsupported' // located, but not near any live city
    | 'error'; // location lookup failed

export interface DetectedCity {
    cityId: string | null;
    status: LocationStatus;
}

/**
 * Detect the client's city from device location and map it to a live city.
 * Domain does the geo math (nearestCity); this hook only bridges expo-location.
 * Auto-selection is intentionally conservative: only a nearby city that is
 * actually switched on is returned, otherwise the caller keeps its fallback.
 */
export function useCurrentCity(map: AvailabilityMap): DetectedCity {
    const [state, setState] = useState<DetectedCity>({ cityId: null, status: 'detecting' });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    if (!cancelled) setState({ cityId: null, status: 'denied' });
                    return;
                }
                const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
                const near = nearestCity(pos.coords.latitude, pos.coords.longitude);
                const live = near && isCityEnabled(map, near.cityId) ? near.cityId : null;
                if (!cancelled) setState({ cityId: live, status: live ? 'ok' : 'unsupported' });
            } catch {
                if (!cancelled) setState({ cityId: null, status: 'error' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [map]);

    return state;
}

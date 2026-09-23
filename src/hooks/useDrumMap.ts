import { useSyncExternalStore } from 'react';
import { getDrumMap, subscribeDrumMap, type DrumMap } from '../utils/drumMap';

/** The drum controller's pad map (utils/drumMap.ts), live as it is edited. */
export function useDrumMap(): DrumMap {
    return useSyncExternalStore(subscribeDrumMap, getDrumMap);
}

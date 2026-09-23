import { useSyncExternalStore } from 'react';
import { getAccompaniments, subscribeAccompaniments, type AccompanimentMeta } from '../utils/accompaniment';

/** Every accompaniment on record, by song key, live (utils/accompaniment.ts). */
export function useAccompaniments(): ReadonlyMap<string, AccompanimentMeta> {
    return useSyncExternalStore(subscribeAccompaniments, getAccompaniments);
}

/** A song's accompaniment, if it has one. */
export function useAccompanimentFor(songKey: string | null): AccompanimentMeta | null {
    const all = useAccompaniments();
    return songKey ? all.get(songKey) ?? null : null;
}

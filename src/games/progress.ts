/** Best result per level, on this device. */

const KEY = 'midi-stroke-games-progress';

export interface Best { accuracy: number; stars: number }

function read(): Record<string, Best> {
    try { return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Record<string, Best>; } catch { return {}; }
}

export function getBest(levelId: string): Best | null {
    return read()[levelId] ?? null;
}

/** Keep a result if it beats the best so far. Returns whether it did. */
export function recordResult(levelId: string, result: Best): boolean {
    const all = read();
    const old = all[levelId];
    if (old && old.accuracy >= result.accuracy) return false;
    all[levelId] = result;
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
    return true;
}

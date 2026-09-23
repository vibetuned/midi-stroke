/**
 * The device's delay, measured once: between the moment a click is played
 * and the moment the player's tap for it registers there is the audio
 * output's latency, the input's (keyboard, touch, MIDI), and a little of the
 * player. Tapping along to a few clicks measures all of it at once; the games
 * subtract it before judging, so timing is fair on any setup.
 */

const KEY = 'midi-stroke-games-latency';

/** Seconds; 0 until measured. */
export function getLatency(): number {
    try {
        const v = Number(globalThis.localStorage?.getItem(KEY));
        return Number.isFinite(v) ? v : 0;
    } catch {
        return 0;
    }
}

export function isCalibrated(): boolean {
    try { return globalThis.localStorage?.getItem(KEY) !== null; } catch { return false; }
}

export function setLatency(seconds: number): void {
    try { globalThis.localStorage?.setItem(KEY, String(seconds)); } catch { /* private mode */ }
}

/**
 * From taps along to clicks (both seconds on the same clock): the typical
 * delay. Each tap goes with its nearest click; the median of the
 * differences ignores a stray tap or two. Null with too few taps, or when
 * they are all over the place.
 */
export function measureLatency(clicks: number[], taps: number[]): { latency: number; spread: number } | null {
    if (clicks.length === 0 || taps.length < 4) return null;
    const diffs = taps.map(t => {
        let best = clicks[0];
        for (const c of clicks) if (Math.abs(t - c) < Math.abs(t - best)) best = c;
        return t - best;
    }).sort((a, b) => a - b);
    const median = diffs[Math.floor(diffs.length / 2)];
    // Middle half's width: how steady the taps were.
    const q1 = diffs[Math.floor(diffs.length / 4)];
    const q3 = diffs[Math.floor((diffs.length * 3) / 4)];
    const spread = q3 - q1;
    if (spread > 0.12) return null;
    return { latency: Math.round(median * 1000) / 1000, spread };
}

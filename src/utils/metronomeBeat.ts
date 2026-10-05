import { TONE_PPQ } from './timemap';

/**
 * The visual metronome's arithmetic (utils/visualMetronome.ts), apart from
 * its drawing, for the checks (scripts/check-metronome.mjs).
 */

/** The beat of a meter, in ticks: compound meters beat in dotted quarters, other eighths in eighths. */
export function beatTicksOf(meter?: { count: number; unit: number }): number {
    if (!meter) return TONE_PPQ;
    if (meter.unit === 8) return meter.count % 3 === 0 && meter.count > 3 ? TONE_PPQ * 1.5 : TONE_PPQ / 2;
    return TONE_PPQ * 4 / meter.unit;
}

/** How many beats a tick is past its bar line (`bars`: the bar lines' ticks, rising). */
export function beatsAt(bars: number[], beatTicks: number, tick: number): number {
    let lo = 0, hi = bars.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (bars[mid] <= tick) lo = mid; else hi = mid - 1;
    }
    return (tick - (bars[lo] ?? 0)) / beatTicks;
}

/** The swing: 1 at the bottom, on the beat; -1 at the top, halfway between beats. */
export function swingAt(beats: number): number {
    return Math.cos(2 * Math.PI * beats);
}

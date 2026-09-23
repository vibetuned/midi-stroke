import * as Tone from 'tone';

/**
 * The rhythm games' clock: the audio clock, as it is *heard*. Clicks are
 * scheduled on the audio context; what reaches the speakers lags that by the
 * output latency, and a key press, a touch or a MIDI note is stamped on the
 * page's clock (performance.now). getOutputTimestamp relates the two, so both
 * the picture and the judging can use "the audio playing out right now" —
 * the calibrated device delay (latency.ts) then covers input and player.
 */

function raw(): AudioContext {
    return Tone.getContext().rawContext as unknown as AudioContext;
}

/** Audio-context seconds of the sound reaching the speakers at this moment. */
export function heardNow(): number {
    const ctx = raw();
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
        return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
}

/** The same, for an event stamped on the page's clock (a keydown's timeStamp, a MIDI note). */
export function heardAt(perfMs: number): number {
    return heardNow() - (performance.now() - perfMs) / 1000;
}

/** Audio-context seconds now, to schedule sound. */
export function scheduleNow(): number {
    return raw().currentTime;
}

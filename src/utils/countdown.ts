import * as Tone from 'tone';
import { TONE_PPQ, type TimemapData } from './timemap';
import { pulseTicksOf } from './metronomeBeat';

/**
 * The count-in before play: "4, 3, 2, Start" in 4/4, "3, 2, Start" in 3/4,
 * "2, Start" in 2/4 — a beat apart, the meter's beat as it is counted at the
 * tempo (a 6/8 jig in dotted quarters, "2, Start"; a slow 6/8 in eighths,
 * "6, 5, 4, 3, 2, Start": utils/metronomeBeat.ts pulseTicksOf), clicked like
 * the metronome unless it is muted.
 *
 * The "1" is the score's own: every score opens with a count-in rest
 * (utils/mei.ts ensureCountInMeasure), so from the beginning the transport
 * starts as "Start" shows and plays that rest, and the music comes in a beat
 * later — the bar counted in full. From anywhere else (a loop's start, a
 * pause mid-piece) there is no rest to play, so that beat is silent: the
 * music always comes in one beat after "Start".
 *
 * The transport is started on the audio clock, at the time the count leads
 * to, so the count and the music are one pulse.
 */

export interface CountdownPlan {
    /** What shows on each beat: the numbers, then "Start". */
    labels: string[];
    /** One beat, in seconds. */
    beatSec: number;
    /** When the transport starts, in seconds after the first label (the music comes in at labels.length beats). */
    transportAt: number;
}

/**
 * The count for a meter at a tempo (quarter notes a minute), from transport
 * tick `from`, the music coming in at tick `musicStart` (the first bar after
 * the count-in rest).
 */
export function countdownPlan(meter: { count: number; unit: number } | undefined, bpm: number, from: number, musicStart: number): CountdownPlan {
    const m = meter ?? { count: 4, unit: 4 };
    const beatTicks = pulseTicksOf(m, bpm);
    const barTicks = m.count * TONE_PPQ * 4 / m.unit;
    const beats = Math.max(1, Math.round(barTicks / beatTicks));
    const labels = [...Array.from({ length: beats - 1 }, (_, i) => String(beats - i)), 'Start'];
    const ticksPerSec = bpm / 60 * TONE_PPQ;
    const beatSec = beatTicks / ticksPerSec;
    // The music comes in a beat after "Start"; whatever of the count-in rest
    // lies ahead of the playhead is played by the transport itself, before it.
    const musicAt = labels.length * beatSec;
    const lead = Math.max(0, musicStart - from) / ticksPerSec;
    return { labels, beatSec, transportAt: Math.max(0, musicAt - lead) };
}

/** Where the music starts: the first bar after the count-in measure. */
export function musicStartOf(tm: TimemapData | null): number {
    if (!tm) return 0;
    const bars = [...new Set(tm.measureTicks.values())].sort((a, b) => a - b);
    return bars.length > 1 ? bars[1] : 0;
}

// --- running it (the browser) ---------------------------------------------

let running: { cancel(): void } | null = null;

/** Stop a count that is running; true when there was one. */
export function cancelCountdown(): boolean {
    if (!running) return false;
    running.cancel();
    running = null;
    return true;
}

export function countdownRunning(): boolean {
    return running !== null;
}

/**
 * Run a count: `onLabel` with each label on its beat (null when the music
 * comes in, or when it is stopped), clicks if `click`, and `onStart(time)` a
 * little before the transport is due, with the audio time to start it at.
 */
export function runCountdown(plan: CountdownPlan, opts: {
    click: boolean;
    onLabel: (label: string | null) => void;
    onStart: (audioTime: number) => void;
}): void {
    cancelCountdown();
    const t0 = Tone.now() + 0.08;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (audioTime: number, fn: () => void) => {
        timers.push(setTimeout(fn, Math.max(0, (audioTime - Tone.immediate()) * 1000)));
    };

    let synth: Tone.MembraneSynth | null = null;
    if (opts.click) {
        // The metronome's own click (hooks/useAudio.ts), a little brighter on the counts.
        synth = new Tone.MembraneSynth({ envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: -10 }).toDestination();
        plan.labels.forEach((_, i) => synth!.triggerAttackRelease(i === 0 ? 'C2' : 'C1', '8n', t0 + i * plan.beatSec));
    }
    plan.labels.forEach((label, i) => at(t0 + i * plan.beatSec, () => opts.onLabel(label)));
    const startTime = t0 + plan.transportAt;
    // Start the transport just ahead of its time, so it starts on it exactly.
    timers.push(setTimeout(() => opts.onStart(startTime), Math.max(0, (startTime - Tone.immediate()) * 1000 - 120)));
    const musicTime = t0 + plan.labels.length * plan.beatSec;
    at(musicTime, () => { opts.onLabel(null); finish(); });
    timers.push(setTimeout(() => synth?.dispose(), Math.max(0, (musicTime - Tone.immediate()) * 1000) + 600));

    const finish = () => { if (running === handle) running = null; };
    const handle = {
        cancel() {
            timers.forEach(clearTimeout);
            synth?.dispose();
            opts.onLabel(null);
        },
    };
    running = handle;
}

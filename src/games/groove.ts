import { PAD_TO_VOICE, padForScoreNote, type DrumVoiceKey } from '../utils/drumPads';
import { barBoundaries } from '../utils/loopRange';
import { TONE_PPQ, type TimemapData } from '../utils/timemap';
import { PRESS, grade, type Grade } from './judge';

/**
 * Groove Builder — a beat from the drum library, built one part at a time,
 * like a looper. A bar is counted in, then you play the first part (the
 * kick) once round the wheel; from then on it plays as you played it while
 * you play the next — snare, hi-hat, the rest — and after the last part the
 * whole groove plays twice. Every tap lands on a step of the grid, so what
 * you play is what the groove keeps: a hit on the wrong step stays wrong, a
 * missed one stays missing, for the rest of the song. It trains playing a
 * part against others, the independence every player needs, on the drum
 * charts the drums app plays. Pure, for the node checks; the game is
 * components/games/GrooveGame.tsx.
 */

export interface GrooveLayer {
    voice: DrumVoiceKey;
    label: string;
    /** Hits in one loop, beats from its start. */
    hits: number[];
}

export interface GrooveLevel {
    id: string;
    title: string;
    detail: string;
    bpm: number;
    /** Quarter-note beats in one loop (the chart's bars). */
    loopBeats: number;
    beatsPerBar: number;
    /** Beats a click: 1, or 1.5 in a compound metre (12/8). */
    pulse: number;
    /** Beats a step of the wheel: the finest grid the hits need. */
    step: number;
    /** In the order they come in: the foundation first. */
    layers: GrooveLayer[];
    songKey?: string;
}

/** The order parts join: kick, then the backbeat, then the time, then colour. */
const ORDER: DrumVoiceKey[] = ['kick', 'snare', 'clap', 'rim', 'hatClosed', 'hatOpen', 'ride', 'crash', 'cowbell', 'tambourine', 'tomLow', 'tomMid', 'tomHigh'];

export const LAYER_LABEL: Record<DrumVoiceKey, string> = {
    kick: 'Kick', snare: 'Snare', clap: 'Clap', rim: 'Rim', hatClosed: 'Hi-hat', hatOpen: 'Open hat', ride: 'Ride',
    crash: 'Cymbal', cowbell: 'Cowbell', tambourine: 'Tambourine', tomLow: 'Low tom', tomMid: 'Mid tom', tomHigh: 'High tom',
};

/**
 * The grid of the wheel: sixteenths (eighths in a compound metre, 12/8), or
 * finer when a hit needs it — triplets make 24 steps a bar. The hits must
 * all sit on it.
 */
export function gridOf(positions: number[], loopBeats: number, pulse = 1): number {
    const fits = (s: number) => [...positions, loopBeats].every(p => Math.abs(p / s - Math.round(p / s)) < 1e-3);
    const candidates = pulse === 1.5 ? [0.5, 0.25, 1 / 6, 0.125] : [0.25, 1 / 6, 0.125, 1 / 12];
    return candidates.find(fits) ?? candidates[candidates.length - 1];
}

/**
 * A drum chart as a groove: each voice a part, in the order they join.
 * `beatsPerBar` and `pulse` from the chart's metre (a chart's last bar may
 * stop short); the loop is its bars, rounded up to whole ones.
 */
export function grooveFromTimemap(timemap: TimemapData, beatsPerBar: number, pulse = 1): Pick<GrooveLevel, 'loopBeats' | 'step' | 'layers' | 'beatsPerBar'> | null {
    const bounds = barBoundaries(timemap);
    const start = bounds[0];
    const span = (bounds[bounds.length - 1] - start) / TONE_PPQ;
    const loopBeats = Math.max(1, Math.ceil(span / beatsPerBar - 0.01)) * beatsPerBar;
    const byVoice = new Map<DrumVoiceKey, Set<number>>();
    for (const o of timemap.onsets) {
        if (o.tick < start) continue;
        const at = Math.round(((o.tick - start) / TONE_PPQ) * 1e4) / 1e4;
        if (at >= loopBeats) continue;
        for (const n of o.notes) {
            const pad = padForScoreNote(n.midi, n.head);
            const voice = pad === undefined ? undefined : PAD_TO_VOICE[pad];
            if (!voice) continue;
            if (!byVoice.has(voice)) byVoice.set(voice, new Set());
            byVoice.get(voice)!.add(at);
        }
    }
    const layers = ORDER.filter(v => byVoice.has(v)).map(voice => ({
        voice, label: LAYER_LABEL[voice], hits: [...byVoice.get(voice)!].sort((a, b) => a - b),
    }));
    if (layers.length === 0) return null;
    return { loopBeats, beatsPerBar, layers, step: gridOf(layers.flatMap(l => l.hits), loopBeats, pulse) };
}

/** Grooves from the drum library, easiest first, each at a tempo that suits it. */
export const GROOVES: Array<{ songKey: string; title: string; detail: string; bpm: number }> = [
    { songKey: 'drums/200_machine_drum_patterns/SkaMeasureA.mei', title: 'Ska', detail: 'The plainest beat there is: kick on one and three, snare on two and four.', bpm: 112 },
    { songKey: 'drums/200_machine_drum_patterns/Rock4MeasureA.mei', title: 'Rock', detail: 'Kick on every beat, snare on two and four, hi-hat in eighths.', bpm: 96 },
    { songKey: 'drums/200_machine_drum_patterns/Disco2MeasureA.mei', title: 'Disco', detail: 'Four on the floor, the cowbell with it, and the hi-hat only on the ands.', bpm: 116 },
    { songKey: 'drums/200_machine_drum_patterns/Rock1MeasureA.mei', title: 'Rock ballad', detail: 'The kick sneaks in ahead of beat three.', bpm: 84 },
    { songKey: 'drums/200_machine_drum_patterns/Rock3MeasureA.mei', title: 'Hard rock', detail: 'Kicks on the ands of three and four.', bpm: 104 },
    { songKey: 'drums/200_machine_drum_patterns/Twist1MeasureA.mei', title: 'Twist', detail: 'A snare that answers itself.', bpm: 104 },
    { songKey: 'drums/200_machine_drum_patterns/Pop1MeasureA.mei', title: 'Pop', detail: 'A kick at the very end of the bar.', bpm: 96 },
    { songKey: 'drums/200_machine_drum_patterns/Pop4MeasureA.mei', title: 'Pop, pushed', detail: 'A second snare on the last sixteenth of beat two.', bpm: 92 },
    { songKey: 'drums/200_machine_drum_patterns/RhythmBlues1MeasureA.mei', title: 'Rhythm & blues', detail: 'Kicks on the ands, and a snare that pushes into the next bar.', bpm: 96 },
    { songKey: 'drums/200_machine_drum_patterns/Reggae2MeasureA.mei', title: 'One drop', detail: 'Reggae: the kick waits for beat three, the hi-hat skips.', bpm: 76 },
    { songKey: 'drums/200_machine_drum_patterns/Reggae4MeasureA.mei', title: 'Reggae lilt', detail: 'The hi-hat swings in triplets; the kick waits for three and four.', bpm: 76 },
    { songKey: 'drums/200_machine_drum_patterns/Funk1MeasureA.mei', title: 'Funk', detail: 'Kicks on the sixteenths.', bpm: 88 },
    { songKey: 'drums/200_machine_drum_patterns/Funk8MeasureA.mei', title: 'Open-hat funk', detail: 'The snare on the ands of two and four, the open hat on every beat.', bpm: 92 },
    { songKey: 'drums/200_machine_drum_patterns/RhythmBlues3MeasureA.mei', title: 'Off the beat', detail: 'Six kicks, five of them between the beats.', bpm: 88 },
    { songKey: 'drums/200_machine_drum_patterns/Pop2MeasureA.mei', title: 'Syncopation', detail: 'Kick and snare trade off around the beat: the snare on the last sixteenth of one.', bpm: 100 },
    { songKey: 'drums/200_machine_drum_patterns/BossaNova1MeasureA.mei', title: 'Bossa nova', detail: 'The rim plays the clave.', bpm: 92 },
    { songKey: 'drums/200_machine_drum_patterns/Afro-Cuban1MeasureA.mei', title: 'Afro-Cuban', detail: 'A hi-hat with a skip in it.', bpm: 96 },
    { songKey: 'drums/200_machine_drum_patterns/Afro-Cuban2MeasureA.mei', title: 'Afro-Cuban toms', detail: 'Five parts: the toms join in on three and four.', bpm: 92 },
    { songKey: 'drums/200_machine_drum_patterns/Cha-ChaMeasureA.mei', title: 'Cha-cha', detail: 'Cowbell, kick, and toms that talk.', bpm: 100 },
    { songKey: 'drums/200_machine_drum_patterns/Shuffle1MeasureA.mei', title: 'Shuffle', detail: 'Twelve-eight: three to a beat.', bpm: 132 },
    { songKey: 'drums/200_machine_drum_patterns/Swing2MeasureA.mei', title: 'Swing', detail: 'Twelve-eight, and the hi-hat swings: ding, ding-a, ding, ding-a.', bpm: 120 },
    { songKey: 'drums/200_machine_drum_patterns/Blues1MeasureA.mei', title: 'Slow blues', detail: 'Every triplet on the hi-hat: twelve to the bar.', bpm: 90 },
    { songKey: 'drums/200_machine_drum_patterns/Funk15MeasureA.mei', title: 'Triplet funk', detail: 'Quarter-note triplets on the hi-hat: three to every two beats.', bpm: 90 },
    { songKey: 'drums/200_machine_drum_patterns/Samba1MeasureA.mei', title: 'Samba', detail: 'Six parts. The kick never stops.', bpm: 92 },
];

// ------------------------------------------------------------- the run, loop by loop

/** Loops of the whole groove played at the end: to hear it — or what is missing from it. */
export const FINAL_LOOPS = 2;

/** What a turn of the loop is for: the count-in, a part being played, the groove played back, or over. */
export type Turn = { kind: 'countin' } | { kind: 'record'; layer: number } | { kind: 'final' } | { kind: 'end' };

export function turnOf(level: GrooveLevel, loop: number): Turn {
    if (loop <= 0) return { kind: 'countin' };
    if (loop <= level.layers.length) return { kind: 'record', layer: loop - 1 };
    if (loop <= level.layers.length + FINAL_LOOPS) return { kind: 'final' };
    return { kind: 'end' };
}

/** Steps round the wheel. */
export function stepsOf(level: GrooveLevel): number {
    return Math.round(level.loopBeats / level.step);
}

/** The steps a part should hit. */
export function targetCells(level: GrooveLevel, layer: number): number[] {
    return [...new Set(level.layers[layer].hits.map(h => Math.round(h / level.step)))].sort((a, b) => a - b);
}

/** A part as you played it: step → how far the tap was from it, seconds (− early). */
export type Take = Map<number, number>;

/**
 * Where a tap lands: the nearest step of the grid, counted from the start of
 * the count-in — so its loop, and its step in the loop — and how far off it
 * was. A tap a hair before a loop begins is that loop's first step.
 */
export function cellOfTap(t: number, stepSec: number, steps: number): { loop: number; cell: number; error: number } {
    const g = Math.round(t / stepSec);
    return { loop: Math.floor(g / steps), cell: ((g % steps) + steps) % steps, error: t - g * stepSec };
}

/** A step keeps the tap closest to it. */
export function addTap(take: Take, cell: number, error: number): void {
    const had = take.get(cell);
    if (had === undefined || Math.abs(error) < Math.abs(had)) take.set(cell, error);
}

export interface PartScore {
    label: string;
    targets: number[];
    /** Steps hit that should be, with how close each tap was. */
    correct: Array<{ cell: number; error: number; grade: Grade }>;
    /** Steps that should have been hit, and were not: missing from the groove. */
    missed: number[];
    /** Steps hit that should not have been: wrong in the groove. */
    wrong: number[];
    accuracy: number;
}

const WORTH: Record<Grade, number> = { perfect: 1, good: 0.7, ok: 0.4, miss: 0 };

/** How a part went: every right step worth its timing, and each wrong one costing a little. */
export function scoreTake(level: GrooveLevel, layer: number, take: Take): PartScore {
    const targets = targetCells(level, layer);
    const want = new Set(targets);
    const correct = targets.filter(c => take.has(c)).map(cell => {
        const error = take.get(cell)!;
        // Anywhere in its step lands on it; how close it came is still worth something.
        const g = grade(error, PRESS);
        return { cell, error, grade: g === 'miss' ? 'ok' as Grade : g };
    });
    const missed = targets.filter(c => !take.has(c));
    const wrong = [...take.keys()].filter(c => !want.has(c)).sort((a, b) => a - b);
    const points = correct.reduce((a, c) => a + WORTH[c.grade], 0) - 0.5 * wrong.length;
    return { label: level.layers[layer].label, targets, correct, missed, wrong, accuracy: Math.max(0, points / Math.max(1, targets.length)) };
}

export interface GrooveSummary {
    accuracy: number;
    stars: 0 | 1 | 2 | 3;
    parts: PartScore[];
    /** How the right hits typically sat on their steps (the median), seconds (− early). */
    bias: number | null;
}

export function summarizeGroove(level: GrooveLevel, takes: Take[]): GrooveSummary {
    const parts = level.layers.map((_, k) => scoreTake(level, k, takes[k] ?? new Map()));
    // Parts weigh by their hits: a busy hi-hat counts for more than one crash.
    const total = parts.reduce((a, p) => a + p.targets.length, 0) || 1;
    const accuracy = parts.reduce((a, p) => a + p.accuracy * p.targets.length, 0) / total;
    const errors = parts.flatMap(p => p.correct.map(c => c.error)).sort((a, b) => a - b);
    const m = errors.length >> 1;
    const bias = errors.length ? (errors.length % 2 ? errors[m] : (errors[m - 1] + errors[m]) / 2) : null;
    return { accuracy, stars: accuracy >= 0.85 ? 3 : accuracy >= 0.7 ? 2 : accuracy >= 0.45 ? 1 : 0, parts, bias };
}

/** One sentence on the groove, when there is something to say. */
export function grooveTip(level: GrooveLevel, s: GrooveSummary): string | null {
    const ms = (x: number) => `${Math.round(Math.abs(x) * 1000)} ms`;
    const sub = level.step <= 0.25 ? '"one-e-and-a"' : '"one-and-two-and"';
    const worst = [...s.parts].sort((a, b) => (b.wrong.length + b.missed.length) - (a.wrong.length + a.missed.length))[0];
    if (worst && worst.wrong.length > 0 && worst.wrong.length >= worst.missed.length) {
        return `The ${worst.label.toLowerCase()} landed on the wrong step ${worst.wrong.length === 1 ? 'once' : `${worst.wrong.length} times`}, and those hits stayed in the groove. Count ${sub} and place each hit on its step.`;
    }
    if (worst && worst.missed.length > 0) {
        return `The ${worst.label.toLowerCase()} missed ${worst.missed.length === 1 ? 'a hit' : `${worst.missed.length} hits`}, and the groove played on without ${worst.missed.length === 1 ? 'it' : 'them'}.`;
    }
    if (s.bias !== null && s.bias < -0.035) return `Every hit on its step, but you play ahead of the beat — about ${ms(s.bias)}. Lean back a little.`;
    if (s.bias !== null && s.bias > 0.035) return `Every hit on its step, but you play behind the beat — about ${ms(s.bias)}. Push a little.`;
    return 'Every part on its step. The groove is yours — try it on a kit in the drums app.';
}

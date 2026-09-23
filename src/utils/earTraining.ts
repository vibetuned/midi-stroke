/**
 * Learn by ear — additive melodic dictation (spec: docs/learn-by-ear.md).
 *
 * The instrument plays a phrase (the call), the student plays it back from
 * memory (the response), and every successful response lengthens the phrase
 * by one note. Nothing on the page gives the next note away: it is revealed
 * only once it has been played correctly.
 *
 * Everything here is pure — melody reduction, the phrase the call plays, and
 * the call-and-response state machine as a reducer — so the rules in the spec
 * can be checked without a browser (scripts/check-ear-training.mjs). The
 * provider (context/EarTrainingContext.tsx) runs the side effects: sounding
 * the call, listening to the keyboard, the error cue, the pause between
 * rounds.
 */

import { TONE_PPQ, type TimemapData } from './timemap';
import { tempoAt, type TempoMap } from './tempo';

/** 1 = treble (right hand, soprano lead), 2 = bass (left hand, root foundation). */
export type EarStaff = 1 | 2;

export interface MelodyNote {
    /** Position in the melody, 0-based. */
    index: number;
    tick: number;
    endTick: number;
    midi: number;
    /** Verovio's element id, to find the note on the rendered page. */
    id?: string;
}

// ------------------------------------------------------- melodic reduction

/**
 * Reduce one staff of a score to a single line. Where several notes start
 * together — a chord, or two voices — the treble keeps its highest note (the
 * soprano) and the bass its lowest (the root). Ties are already merged in the
 * timemap, so a held note is one note; a repeated pitch is two.
 */
export function extractMelody(timemap: TimemapData, staff: EarStaff): MelodyNote[] {
    const picked: Omit<MelodyNote, 'index'>[] = [];
    for (const onset of timemap.onsets) {
        const onStaff = onset.notes.filter(n => n.staff === staff);
        if (onStaff.length === 0) continue;
        const choice = onStaff.reduce((best, n) =>
            (staff === 1 ? n.midi > best.midi : n.midi < best.midi) ? n : best);
        picked.push({ tick: onset.tick, endTick: choice.endTick, midi: choice.midi, id: choice.id });
    }
    // A monophonic line: a note ends, at the latest, where the next begins.
    return picked.map((n, index) => ({
        ...n,
        index,
        endTick: index + 1 < picked.length ? Math.min(n.endTick, picked[index + 1].tick) : n.endTick,
    }));
}

/** Which staves a score actually has notes on. */
export function stavesWithNotes(timemap: TimemapData): EarStaff[] {
    const found = new Set<number>();
    for (const o of timemap.onsets) for (const n of o.notes) found.add(n.staff);
    return ([1, 2] as const).filter(s => found.has(s));
}

// ------------------------------------------------------------- the call

export type EarRhythm = 'written' | 'even';

/**
 * The phrase the call plays: the first `k` melody notes, starting at once.
 *
 * `written` keeps the score's rhythm and its tempo map (shifted to the
 * phrase, so a change later in the piece still falls where it should).
 * `even` plays one note per beat at the slider's tempo, so only pitch is left
 * to listen for — each slightly detached, so a repeated pitch is heard twice.
 */
export function callTimemap(
    melody: MelodyNote[], k: number, rhythm: EarRhythm, tempo?: TempoMap | null,
): TimemapData {
    const phrase = melody.slice(0, Math.max(0, Math.min(k, melody.length)));
    if (phrase.length === 0) return { totalTicks: 0, measureTicks: new Map(), onsets: [] };

    if (rhythm === 'even') {
        const onsets = phrase.map((n, j) => ({
            tick: j * TONE_PPQ,
            notes: [{ midi: n.midi, staff: 1, endTick: j * TONE_PPQ + Math.round(TONE_PPQ * 0.85) }],
        }));
        return { totalTicks: phrase.length * TONE_PPQ, measureTicks: new Map(), onsets };
    }

    const origin = phrase[0].tick;
    const onsets = phrase.map(n => ({
        tick: n.tick - origin,
        notes: [{ midi: n.midi, staff: 1, endTick: n.endTick - origin }],
    }));
    const last = phrase[phrase.length - 1];

    // Shift the tempo map with the phrase: the tempo in force where the phrase
    // starts becomes its opening tempo; later changes keep their place. The
    // score's *opening* tempo stays the reference the slider scales against.
    let shifted: TempoMap | undefined;
    if (tempo?.initial) {
        const startBpm = tempoAt(tempo, origin) ?? tempo.initial.bpm;
        const marks = [
            { ...tempo.initial, tick: 0, bpm: startBpm },
            ...tempo.marks.filter(m => m.tick > origin).map(m => ({ ...m, tick: m.tick - origin })),
        ];
        shifted = { initial: { ...tempo.initial }, marks };
        // effectiveBpm scales by slider / initial.bpm, so keep initial.bpm as
        // the score's real opening tempo while the first mark carries startBpm.
    }
    return { totalTicks: last.endTick - origin, measureTicks: new Map(), onsets, tempo: shifted };
}

// ------------------------------------------------------------ the rules

/** Exact register (the default), or any octave of the right pitch class. */
export function pitchMatches(played: number, target: number, exactOctave: boolean): boolean {
    return exactOctave ? played === target : ((played - target) % 12 + 12) % 12 === 0;
}

export type EarPhase =
    | 'idle'      // waiting for Start
    | 'call'      // the phrase is sounding; input is locked
    | 'response'  // the student's turn
    | 'breath'    // a round was completed; a short rest before the longer call
    | 'error'     // a wrong note stopped the response; the assessment is up
    | 'complete'; // the whole melody, in one response

export interface EarStats {
    /** Keys struck while it was the student's turn. */
    attempts: number;
    correct: number;
    /** Current and best unbroken run of correct keys. */
    streak: number;
    bestStreak: number;
    /** The longest phrase played back in full: "retained 7 notes by ear". */
    depth: number;
}

export interface EarState {
    phase: EarPhase;
    /** Notes in the melody. */
    n: number;
    /** Current phrase length, 1..n. */
    k: number;
    /** Next note to play in this response, 0..k-1. */
    i: number;
    /** Notes visible on the page — always a prefix of the melody. */
    revealed: number;
    stats: EarStats;
    /** The last key judged, so the keyboard can show right or wrong. */
    last: { midi: number; ok: boolean } | null;
    /** Where the stumble happened (1-based note of the phrase), for the modal. */
    stumbleAt: number | null;
    /** Counts every call, so the same phrase can be called twice in a row
     *  (a restart during a call) and still be sounded again. */
    callId: number;
}

export type EarAction =
    | { type: 'reset'; n: number }
    | { type: 'start' }
    | { type: 'callDone' }
    | { type: 'note'; midi: number }
    | { type: 'breathDone' }
    | { type: 'retry' }
    | { type: 'restart' };

const freshStats = (): EarStats => ({ attempts: 0, correct: 0, streak: 0, bestStreak: 0, depth: 0 });

export function initialEarState(n: number): EarState {
    return { phase: 'idle', n, k: 1, i: 0, revealed: 0, stats: freshStats(), last: null, stumbleAt: null, callId: 0 };
}

/**
 * The call-and-response loop. `targets` is the melody's pitches; `exactOctave`
 * is the octave-strictness setting.
 */
export function earReducer(
    state: EarState, action: EarAction, targets: number[], exactOctave: boolean,
): EarState {
    switch (action.type) {
        case 'reset':
            return initialEarState(action.n);

        case 'start':
            if (state.n === 0) return state;
            // From the top, whatever came before: a fresh session.
            return { ...initialEarState(state.n), phase: 'call', callId: state.callId + 1 };

        case 'callDone':
            return state.phase === 'call' ? { ...state, phase: 'response', i: 0 } : state;

        case 'breathDone':
            return state.phase === 'breath' ? { ...state, phase: 'call', callId: state.callId + 1 } : state;

        case 'note': {
            // Input only counts on the student's turn: never during the call.
            if (state.phase !== 'response') return state;
            const target = targets[state.i];
            const ok = target !== undefined && pitchMatches(action.midi, target, exactOctave);
            const stats = { ...state.stats, attempts: state.stats.attempts + 1 };
            if (!ok) {
                // Stop at once, so a wrong interval is not practised in.
                stats.streak = 0;
                return {
                    ...state, phase: 'error', stats,
                    last: { midi: action.midi, ok: false }, stumbleAt: state.i + 1,
                };
            }
            stats.correct += 1;
            stats.streak += 1;
            stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
            const i = state.i + 1;
            const revealed = Math.max(state.revealed, i);
            const last = { midi: action.midi, ok: true };
            if (i < state.k) return { ...state, i, revealed, stats, last };

            // The whole phrase came back.
            stats.depth = Math.max(stats.depth, state.k);
            if (state.k >= state.n) {
                return { ...state, phase: 'complete', i, revealed: state.n, stats, last, stumbleAt: null };
            }
            return { ...state, phase: 'breath', k: state.k + 1, i: 0, revealed, stats, last, stumbleAt: null };
        }

        case 'retry':
            // Same phrase again, heard again, played from its first note.
            if (state.phase !== 'error') return state;
            return { ...state, phase: 'call', i: 0, stumbleAt: null, callId: state.callId + 1 };

        case 'restart':
            // Back to the opening note, and every note veiled again. The
            // assessment keeps counting: it covers the whole session.
            if (state.n === 0) return state;
            return { ...state, phase: 'call', k: 1, i: 0, revealed: 0, last: null, stumbleAt: null, callId: state.callId + 1 };
    }
}

/** Correct keys as a share of all keys struck on the student's turn. */
export function pitchAccuracy(stats: EarStats): number {
    return stats.attempts > 0 ? stats.correct / stats.attempts : 0;
}

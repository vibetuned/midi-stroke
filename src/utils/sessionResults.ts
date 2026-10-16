import { TONE_PPQ, type TimemapData } from './timemap';
import type { SessionEvent } from './sessionLog';

/**
 * A session's results, as the dialog at the end of a piece shows them
 * (components/SessionResults.tsx) and as each song keeps them, one record per
 * session, to compare the next one with (context/StatsContext.tsx). Pure, for
 * the checks (scripts/check-session.mjs).
 */

export type Hands = 'left' | 'right' | 'both';

export interface SessionRecord {
    /** When it ended, in ms since the epoch. */
    at: number;
    /** The notes right the first time, out of the notes to play (0–1). */
    precision: number;
    /** Right, out of right, wrong and missed (0–1) — the header's percentage. */
    accuracy: number;
    /** Notes to play: the score's moments with a note for the hands chosen (a chord is one). */
    notes: number;
    /** Keys that played a note (rhythm), notes answered (practice). */
    correct: number;
    /** Keys that played nothing the score asks for. */
    wrongs: number;
    /** Notes let go by (rhythm). */
    misses: number;
    maxCombo: number;
    /** The tempo at the end, in quarter notes a minute. */
    bpm: number;
    /** Time spent playing (not paused), in ms. */
    playedMs: number;
    hands?: Hands;
    /** Rhythm: the hits' timing against their notes, in ms — mean (+ late) and spread (standard deviation). */
    timing?: { meanMs: number; spreadMs: number };
}

/** How many records a song keeps per mode. */
export const HISTORY_MAX = 50;

/** The notes to play: a score's onsets with at least one note on a staff in play. */
export function countNotes(tm: TimemapData, staffInPlay: (staff: number) => boolean = () => true): number {
    return tm.onsets.filter(o => o.notes.some(n => staffInPlay(n.staff))).length;
}

export interface SessionTotals {
    at: number;
    notes: number;
    /** Notes right the first time (the stats context's `score`). */
    score: number;
    correct: number;
    /** Every wrong the stats context counted: wrong keys and, in rhythm, missed notes. */
    wrongsCounted: number;
    maxCombo: number;
    bpm: number;
    playedMs: number;
    hands?: Hands;
    /** The tempo at a tick, for a score that changes tempo (utils/tempo.ts effectiveBpm); `bpm` throughout otherwise. */
    bpmAt?: (tick: number) => number;
}

/** A session's record, from the stats context's counts and the session's events. */
export function summarizeSession(t: SessionTotals, events: readonly SessionEvent[]): SessionRecord {
    const misses = events.filter(e => e.kind === 'miss').length;
    const attempts = t.correct + t.wrongsCounted;
    const record: SessionRecord = {
        at: t.at,
        precision: t.notes > 0 ? Math.min(1, t.score / t.notes) : 0,
        accuracy: attempts > 0 ? t.correct / attempts : 0,
        notes: t.notes,
        correct: t.correct,
        wrongs: Math.max(0, t.wrongsCounted - misses),
        misses,
        maxCombo: t.maxCombo,
        bpm: t.bpm,
        playedMs: Math.round(t.playedMs),
    };
    if (t.hands) record.hands = t.hands;
    const timing = timingOf(events, t.bpmAt ?? t.bpm);
    if (timing) record.timing = timing;
    return record;
}

/** The hits' timing in ms, at a tempo or at the tempo of each hit's tick: null with fewer than three timed hits. */
export function timingOf(events: readonly SessionEvent[], bpm: number | ((tick: number) => number)): { meanMs: number; spreadMs: number } | null {
    const msPerTick = (tick: number) => 60000 / ((typeof bpm === 'number' ? bpm : bpm(tick)) * TONE_PPQ);
    const ms = events.filter(e => e.kind === 'hit' && e.offset !== undefined).map(e => e.offset! * msPerTick(e.tick));
    if (ms.length < 3) return null;
    const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
    const spread = Math.sqrt(ms.reduce((a, b) => a + (b - mean) ** 2, 0) / ms.length);
    return { meanMs: Math.round(mean), spreadMs: Math.round(spread) };
}

/** A song's records with one more, the oldest dropped past HISTORY_MAX. */
export function appendHistory(history: readonly SessionRecord[] | undefined, record: SessionRecord): SessionRecord[] {
    const next = [...(history ?? []), record];
    return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
}

/** This session against the ones before it: the last one's precision, the best, and the change. */
export function compareSessions(previous: readonly SessionRecord[], record: SessionRecord): {
    last: SessionRecord | null;
    best: number | null;
    /** Precision now minus last time, in points (null the first time). */
    delta: number | null;
    /** Better than every session before. */
    personalBest: boolean;
} {
    const last = previous.length ? previous[previous.length - 1] : null;
    const best = previous.length ? Math.max(...previous.map(r => r.precision)) : null;
    return {
        last,
        best,
        delta: last ? Math.round(record.precision * 100) - Math.round(last.precision * 100) : null,
        personalBest: best !== null && record.precision > best,
    };
}

/** The span the results draw: from the first bar after the count-in to the end. */
export function musicSpan(tm: TimemapData): { bars: number[]; start: number; end: number } {
    const bars = [...new Set(tm.measureTicks.values())].sort((a, b) => a - b);
    const start = bars.length > 1 ? bars[1] : 0;
    return { bars: bars.length ? bars : [0], start, end: Math.max(start + 1, tm.totalTicks) };
}

/** "2:31" — minutes and seconds. */
export function formatPlayed(ms: number): string {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "on time", "18 ms late", "12 ms early" — within 10 ms is on time. */
export function describeTiming(meanMs: number): string {
    if (Math.abs(meanMs) < 10) return 'on time';
    return `${Math.abs(meanMs)} ms ${meanMs > 0 ? 'late' : 'early'}`;
}

/**
 * Timing judgement for the rhythm games: how far from the beat a press or a
 * release was, and what that is worth. Errors are in seconds, measured on the
 * audio clock after the device's latency is taken off (latency.ts), negative
 * when early. Pure, for the node checks.
 */

export type Grade = 'perfect' | 'good' | 'ok' | 'miss';

export interface Windows { perfect: number; good: number; ok: number }

/** Striking on time. */
export const PRESS: Windows = { perfect: 0.05, good: 0.1, ok: 0.17 };
/** Letting go on time — harder to feel than a strike, so a little wider. */
export const RELEASE: Windows = { perfect: 0.07, good: 0.13, ok: 0.21 };

export function grade(error: number | null, w: Windows): Grade {
    if (error === null) return 'miss';
    const e = Math.abs(error);
    return e <= w.perfect ? 'perfect' : e <= w.good ? 'good' : e <= w.ok ? 'ok' : 'miss';
}

const WORTH: Record<Grade, number> = { perfect: 1, good: 0.7, ok: 0.4, miss: 0 };

export interface NoteResult {
    press: Grade;
    release: Grade;
    /** Seconds, negative = early; null when there was no press / release. */
    pressError: number | null;
    releaseError: number | null;
}

/** A note as a whole: the worse of its strike and its let-go. */
export function noteGrade(r: NoteResult): Grade {
    const order: Grade[] = ['miss', 'ok', 'good', 'perfect'];
    return order[Math.min(order.indexOf(r.press), order.indexOf(r.release))];
}

export interface Summary {
    /** 0–1: every strike and let-go, weighted by grade. */
    accuracy: number;
    stars: 0 | 1 | 2 | 3;
    counts: Record<Grade, number>;
    /** Longest run of notes with no miss. */
    maxCombo: number;
    /** Mean timing of the strikes and the let-goes that landed (seconds, − = early). */
    pressBias: number | null;
    releaseBias: number | null;
}

export function summarize(results: NoteResult[]): Summary {
    const counts: Record<Grade, number> = { perfect: 0, good: 0, ok: 0, miss: 0 };
    let points = 0;
    let combo = 0, maxCombo = 0;
    for (const r of results) {
        points += WORTH[r.press] + WORTH[r.release];
        const g = noteGrade(r);
        counts[g]++;
        combo = g === 'miss' ? 0 : combo + 1;
        maxCombo = Math.max(maxCombo, combo);
    }
    const accuracy = results.length ? points / (2 * results.length) : 0;
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
        accuracy,
        stars: accuracy >= 0.9 ? 3 : accuracy >= 0.75 ? 2 : accuracy >= 0.5 ? 1 : 0,
        counts,
        maxCombo,
        pressBias: mean(results.filter(r => r.press !== 'miss' && r.pressError !== null).map(r => r.pressError!)),
        releaseBias: mean(results.filter(r => r.release !== 'miss' && r.releaseError !== null).map(r => r.releaseError!)),
    };
}

/** One sentence on the player's tendency, when there is one worth mentioning. */
export function tip(s: Summary): string | null {
    const ms = (x: number) => `${Math.round(Math.abs(x) * 1000)} ms`;
    if (s.releaseBias !== null && s.releaseBias < -0.06) return `You let go about ${ms(s.releaseBias)} early — hold each note its full length, right up to the next beat.`;
    if (s.releaseBias !== null && s.releaseBias > 0.06) return `You hold on about ${ms(s.releaseBias)} too long — let go on the beat.`;
    if (s.pressBias !== null && s.pressBias < -0.04) return `You tend to rush — strikes land about ${ms(s.pressBias)} early. Wait for the beat.`;
    if (s.pressBias !== null && s.pressBias > 0.04) return `You tend to drag — strikes land about ${ms(s.pressBias)} late. Feel the beat coming.`;
    return null;
}

/**
 * Taps against the moments they were asked for, in any rhythm. Seconds,
 * both on one clock, `expected` in order. Each tap goes to the nearest moment
 * within the OK window — or, when that one is already answered, to its free neighbour
 * if that is in the window too (two quick notes, two quick taps); each moment
 * keeps its closest tap. A moment nobody tapped is null; a tap no moment
 * wanted is an extra.
 */
export function matchOnsets(expected: number[], taps: number[], w: Windows = PRESS): { errors: Array<number | null>; extras: number } {
    const best: Array<number | null> = expected.map(() => null);
    let extras = 0;
    for (const t of [...taps].sort((a, b) => a - b)) {
        if (expected.length === 0) { extras++; continue; }
        let lo = 0, hi = expected.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (expected[mid] < t) lo = mid + 1; else hi = mid;
        }
        // lo: the first moment at or after the tap; the nearest is it or the one before.
        const near = lo > 0 && Math.abs(expected[lo - 1] - t) <= Math.abs(expected[lo] - t) ? lo - 1 : lo;
        const other = near === lo ? lo - 1 : lo;
        const within = (k: number) => k >= 0 && k < expected.length && Math.abs(t - expected[k]) <= w.ok;
        let k = near;
        if (best[near] !== null && within(other) && best[other] === null) k = other;
        if (!within(k)) { extras++; continue; }
        const e = t - expected[k];
        const prev = best[k];
        if (prev === null) best[k] = e;
        else { extras++; if (Math.abs(e) < Math.abs(prev)) best[k] = e; }
    }
    return { errors: best, extras };
}

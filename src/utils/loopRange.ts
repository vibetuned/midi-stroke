import type { TimemapData } from './timemap';

/**
 * A stretch of the piece chosen on the minimap, whole bars only: looped in
 * rhythm and practice, the melody to learn in By ear. Ticks, as everywhere in
 * the app; `end` is exclusive (the start of the bar after the last one).
 */
export interface LoopRange {
    start: number;
    end: number;
}

/**
 * Every bar line of the piece, in ticks, from the first real bar to the end:
 * the places a range may start or stop. The first measure is the count-in the
 * viewers add (utils/mei.ts), which doubles as their sticky clef strip and is
 * left off the minimap — so it is left out here too.
 */
export function barBoundaries(timemap: TimemapData): number[] {
    const starts = [...new Set(timemap.measureTicks.values())].sort((a, b) => a - b);
    const out = starts.slice(starts.length > 1 ? 1 : 0).filter(t => t < timemap.totalTicks);
    out.push(timemap.totalTicks);
    return out;
}

/** The boundary nearest to a tick. */
export function nearestBoundary(boundaries: number[], tick: number): number {
    let best = boundaries[0] ?? 0;
    for (const b of boundaries) if (Math.abs(b - tick) < Math.abs(best - tick)) best = b;
    return best;
}

/**
 * Move one end of a range to the bar line nearest `tick`, keeping at least one
 * bar between the ends. Returns null when the result is the whole piece —
 * there is nothing to loop.
 */
export function dragRangeEnd(
    boundaries: number[],
    range: LoopRange | null,
    which: 'start' | 'end',
    tick: number,
): LoopRange | null {
    if (boundaries.length < 2) return null;
    const first = boundaries[0];
    const last = boundaries[boundaries.length - 1];
    const cur = range ?? { start: first, end: last };
    const at = nearestBoundary(boundaries, tick);
    const idx = (t: number) => boundaries.indexOf(nearestBoundary(boundaries, t));
    let next: LoopRange;
    if (which === 'start') {
        const maxIdx = idx(cur.end) - 1;
        next = { start: boundaries[Math.max(0, Math.min(idx(at), maxIdx))], end: cur.end };
    } else {
        const minIdx = idx(cur.start) + 1;
        next = { start: cur.start, end: boundaries[Math.min(boundaries.length - 1, Math.max(idx(at), minIdx))] };
    }
    return next.start === first && next.end === last ? null : next;
}

/** Bar numbers a range covers, counting the first real bar as 1. */
export function barSpan(boundaries: number[], range: LoopRange): { first: number; last: number } {
    const i = boundaries.indexOf(nearestBoundary(boundaries, range.start));
    const j = boundaries.indexOf(nearestBoundary(boundaries, range.end));
    return { first: i + 1, last: Math.max(i + 1, j) };
}

/** "bar 5" or "bars 5–8". */
export function barSpanLabel(boundaries: number[], range: LoopRange): string {
    const { first, last } = barSpan(boundaries, range);
    return first === last ? `bar ${first}` : `bars ${first}–${last}`;
}

export function inRange(tick: number, range: LoopRange | null): boolean {
    return !range || (tick >= range.start && tick < range.end);
}

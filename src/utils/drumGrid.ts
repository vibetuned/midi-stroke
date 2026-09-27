/**
 * The drums app's step grid (components/drums/VirtualDrums.tsx): a row per
 * drum, a column per step of the bar — 16 sixteenths in 4/4, 12 triplet
 * eighths for a triplet feel, 12 eighths in 12/8, 8 sixteenths in 2/4 — and
 * where each hit of the score falls on it.
 *
 * The grid never moves. It shows the bar being played, and as the playhead
 * leaves a column, that column turns to the same step of the next bar: ahead
 * of the cursor, what is still to come in this bar; behind it, the start of
 * the next one. A pattern of a bar or two reads round and round; a long
 * groove reads as it goes.
 *
 * Built from the timemap, not the MEI, so it follows whatever the app plays:
 * repeats written out, generated patterns, uploaded scores, the grooves.
 * Pure, for the node checks (scripts/check-drum-grid.mjs).
 */
import { TONE_PPQ, type TimemapData } from './timemap';

/** A pattern of up to this many bars loops; anything longer plays through and stops. */
export const LOOP_MAX_BARS = 4;

export interface DrumGridRow {
    id: string;
    /** The two letters the grid shows. */
    label: string;
    color: string;
    shape: 'circle' | 'cross' | 'diamond' | 'plus' | 'slash';
}

interface RowMatch { midi: number; head?: string; fill?: string; row: DrumGridRow }

const BLUE = '#1a1aff', GREEN = '#2ade2a', RED = '#ff1a1a';

/** Top of the grid to the bottom — cymbals down to the feet — with where each is written. */
const ROWS: RowMatch[] = [
    { midi: 81, head: 'x', row: { id: 'Cymbal', label: 'CY', color: GREEN, shape: 'cross' } },
    { midi: 77, head: 'x', row: { id: 'Ride', label: 'RD', color: GREEN, shape: 'cross' } },
    { midi: 79, head: '+', row: { id: 'OpenHiHat', label: 'OH', color: GREEN, shape: 'plus' } },
    { midi: 79, head: 'x', row: { id: 'ClosedHiHat', label: 'CH', color: GREEN, shape: 'cross' } },
    { midi: 77, head: 'diamond', fill: 'void', row: { id: 'Tambourine', label: 'TB', color: GREEN, shape: 'diamond' } },
    { midi: 77, head: 'diamond', row: { id: 'Cowbell', label: 'CB', color: GREEN, shape: 'diamond' } },
    { midi: 76, row: { id: 'HighTom', label: 'HT', color: GREEN, shape: 'circle' } },
    { midi: 74, row: { id: 'MediumTom', label: 'MT', color: GREEN, shape: 'circle' } },
    { midi: 72, head: 'slash', row: { id: 'RimShot', label: 'RS', color: BLUE, shape: 'slash' } },
    { midi: 72, row: { id: 'SnareDrum', label: 'SD', color: BLUE, shape: 'circle' } },
    { midi: 64, head: 'x', row: { id: 'Clap', label: 'CP', color: GREEN, shape: 'cross' } },
    { midi: 69, row: { id: 'LowTom', label: 'LT', color: GREEN, shape: 'circle' } },
    { midi: 65, row: { id: 'BassDrum', label: 'BD', color: RED, shape: 'circle' } },
    { midi: 62, head: 'x', row: { id: 'HiHatFoot', label: 'HF', color: GREEN, shape: 'cross' } },
];

/** The row a written drum note belongs on: its place on the staff, its notehead and, for the f5 diamonds, its fill. */
export function gridRowFor(midi: number, head?: string, fill?: string): DrumGridRow | undefined {
    for (const r of ROWS) {
        if (r.midi !== midi) continue;
        if (r.head !== undefined ? r.head !== head : head !== undefined) continue;
        if (r.fill !== undefined && r.fill !== fill) continue;
        return r.row;
    }
    return undefined;
}

export interface DrumGridBar {
    start: number;
    end: number;
    /** Row id → the columns it is hit on. */
    hits: Map<string, Set<number>>;
}

export interface DrumGrid {
    columns: number;
    ticksPerColumn: number;
    /** Columns to a beat, for the grid's beat lines. */
    beatColumns: number;
    /** The rows the score uses, top to bottom. */
    rows: DrumGridRow[];
    /** The bars of the score, the count-in left out. */
    bars: DrumGridBar[];
    /** Short enough to loop (LOOP_MAX_BARS). */
    loops: boolean;
}

/**
 * The bars of a score, as the app plays it: every measure but the first,
 * which is the count-in the app puts before every score (utils/mei.ts).
 */
export function drumBars(tm: TimemapData): Array<{ start: number; end: number }> {
    const starts = [...new Set(tm.measureTicks.values())].sort((a, b) => a - b);
    const bars = starts.map((start, i) => ({ start, end: starts[i + 1] ?? tm.totalTicks })).filter(b => b.end > b.start);
    return bars.slice(1);
}

/** Does the app loop this score (a pattern), or play it through (a piece, a groove)? */
export function drumScoreLoops(tm: TimemapData): boolean {
    return drumBars(tm).length <= LOOP_MAX_BARS;
}

const near = (x: number, targets: number[]) => targets.some(t => Math.abs(x - t) <= 2);

export function buildDrumGrid(tm: TimemapData): DrumGrid {
    const meter = tm.meter ?? { count: 4, unit: 4 };
    const bars = drumBars(tm);
    const quarter = TONE_PPQ;

    // The steps: eighths in 12/8; triplet eighths when a 4/4 is played in
    // triplets more than in sixteenths; sixteenths otherwise.
    let ticksPerColumn = quarter / 4;
    let beatTicks = quarter * (meter.unit === 8 && meter.count % 3 === 0 ? 1.5 : 4 / meter.unit);
    if (meter.count === 12 && meter.unit === 8) {
        ticksPerColumn = quarter / 2;
    } else if (meter.count === 4 && meter.unit === 4) {
        let triplets = 0, sixteenths = 0, b = 0;
        for (const o of tm.onsets) {
            while (b < bars.length && o.tick >= bars[b].end) b++;
            const bar = bars[b];
            if (!bar || o.tick < bar.start) continue;
            const p = (o.tick - bar.start) % quarter;
            if (near(p, [quarter / 3, 2 * quarter / 3])) triplets++;
            else if (near(p, [quarter / 4, 3 * quarter / 4])) sixteenths++;
        }
        if (triplets > sixteenths) ticksPerColumn = quarter / 3;
    }
    beatTicks = Math.max(ticksPerColumn, beatTicks);

    // As many columns as the meter's bar holds, whatever a bar's own length: a
    // pickup or a short bar leaves its end empty, and a bar the chart overfills
    // shows what fits.
    const columns = Math.max(1, Math.round(meter.count * quarter * 4 / meter.unit / ticksPerColumn));

    const used = new Set<string>();
    const gridBars: DrumGridBar[] = bars.map(b => ({ ...b, hits: new Map() }));
    let k = 0;
    for (const o of tm.onsets) {
        while (k < gridBars.length && o.tick >= gridBars[k].end) k++;
        const bar = gridBars[k];
        if (!bar || o.tick < bar.start) continue;
        const col = Math.floor((o.tick - bar.start) / ticksPerColumn + 1e-6);
        if (col >= columns) continue;
        for (const n of o.notes) {
            const row = gridRowFor(n.midi, n.head, n.fill);
            if (!row) continue;
            used.add(row.id);
            (bar.hits.get(row.id) ?? bar.hits.set(row.id, new Set()).get(row.id)!).add(col);
        }
    }

    return {
        columns,
        ticksPerColumn,
        beatColumns: Math.max(1, Math.round(beatTicks / ticksPerColumn)),
        rows: ROWS.map(r => r.row).filter((r, i, all) => used.has(r.id) && all.findIndex(x => x.id === r.id) === i),
        bars: gridBars,
        loops: bars.length <= LOOP_MAX_BARS,
    };
}

export interface DrumGridView {
    /** The bar being played (an index into grid.bars), and the column the playhead is on — -1 before the music starts. */
    bar: number;
    column: number;
    /** For each column, the bar it shows — this one ahead of the playhead, the next behind it — or -1 for none. */
    barOf: number[];
}

/**
 * What the grid shows with the playhead at `tick`. `loop` is the transport's
 * loop range when one is set: the bar after its end is its first.
 */
export function drumGridView(grid: DrumGrid, tick: number, loop?: { start: number; end: number } | null): DrumGridView {
    const { bars, columns, ticksPerColumn } = grid;
    if (bars.length === 0) return { bar: -1, column: -1, barOf: Array(columns).fill(-1) };

    const barAt = (t: number) => {
        let lo = 0, hi = bars.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (bars[mid].start <= t) lo = mid; else hi = mid - 1;
        }
        return lo;
    };
    const next = (b: number) => {
        if (loop && (b + 1 >= bars.length || bars[b + 1].start >= loop.end)) return barAt(loop.start);
        if (b + 1 < bars.length) return b + 1;
        return grid.loops ? 0 : -1;
    };

    // In the count-in, the first bar waits whole.
    if (tick < bars[0].start) return { bar: 0, column: -1, barOf: Array(columns).fill(0) };
    const bar = barAt(tick);
    if (tick >= bars[bar].end) return { bar, column: columns, barOf: Array(columns).fill(bar) };
    const column = Math.min(columns - 1, Math.floor((tick - bars[bar].start) / ticksPerColumn));
    const after = next(bar);
    return { bar, column, barOf: Array.from({ length: columns }, (_, c) => (c < column ? after : bar)) };
}

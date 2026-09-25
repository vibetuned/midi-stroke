import type { TimemapData } from './timemap';

/** A measure on the page, and when it sounds. */
export interface PlacedMeasure {
    id: string;
    x: number;
    width: number;
    startTick: number;
    endTick: number;
}

/** A repeat's second time through: Verovio's copies of a measure are its id plus "-rend2" (or 3…). */
const COPY = /-rend\d+$/;

/**
 * The measures on the page, placed in time, for the scrolling score views.
 *
 * `played` is the music's order: the timemap's measures, sorted by tick, a
 * repeat's second time (Verovio's "-rend2" copies) placed on the page's
 * measures it repeats. It is for following the playhead, so at a repeat the
 * page jumps back, as a player's eye does. `written` is the page's order,
 * each measure at its first time through, for finding the time at a place
 * on the page (dragging the score).
 *
 * Each drawn measure used to run to the next drawn one's start tick. So the
 * bar before a repeat sign lasted the whole repeated section, and the page
 * crawled across that one bar while the repeat played.
 */
export function placeMeasures(
    drawn: Array<{ id: string; x: number; width: number }>,
    timemap: Pick<TimemapData, 'measureTicks' | 'totalTicks'>,
): { played: PlacedMeasure[]; written: PlacedMeasure[] } {
    const onPage = new Map(drawn.map(d => [d.id, d]));
    const entries = [...timemap.measureTicks.entries()].sort((a, b) => a[1] - b[1]);
    const played: PlacedMeasure[] = [];
    entries.forEach(([id, tick], i) => {
        const d = onPage.get(id.replace(COPY, ''));
        if (!d) return;
        const endTick = i + 1 < entries.length ? entries[i + 1][1] : timemap.totalTicks;
        played.push({ id: d.id, x: d.x, width: d.width, startTick: tick, endTick });
    });
    // Each drawn measure at its first time through. One the timemap lacks
    // takes the time before it and no length, as it did before.
    const first = new Map<string, PlacedMeasure>();
    for (const m of played) if (!first.has(m.id)) first.set(m.id, m);
    let running = 0;
    const written = drawn.map(d => {
        const m = first.get(d.id);
        if (m) { running = m.endTick; return m; }
        return { ...d, startTick: running, endTick: running };
    });
    return { played: played.length > 0 ? played : written, written };
}

/**
 * Reading the tempo a score declares, and turning it into playback time.
 *
 * The viewers drive time from the timemap's quarter-note positions and the
 * Tone transport's BPM, never from Verovio's own milliseconds — so a score's
 * tempo has to be read here and handed to the transport, or every piece plays
 * at whatever the slider happens to say.
 *
 * MEI can state a tempo four ways, and they are read in this order, because
 * the MIDI attributes describe the *performance* and the rest only the page:
 *
 *   1. `@midi.bpm`  — quarter notes per minute (MEI defines the MIDI beat as a
 *                     quarter, whatever the meter).
 *   2. `@midi.mspb` — microseconds per quarter note: the literal MIDI "set
 *                     tempo" value. 60 000 000 / mspb.
 *   3. `@mm`, `@mm.unit`, `@mm.dots` — a metronome mark in its own unit
 *                     (dotted quarter = 60 is 90 quarters per minute).
 *   4. the text of a `<tempo>`, when it spells a metronome mark (♩ = 132).
 *
 * They can sit on `<scoreDef>` (the opening tempo) or on `<tempo>` elements
 * inside measures (a change at that point).
 *
 * Verovio reads some of this and not the rest — it ignores `@midi.mspb`
 * entirely, reads a dotted `@mm.unit` as 4/3 of the unit rather than 3/2
 * (dotted quarter = 60 comes out at 80), and ignores tempo text — which is why
 * the values are derived here rather than taken from its timemap. Verovio
 * still supplies *where* things are: measure start ticks and note onsets.
 *
 * DOM Level 2 only (getElementsByTagName, parentNode), like utils/mei.ts, so
 * this runs against any XML DOM — the browser's, or xmldom in the checks.
 */

import { TONE_PPQ } from './timemap';

export type TempoSource = 'midi.bpm' | 'midi.mspb' | 'mm' | 'text';

export interface TempoMark {
    /** Transport tick where this tempo takes effect. */
    tick: number;
    /** Quarter notes per minute. */
    bpm: number;
    source: TempoSource;
    /** The tempo's printed text, when it has any ("Allegro", "♩ = 132"). */
    text?: string;
}

export interface TempoMap {
    /** The tempo the score opens at, or null when it states none. */
    initial: TempoMark | null;
    /** Every mark in score order, the opening one included. */
    marks: TempoMark[];
}

// --------------------------------------------------------------- the values

/** Quarter notes per minute from the tempo attributes of one element. */
export function tempoFromAttributes(
    el: Element,
    meterUnit = 4,
): { bpm: number; source: TempoSource } | null {
    const num = (name: string): number | null => {
        const raw = el.getAttribute(name);
        if (raw === null || raw.trim() === '') return null;
        const v = Number(raw);
        return Number.isFinite(v) && v > 0 ? v : null;
    };

    const bpm = num('midi.bpm');
    if (bpm !== null) return { bpm, source: 'midi.bpm' };

    const mspb = num('midi.mspb');
    if (mspb !== null) return { bpm: 60_000_000 / mspb, source: 'midi.mspb' };

    const mm = num('mm');
    if (mm !== null) {
        // The metronome unit defaults to the meter's beat, as MEI describes it.
        const unit = num('mm.unit') ?? meterUnit;
        const dots = Math.round(num('mm.dots') ?? 0);
        return { bpm: mm * (4 / unit) * dotFactor(dots), source: 'mm' };
    }
    return null;
}

/** A dotted value lasts 1.5×, double-dotted 1.75×… (2 − 2^−dots). */
function dotFactor(dots: number): number {
    return dots > 0 ? 2 - Math.pow(2, -dots) : 1;
}

// Note glyphs a metronome mark is written with: Unicode music symbols and the
// SMuFL metronome range (which engravers, Verovio included, emit in <rend>).
const GLYPH_UNIT: Record<string, number> = {
    '\u{1D15D}': 1, '': 1,                            // whole
    '\u{1D15E}': 2, '': 2, '': 2,                // half
    '♩': 4, '\u{1D15F}': 4, '': 4, '': 4,   // quarter
    '♪': 8, '\u{1D160}': 8, '': 8, '': 8,   // eighth
    '\u{1D161}': 16, '': 16, '': 16,             // sixteenth
};
const DOT_GLYPHS = new Set(['.', '', '\u{1D16D}']);

/**
 * A metronome mark spelled out in text — "♩ = 132", "Allegro (♩. = 60)".
 * Only a note glyph followed by "=" counts: a bare number is ambiguous about
 * its unit, and a tempo word ("Allegro") names a range, not a value.
 */
export function tempoFromText(text: string): number | null {
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
        const unit = GLYPH_UNIT[chars[i]];
        if (!unit) continue;
        let j = i + 1;
        let dots = 0;
        while (j < chars.length && (DOT_GLYPHS.has(chars[j]) || chars[j] === ' ')) {
            if (DOT_GLYPHS.has(chars[j])) dots++;
            j++;
        }
        const rest = chars.slice(j).join('');
        const m = /^\s*=\s*(?:c\.\s*|ca\.\s*|~\s*)?(\d+(?:[.,]\d+)?)/.exec(rest);
        if (!m) continue;
        const value = Number(m[1].replace(',', '.'));
        if (value > 0) return value * (4 / unit) * dotFactor(dots);
    }
    return null;
}

// -------------------------------------------------------------- the positions

function childText(el: Element): string {
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function ancestor(el: Node, name: string): Element | null {
    let n: Node | null = el.parentNode;
    while (n) {
        if (n.nodeType === 1 && (n as Element).localName === name) return n as Element;
        n = n.parentNode;
    }
    return null;
}

function meterUnitOf(doc: Document): number {
    const sd = doc.getElementsByTagName('scoreDef').item(0);
    const fromAttr = Number(sd?.getAttribute('meter.unit'));
    if (fromAttr > 0) return fromAttr;
    const sig = doc.getElementsByTagName('meterSig').item(0);
    const fromSig = Number(sig?.getAttribute('unit'));
    return fromSig > 0 ? fromSig : 4;
}

/**
 * Every tempo the score states, placed on the transport's tick grid.
 *
 * `measureTicks` and `noteTicks` come from Verovio's timemap for the same
 * loaded document. Measures are matched by xml:id where they have one and by
 * order otherwise (a count-in measure the viewer injected has no id, and
 * neither do measures in some hand-written files).
 */
export function readTempoMap(
    doc: Document,
    measureTicks: Map<string, number>,
    noteTicks: Map<string, number>,
): TempoMap {
    const meterUnit = meterUnitOf(doc);
    const marks: TempoMark[] = [];

    // The opening tempo: the first scoreDef, else a staffDef under it.
    const scoreDef = doc.getElementsByTagName('scoreDef').item(0);
    if (scoreDef) {
        let found = tempoFromAttributes(scoreDef, meterUnit);
        if (!found) {
            const sd = scoreDef.getElementsByTagName('staffDef');
            for (let i = 0; i < sd.length && !found; i++) found = tempoFromAttributes(sd.item(i)!, meterUnit);
        }
        if (found) marks.push({ tick: 0, ...found });
    }

    // Measure element → start tick, by id first and by document order second.
    const domMeasures = doc.getElementsByTagName('measure');
    const ordered = [...measureTicks.values()];
    const measureStart = (m: Element): number | null => {
        const id = m.getAttribute('xml:id');
        if (id && measureTicks.has(id)) return measureTicks.get(id)!;
        if (domMeasures.length === ordered.length) {
            for (let i = 0; i < domMeasures.length; i++) {
                if (domMeasures.item(i) === m) return ordered[i];
            }
        }
        return null;
    };

    const tempos = doc.getElementsByTagName('tempo');
    const ticksPerBeat = TONE_PPQ * 4 / meterUnit;
    for (let i = 0; i < tempos.length; i++) {
        const el = tempos.item(i)!;
        const text = childText(el);
        const value = tempoFromAttributes(el, meterUnit)
            ?? (() => { const b = tempoFromText(text); return b ? { bpm: b, source: 'text' as const } : null; })();
        if (!value) continue; // "Allegro" alone: no number to follow

        // Where it applies: the note it is attached to, else its beat in the
        // measure, else the measure's start.
        let tick: number | null = null;
        const start = el.getAttribute('startid')?.replace(/^#/, '');
        if (start && noteTicks.has(start)) tick = noteTicks.get(start)!;
        if (tick === null) {
            const measure = ancestor(el, 'measure');
            const base = measure ? measureStart(measure) : null;
            if (base !== null) {
                const tstamp = Number(el.getAttribute('tstamp'));
                tick = base + (tstamp > 0 ? Math.round((tstamp - 1) * ticksPerBeat) : 0);
            }
        }
        if (tick === null) continue;
        marks.push({ tick, ...value, text: text || undefined });
    }

    // Score order, and a mark that repeats the tempo already in force is not a change.
    marks.sort((a, b) => a.tick - b.tick);
    const deduped: TempoMark[] = [];
    for (const m of marks) {
        const prev = deduped[deduped.length - 1];
        if (prev && prev.tick === m.tick) { deduped[deduped.length - 1] = m; continue; }
        if (prev && Math.abs(prev.bpm - m.bpm) < 1e-6) continue;
        deduped.push(m);
    }
    return { initial: deduped[0] ?? null, marks: deduped };
}

// ------------------------------------------------------------- using the map

/** The score's own tempo at a tick; the first mark covers any lead-in. */
export function tempoAt(map: TempoMap | null | undefined, tick: number): number | null {
    if (!map || map.marks.length === 0) return null;
    let bpm = map.marks[0].bpm;
    for (const m of map.marks) {
        if (m.tick > tick) break;
        bpm = m.bpm;
    }
    return bpm;
}

/**
 * The transport BPM at a tick, given the slider. The slider sets the opening
 * tempo; every later section keeps its proportion to it, so slowing a piece to
 * half speed slows its faster middle section to half speed too.
 */
export function effectiveBpm(map: TempoMap | null | undefined, tick: number, sliderBpm: number): number {
    const at = tempoAt(map, tick);
    if (at === null || !map?.initial) return sliderBpm;
    return at * (sliderBpm / map.initial.bpm);
}

/** Seconds from tick 0 to `tick`, honouring every tempo change on the way. */
export function ticksToSeconds(map: TempoMap | null | undefined, tick: number, sliderBpm: number): number {
    if (!map || map.marks.length < 2) return tick * 60 / (effectiveBpm(map, 0, sliderBpm) * TONE_PPQ);
    let seconds = 0;
    let from = 0;
    for (let i = 0; i < map.marks.length; i++) {
        const segEnd = i + 1 < map.marks.length ? map.marks[i + 1].tick : Infinity;
        const bpm = effectiveBpm(map, Math.max(from, map.marks[i].tick), sliderBpm);
        const to = Math.min(tick, segEnd);
        if (to > from) seconds += (to - from) * 60 / (bpm * TONE_PPQ);
        from = Math.max(from, segEnd);
        if (from >= tick) break;
    }
    return seconds;
}

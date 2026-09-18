/**
 * The MEI writing layer shared by the generated exercises: the piano scale
 * generator (scaleGen.ts) and the saxophone jazz generator (jazzScaleGen.ts).
 *
 * Everything here is about *notation*, not music: laying a stream of events
 * out into 4/4 measures, choosing displayable durations, beaming, tuplets,
 * and — the part that is easy to get wrong — accidentals.
 *
 * Accidental policy (layer 4 of docs/saxo-scales.md):
 *  - a glyph is drawn only when the note differs from what the reader
 *    currently assumes (key signature, or an earlier accidental in the same
 *    measure), and the state is per measure, so chromatics reset cleanly at
 *    every barline instead of piling up;
 *  - an alteration that is *heard* but not drawn (it comes from the key
 *    signature, or from an accidental earlier in the measure) is written as
 *    @accid.ges, because Verovio's MIDI export resolves neither the key
 *    signature nor carried accidentals — only per-note accidentals. Without
 *    this the engraving and the playback/hit-detection would disagree.
 *
 * Ticks: 12 per quarter (LCM of sixteenths and triplet eighths), 48 per 4/4
 * measure.
 */

import { keyAlter } from './musicxml';

export interface Pitch { step: string; alter: number; oct: number }

export type Rhythm = 'quarters' | 'eighths' | '16ths' | 'triplets';

export const MEASURE_TICKS = 48;
export const UNIT_TICKS: Record<Rhythm, number> = { quarters: 12, eighths: 6, '16ths': 3, triplets: 4 };

const ACCID: Record<number, string> = { [-2]: 'ff', [-1]: 'f', 0: 'n', 1: 's', 2: 'x' };
// Gestural accidentals use a different vocabulary: double sharp is "ss", not "x".
const ACCID_GES: Record<number, string> = { [-2]: 'ff', [-1]: 'f', 0: 'n', 1: 's', 2: 'ss' };

/**
 * One musical event: a note (one pitch) or a chord (several). `data` is the
 * generator's own payload — piano fingerings, sax articulation — carried
 * through the layout untouched.
 */
export interface Ev<T> { pitches: Pitch[]; data: T }

export interface NoteItem<T> {
    id: string;
    pitches: Pitch[];          // 1 = note, >1 = chord
    dur: number;               // MEI dur value (1, 2, 4, 8, 16)
    dots: number;
    tie: '' | 'i' | 'm' | 't';
    inTuplet: boolean;
    data: T;
    /** First (or only) item of its event — the one that carries control events. */
    first: boolean;
    /** Extra attributes for the note/chord element, e.g. ` artic="acc"`. */
    attrs: string;
}

export interface Beat<T> { items: NoteItem<T>[]; tuplet: boolean }

/** Chop a beat-aligned tick length into displayable durations (largest first). */
export function plainDurs(ticks: number, atMeasureStart: boolean): Array<{ dur: number; dots: number }> {
    const out: Array<{ dur: number; dots: number }> = [];
    let left = ticks;
    if (atMeasureStart && left === 48) return [{ dur: 1, dots: 0 }];
    for (const [t, dur, dots] of [[36, 2, 1], [24, 2, 0], [12, 4, 0], [9, 8, 1], [6, 8, 0], [3, 16, 0]] as const) {
        while (left >= t) { out.push({ dur, dots }); left -= t; }
    }
    return out;
}

/**
 * Lay a run of events out into measures of four beats. All events are one
 * rhythm unit long except the last, which is stretched (with ties where
 * needed) to close exactly on a barline.
 */
export function layoutRun<T>(events: Array<Ev<T>>, rhythm: Rhythm, nextId: () => string): Array<Array<Beat<T>>> {
    const unit = UNIT_TICKS[rhythm];
    const runTicks = (events.length - 1) * unit;
    const finalTicks = MEASURE_TICKS - (runTicks % MEASURE_TICKS) || MEASURE_TICKS;
    const isTriplet = rhythm === 'triplets';
    const unitDur = rhythm === 'quarters' ? 4 : rhythm === '16ths' ? 16 : 8;

    const measures: Array<Array<Beat<T>>> = [];
    const beatAt = (pos: number): Beat<T> => {
        const m = Math.floor(pos / MEASURE_TICKS);
        const b = Math.floor((pos % MEASURE_TICKS) / 12);
        while (measures.length <= m) measures.push([]);
        const measure = measures[m];
        while (measure.length <= b) measure.push({ items: [], tuplet: false });
        return measure[b];
    };

    let pos = 0;
    events.forEach((ev, i) => {
        const isFinal = i === events.length - 1;
        if (!isFinal) {
            const beat = beatAt(pos);
            beat.tuplet ||= isTriplet;
            beat.items.push({
                id: nextId(), pitches: ev.pitches, dur: unitDur, dots: 0,
                tie: '', inTuplet: isTriplet, data: ev.data, first: true, attrs: '',
            });
            pos += unit;
            return;
        }
        // Final note: fill the open beat first (inside the tuplet for
        // triplets), then plain tied values to the barline.
        const chunks: Array<{ dur: number; dots: number; tuplet: boolean }> = [];
        const inBeat = pos % 12;
        if (inBeat !== 0) {
            const fill = 12 - inBeat;
            if (isTriplet) {
                chunks.push({ dur: fill === 4 ? 8 : 4, dots: 0, tuplet: true });
            } else {
                plainDurs(fill, false).forEach(d => chunks.push({ ...d, tuplet: false }));
            }
        }
        const rest = finalTicks - (inBeat === 0 ? 0 : 12 - inBeat);
        plainDurs(rest, (pos + (inBeat ? 12 - inBeat : 0)) % MEASURE_TICKS === 0)
            .forEach(d => chunks.push({ ...d, tuplet: false }));
        chunks.forEach((c, k) => {
            const beat = beatAt(pos);
            beat.tuplet ||= c.tuplet;
            beat.items.push({
                id: nextId(), pitches: ev.pitches, dur: c.dur, dots: c.dots,
                tie: chunks.length === 1 ? '' : k === 0 ? 'i' : k === chunks.length - 1 ? 't' : 'm',
                inTuplet: c.tuplet, data: ev.data, first: k === 0, attrs: '',
            });
            const ticks = c.tuplet
                ? (c.dur === 8 ? 4 : 8)
                : [0, 48, 24, 0, 12, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 3][c.dur] * (c.dots ? 1.5 : 1);
            pos += ticks;
        });
    });
    return measures;
}

/** Fresh per-measure accidental state (step+octave -> sounding alteration). */
export function newAccidState(): Map<string, number> {
    return new Map<string, number>();
}

export function xmlNote(p: Pitch, attrs: string, accidState: Map<string, number>, fifths: number): string {
    const key = `${p.step}${p.oct}`;
    const inKey = keyAlter(p.step, fifths);
    const current = accidState.get(key) ?? inKey;
    let accid = '';
    if (p.alter !== current) {
        // Needs a drawn accidental (differs from the signature / an earlier
        // accidental in this measure); @accid is gestural too.
        accid = ` accid="${ACCID[p.alter]}"`;
        accidState.set(key, p.alter);
    } else if (p.alter !== 0) {
        // Sounding alteration with no glyph (key signature or a carried
        // in-measure accidental). Verovio's MIDI export resolves neither —
        // it only honors per-note accidentals — so make it gestural
        // explicitly, exactly like Verovio's own MusicXML→MEI transcodes do.
        accid = ` accid.ges="${ACCID_GES[p.alter]}"`;
    }
    return `<note ${attrs} pname="${p.step.toLowerCase()}" oct="${p.oct}"${accid} />`;
}

export function serializeItem<T>(it: NoteItem<T>, accidState: Map<string, number>, fifths: number): string {
    const durAttrs = `dur="${it.dur}"${it.dots ? ` dots="${it.dots}"` : ''}${it.tie ? ` tie="${it.tie}"` : ''}`;
    if (it.pitches.length > 1) {
        const notes = it.pitches
            .map((p, i) => xmlNote(p, `xml:id="${it.id}-${i}"`, accidState, fifths))
            .join('');
        return `<chord xml:id="${it.id}" ${durAttrs}${it.attrs}>${notes}</chord>`;
    }
    return xmlNote(it.pitches[0], `xml:id="${it.id}" ${durAttrs}${it.attrs}`, accidState, fifths);
}

export function serializeBeat<T>(beat: Beat<T>, accidState: Map<string, number>, fifths: number): string {
    let inner = beat.items.map(it => serializeItem(it, accidState, fifths)).join('');
    const beamable = beat.items.length > 1 && beat.items.every(it => it.dur >= 8);
    if (beamable) inner = `<beam>${inner}</beam>`;
    if (beat.tuplet) inner = `<tuplet num="3" numbase="2">${inner}</tuplet>`;
    return inner;
}

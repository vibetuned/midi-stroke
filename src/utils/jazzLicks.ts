/**
 * Jazz licks: the Jazzomat Research Project's 653 interval patterns, as
 * practice material for the saxophone (and, in the library, the piano).
 *
 * The patterns are the most common interval patterns of eminent players in
 * the Weimar Jazz Database — at least six intervals, used by one player in at
 * least three of their solos (Frieler, Höger, Pfleiderer & Dixon, ISMIR
 * 2018). They are bare intervals; scripts/build-jazz-licks.py found every
 * instance of each in the database's solos and gave each lick how it is
 * usually played — its most common rhythm and where in the bar it starts —
 * and what over: the chord under its first note (the note's place in it) and
 * a change during the lick, a ii–V, say. That data is public/jazz/
 * jazzomat-licks.json (ODbL, credited in public/jazz/CREDITS.md).
 *
 * A LickSpec picks a lick, a key (the root of the chord it is played over,
 * in concert or written pitch), the horn, the rhythm — as played, or plain
 * quarters, eighths, triplets or sixteenths — whether the chord symbols are
 * written, and one key or all twelve round the circle of fourths. It is
 * encoded as a `lick:` song URL, a stable stats key, and turned into MEI on
 * demand (loadSongText): one treble staff in written pitch, fitted by whole
 * octaves into the horn's keyed range; no key signature, since the keys
 * change; notes spelled by the chord's scale, chromatic notes as sharps going
 * up and flats coming down. The library's lick scores (scripts/build-jazz-
 * lick-scores.mjs) use the same generator, with a piano version: the lick in
 * the right hand at concert pitch, the chords as shells (root, third,
 * seventh) in the left.
 */

import { newAccidState, xmlNote, type Pitch } from './meiNotation';
import {
    HORNS, WRITTEN_HIGH, WRITTEN_LOW,
    letterAt, parseRoot, rootPc, rootPretty, rootText, simplifyRoot, spellAs, toConcert, toWritten,
    type HornId, type JazzRoot,
} from './jazzScaleGen';

// ------------------------------------------------------------------ the data

export interface Lick {
    rank: number;
    /** Semitones, note to note. */
    intervals: number[];
    /** Instances the Pattern History Explorer lists, and in how many solos. */
    instances: number;
    solos: number;
    players: Array<[string, number]>;
    styles: string[];
    first: { player: string; year: number } | null;
    type: 'chromatic' | 'scale' | 'arpeggio' | 'mixed';
    contour: 'ascending' | 'descending' | 'arch' | 'valley' | 'wave';
    /** Onsets in beats from the first note ("1/2"), its place in a 4/4 bar, how often it is played exactly so. */
    rhythm: { start: string; onsets: string[]; share: number } | null;
    /** The first note above the root of the chord under it; chords as [whole beats from the first note's beat, the note it arrives at, root above the first chord's root, quality]. */
    harmony: { start: number; chords: Array<[number, number, number, string]>; share: number } | null;
}

let licksPromise: Promise<Lick[]> | null = null;

/** The licks, fetched once (public/jazz/jazzomat-licks.json). */
export function loadLicks(): Promise<Lick[]> {
    licksPromise ??= fetch(`${import.meta.env.BASE_URL}jazz/jazzomat-licks.json`)
        .then(r => { if (!r.ok) throw new Error('Could not load the licks'); return r.json(); })
        .then((doc: { licks: Lick[] }) => doc.licks)
        .catch(e => { licksPromise = null; throw e; });
    return licksPromise;
}

// ------------------------------------------------------------------ the spec

export type LickRhythm = 'played' | 'quarters' | 'eighths' | 'triplets' | '16ths';
export type LickKeys = 'one' | 'circle';
/** The piano's left hand: the chords held as shells, or broken in eighths up 1-5-7-10. */
export type LickLeft = 'shells' | 'arpeggio';

export interface LickSpec {
    rank: number;
    /** The root of the chord the lick is played over, in `domain` pitch. */
    root: string;
    domain: 'concert' | 'written';
    rhythm: LickRhythm;
    keys: LickKeys;
    /** A saxophone, written in its pitch — or the piano, at concert pitch on a grand staff. */
    horn: HornId | 'piano';
    /** Write the chord symbols above the staff. */
    chords: boolean;
    /** The piano's left hand (shells when not given). */
    left?: LickLeft;
}

export const LICK_RHYTHMS: Array<{ value: LickRhythm; label: string }> = [
    { value: 'played', label: 'As played' },
    { value: 'quarters', label: 'Quarters' },
    { value: 'eighths', label: 'Eighths' },
    { value: 'triplets', label: 'Triplets' },
    { value: '16ths', label: 'Sixteenths' },
];

const ROOT_RE = /^[A-G](#|b)?$/;
const RHYTHM_IDS = LICK_RHYTHMS.map(r => r.value);

export function buildLickUrl(spec: LickSpec): string {
    const left = spec.horn === 'piano' ? `l${spec.left === 'arpeggio' ? 'a' : 's'}` : '';
    return `lick:${spec.rank}-${spec.root}-${spec.rhythm}-${spec.keys}-${spec.horn}-c${spec.chords ? 1 : 0}w${spec.domain === 'written' ? 1 : 0}${left}`;
}

export function parseLickUrl(url: string): LickSpec | null {
    if (!url.startsWith('lick:')) return null;
    const parts = url.slice('lick:'.length).split('-');
    if (parts.length !== 6) return null;
    const [rank, root, rhythm, keys, horn, flags] = parts;
    const f = /^c([01])w([01])(?:l([sa]))?$/.exec(flags);
    const piano = horn === 'piano';
    if (!/^\d+$/.test(rank) || !ROOT_RE.test(root) || !RHYTHM_IDS.includes(rhythm as LickRhythm)
        || (keys !== 'one' && keys !== 'circle') || !(piano || HORNS.some(h => h.id === horn)) || !f || piano !== !!f[3]) return null;
    return {
        rank: parseInt(rank, 10), root, rhythm: rhythm as LickRhythm, keys: keys as LickKeys, horn: horn as HornId | 'piano',
        chords: f[1] === '1', domain: f[2] === '1' ? 'written' : 'concert',
        ...(piano && { left: f[3] === 'a' ? 'arpeggio' as const : 'shells' as const }),
    };
}

export function defaultLickSpec(): LickSpec {
    return { rank: 1, root: 'C', domain: 'concert', rhythm: 'played', keys: 'one', horn: 'alto', chords: true };
}

/** The piano's: concert pitch, the chords as shells in the left hand. */
export function defaultPianoLickSpec(): LickSpec {
    return { ...defaultLickSpec(), horn: 'piano', left: 'shells' };
}

/** A name for a lick: URL, or null if it isn't one — for the song navigator. */
export function describeLickUrl(url: string): string | null {
    const spec = parseLickUrl(url);
    if (!spec) return null;
    const rhythm = LICK_RHYTHMS.find(r => r.value === spec.rhythm)?.label.toLowerCase() ?? spec.rhythm;
    const keys = spec.keys === 'circle' ? ' · round the circle' : '';
    if (spec.horn === 'piano') {
        return `Jazz lick #${spec.rank} · ${rootPretty(parseRoot(spec.root))} · ${rhythm}${keys} · left hand ${spec.left === 'arpeggio' ? 'arpeggios' : 'shells'}`;
    }
    const horn = HORNS.find(h => h.id === spec.horn) ?? HORNS[0];
    return `Jazz lick #${spec.rank} · ${rootPretty(parseRoot(spec.root))} ${spec.domain} · ${rhythm}${keys} · ${horn.label.split(' ')[0]}`;
}

// ------------------------------------------------------------------ harmony and spelling

/** Parse "3/2" → 1.5. */
const beats = (s: string): number => {
    const [n, d] = s.split('/').map(Number);
    return d ? n / d : n;
};

type Family = 'dominant' | 'minor' | 'melodicminor' | 'major' | 'halfdim' | 'dim' | 'aug';

function familyOf(quality: string): Family {
    if (quality.startsWith('mMaj')) return 'melodicminor';
    if (quality.startsWith('m7b5')) return 'halfdim';
    if (quality.startsWith('m')) return 'minor';
    if (quality.startsWith('dim')) return 'dim';
    if (quality.startsWith('+')) return 'aug';
    if (quality.startsWith('maj') || quality === '' || quality.startsWith('6')) return 'major';
    return 'dominant';
}

/** Each family's scale, degrees 1–7 in semitones above the root: what the lick's notes are spelled as. */
const SCALES: Record<Family, number[]> = {
    dominant: [0, 2, 4, 5, 7, 9, 10],      // mixolydian
    minor: [0, 2, 3, 5, 7, 9, 10],         // dorian
    melodicminor: [0, 2, 3, 5, 7, 9, 11],
    major: [0, 2, 4, 5, 7, 9, 11],         // ionian
    halfdim: [0, 1, 3, 5, 6, 8, 10],       // locrian
    dim: [0, 2, 3, 5, 6, 8, 9],
    aug: [0, 2, 4, 6, 8, 9, 10],
};

/** A chord's third, fifth and seventh (a sixth for a 6th chord), in semitones above its root: what the piano's left hand plays. */
function chordTones(quality: string, family: Family): { third: number; fifth: number; seventh: number } {
    const third = family === 'minor' || family === 'melodicminor' || family === 'halfdim' || family === 'dim' ? 3 : 4;
    const fifth = family === 'halfdim' || family === 'dim' ? 6 : family === 'aug' ? 8 : 7;
    const sixth = /^m?6/.test(quality);
    const seventh = sixth || family === 'dim' ? 9 : family === 'major' || family === 'melodicminor' ? 11 : 10;
    return { third, fifth, seventh };
}

/** Letters for a root a number of semitones above another (a fourth is three letters up; a tritone, a flat fifth). */
const INTERVAL_LETTERS = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

function rootAbove(root: JazzRoot, semitones: number): JazzRoot {
    const s = ((semitones % 12) + 12) % 12;
    const letter = letterAt(root.letter, INTERVAL_LETTERS[s]);
    const alter = ((rootPc(root) + s - rootPc({ letter, alter: 0 }) + 18) % 12) - 6;
    return simplifyRoot({ letter, alter });
}

/**
 * A note spelled for the chord under it: its scale's letter; or, chromatic, the neighbour degree's
 * letter that needs no accidental (B♮ between C and B♭ over C7, not C♭), else sharp going up and
 * flat coming down.
 */
function spell(midi: number, root: JazzRoot, family: Family, direction: number): Pitch {
    const scale = SCALES[family];
    const rel = ((midi - rootPc(root)) % 12 + 12) % 12;
    const degree = scale.indexOf(rel);
    let p: Pitch;
    if (degree >= 0) {
        p = spellAs(midi, letterAt(root.letter, degree));
    } else {
        const below = scale.indexOf((rel + 11) % 12), above = scale.indexOf((rel + 1) % 12);
        const raised = below >= 0 ? spellAs(midi, letterAt(root.letter, below)) : null;
        const lowered = above >= 0 ? spellAs(midi, letterAt(root.letter, above)) : null;
        const plain = [raised, lowered].find(q => q && q.alter === 0);
        p = plain ?? (direction >= 0 ? raised ?? lowered : lowered ?? raised)!;
    }
    if (Math.abs(p.alter) <= 1 && !isOdd(p)) return p;
    // A double accidental, or C♭ and the like: the plainer name.
    const flats = direction < 0;
    const names = [...'CDEFGAB'].map(letter => spellAs(midi, letter));
    return names.find(q => q.alter === 0) ?? names.find(q => (flats ? q.alter === -1 : q.alter === 1) && !isOdd(q)) ?? p;
}

/** C♭, F♭, E♯, B♯: spelled so only when nothing plainer will do. */
const isOdd = (p: Pitch) => (p.alter === -1 && (p.step === 'C' || p.step === 'F')) || (p.alter === 1 && (p.step === 'E' || p.step === 'B'));

/** Twelve keys round the circle of fourths, from `root`. */
function circleFrom(root: JazzRoot): JazzRoot[] {
    return Array.from({ length: 12 }, (_, k) => rootAbove(root, 5 * k));
}

// ------------------------------------------------------------------ one lick in one key

const TICKS = 12;
const BAR = 48;

/** The lick's notes, in beats: where each starts (from the segment's first bar line). */
function timing(lick: Lick, rhythm: LickRhythm): number[] {
    const n = lick.intervals.length + 1;
    if (rhythm === 'played' && lick.rhythm) {
        const start = beats(lick.rhythm.start);
        return lick.rhythm.onsets.map(o => start + beats(o));
    }
    const unit = rhythm === 'quarters' ? 1 : rhythm === 'triplets' ? 1 / 3 : rhythm === '16ths' ? 1 / 4 : 1 / 2;
    return Array.from({ length: n }, (_, k) => k * unit);
}

/** Whole octaves to move a line by so it sits in [low, high], nearest the middle. */
function octaveFit(pitches: number[], low: number, high: number): number {
    const mid = (low + high) / 2;
    const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    let best = 0, bestCost = Infinity;
    for (let k = -4; k <= 4; k++) {
        const out = pitches.filter(p => p + 12 * k < low || p + 12 * k > high).length;
        const cost = out * 1000 + Math.abs(mean + 12 * k - mid);
        if (cost < bestCost) { bestCost = cost; best = k; }
    }
    return 12 * best;
}

interface Segment {
    notes: Array<{ at: number; midi: number; pitch: Pitch }>;
    chords: Array<{ at: number; text: string; root: JazzRoot; family: Family; quality: string }>;
    /** Bars it takes. */
    bars: number;
}

/**
 * The lick over a chord on `root`, placed in bars: its notes (in `low`–`high`,
 * spelled), its chords with where they fall, and how many bars it needs.
 */
function segment(lick: Lick, root: JazzRoot, rhythm: LickRhythm, low: number, high: number): Segment {
    const startDegree = lick.harmony?.start ?? 0;
    const chordsRel: Array<[number, number, number, string]> = lick.harmony?.chords ?? [[0, 0, 0, 'maj7']];
    const onsets = timing(lick, rhythm);
    const lastTick = Math.round(onsets[onsets.length - 1] * TICKS);
    // The chords: the first from the first bar line; a change on its beat as played (never after the
    // last note), or — in even notes — with the note it arrives at.
    const chords = chordsRel.map(([beatOffset, note, rel, quality], k) => {
        const r = rootAbove(root, rel);
        const onBeat = (Math.floor(onsets[0]) + beatOffset) * TICKS;
        const at = k === 0 ? 0 : rhythm === 'played' && lick.rhythm && onBeat <= lastTick ? onBeat : Math.round(onsets[note] * TICKS);
        return { at, text: `${rootText(r)}${quality}`, root: r, family: familyOf(quality), quality };
    }).filter((c, k, all) => k + 1 === all.length || c.at < all[k + 1].at);   // two changes on one note: the later is in effect
    // The pitches: the first note above the chord root, then the intervals; fitted to the range.
    const first = 60 + ((rootPc(root) + startDegree) % 12);
    const raw = [first];
    for (const iv of lick.intervals) raw.push(raw[raw.length - 1] + iv);
    const shift = octaveFit(raw, low, high);
    const pitches = raw.map(p => {
        let q = p + shift;
        while (q < low) q += 12;
        while (q > high) q -= 12;
        return q;
    });
    const chordAt = (tick: number) => [...chords].reverse().find(c => c.at <= tick) ?? chords[0];
    const notes = pitches.map((midi, k) => {
        const at = Math.round(onsets[k] * TICKS);
        const c = chordAt(at);
        const direction = k + 1 < pitches.length ? pitches[k + 1] - midi : midi - pitches[k - 1];
        return { at, midi, pitch: spell(midi, c.root, c.family, direction) };
    });
    const lastAt = notes[notes.length - 1].at;
    // The last note holds to its bar line (a beat at least).
    const bars = Math.max(1, Math.ceil((lastAt + TICKS) / BAR));
    return { notes, chords, bars };
}

// ------------------------------------------------------------------ layout: ticks → beats → MEI

interface Ev { start: number; end: number; pitches: Pitch[] }

/** A beat's notes and rests, each a value on the beat's grid. */
interface Item { pitches: Pitch[]; dur: number; dots: number; tie: '' | 'i' | 'm' | 't'; tuplet: boolean }

const IN_BEAT: Record<number, { dur: number; dots: number } | undefined> = {
    3: { dur: 16, dots: 0 }, 6: { dur: 8, dots: 0 }, 9: { dur: 8, dots: 1 }, 12: { dur: 4, dots: 0 },
};
const IN_TRIPLET: Record<number, { dur: number; dots: number } | undefined> = { 4: { dur: 8, dots: 0 }, 8: { dur: 4, dots: 0 } };

/**
 * Lay a line of events (contiguous, bar-aligned, rests as no pitches) out bar
 * by bar and beat by beat: each piece a plain value on its beat's grid,
 * triplet beats as tuplets, whole beats of one note merged into halves and
 * wholes where they start on a strong beat, notes tied across beats.
 */
function layout(events: Ev[], bars: number): Array<Array<{ items: Item[]; triplet: boolean }>> {
    const out: Array<Array<{ items: Item[]; triplet: boolean }>> = [];
    for (let m = 0; m < bars; m++) {
        const measure: Array<{ items: Item[]; triplet: boolean }> = [];
        let beat = 0;
        while (beat < 4) {
            const b0 = m * BAR + beat * TICKS, b1 = b0 + TICKS;
            const inside = events.filter(e => e.end > b0 && e.start < b1);
            // Whole beats of one event, from a strong beat: a half (from beats 1 and 3), dotted half (1, 2), whole (1).
            const only = inside.length === 1 ? inside[0] : null;
            if (only && only.start <= b0) {
                let whole = 0;
                while (beat + whole < 4 && only.end >= m * BAR + (beat + whole + 1) * TICKS) whole++;
                const span = whole === 4 && beat === 0 ? 4 : whole >= 3 && beat <= 1 ? 3 : whole >= 2 && (beat === 0 || beat === 2) ? 2 : 1;
                if (whole >= 1) {
                    const dur = span === 4 ? { dur: 1, dots: 0 } : span === 3 ? { dur: 2, dots: 1 } : span === 2 ? { dur: 2, dots: 0 } : { dur: 4, dots: 0 };
                    measure.push({ items: [piece(only, b0, b0 + span * TICKS, dur, false)], triplet: false });
                    beat += span;
                    continue;
                }
            }
            const cuts = new Set<number>([b0, b1]);
            for (const e of inside) { if (e.start > b0) cuts.add(e.start); if (e.end < b1) cuts.add(e.end); }
            const points = [...cuts].sort((a, b) => a - b);
            const triplet = points.some(p => (p - b0) % 4 === 0 && (p - b0) % 3 !== 0);
            const items: Item[] = [];
            for (let k = 0; k + 1 < points.length; k++) {
                const a = points[k], z = points[k + 1];
                const e = inside.find(x => x.start <= a && x.end >= z)!;
                const len = z - a;
                const value = triplet ? IN_TRIPLET[len] ?? (len === 12 ? { dur: 4, dots: 0 } : undefined) : IN_BEAT[len];
                if (!value) throw new Error(`No note value for ${len} ticks${triplet ? ' in a triplet' : ''}`);
                items.push(piece(e, a, z, value, triplet && len !== 12));
            }
            measure.push({ items, triplet });
            beat += 1;
        }
        out.push(measure);
    }
    return out;
}

function piece(e: Ev, a: number, z: number, value: { dur: number; dots: number }, tuplet: boolean): Item {
    const starts = e.start === a, ends = e.end === z;
    const tie: Item['tie'] = e.pitches.length === 0 || (starts && ends) ? '' : starts ? 'i' : ends ? 't' : 'm';
    return { pitches: e.pitches, dur: value.dur, dots: value.dots, tie, tuplet };
}

/** A line's MEI, measure by measure: `extra[m]` goes after the staff (chord symbols). */
function serialize(measures: ReturnType<typeof layout>, staff: number, nextId: () => string): string[] {
    return measures.map(beatsOf => {
        const accid = newAccidState();
        return beatsOf.map(b => {
            const inner = b.items.map(it => {
                const attrs = `dur="${it.dur}"${it.dots ? ` dots="${it.dots}"` : ''}${it.tie ? ` tie="${it.tie}"` : ''}`;
                if (it.pitches.length === 0) return `<rest xml:id="${nextId()}" ${attrs} />`;
                if (it.pitches.length === 1) return xmlNote(it.pitches[0], `xml:id="${nextId()}" ${attrs}`, accid, 0);
                const id = nextId();
                return `<chord xml:id="${id}" ${attrs}>${it.pitches.map((p, k) => xmlNote(p, `xml:id="${id}-${k}"`, accid, 0)).join('')}</chord>`;
            }).join('');
            const beamable = b.items.length > 1 && b.items.every(it => it.dur >= 8) && b.items.some(it => it.pitches.length);
            const beamed = beamable ? `<beam>${inner}</beam>` : inner;
            return b.triplet ? `<tuplet num="3" numbase="2">${beamed}</tuplet>` : beamed;
        }).join('');
    }).map(inner => `<staff n="${staff}"><layer n="1">${inner}</layer></staff>`);
}

/** Contiguous events from placed notes: each lasts to the next, the last to `end`; rests before the first. */
function lineEvents(notes: Array<{ at: number; pitches: Pitch[] }>, from: number, end: number): Ev[] {
    const out: Ev[] = [];
    if (notes.length === 0) return [{ start: from, end, pitches: [] }];
    if (notes[0].at > from) out.push({ start: from, end: notes[0].at, pitches: [] });
    notes.forEach((n, k) => out.push({ start: n.at, end: k + 1 < notes.length ? notes[k + 1].at : end, pitches: n.pitches }));
    return out;
}

// ------------------------------------------------------------------ the document

export interface LickScoreOptions {
    /** The piano version, whatever the spec's horn: the lick at concert pitch in the right hand, the chords in the left. */
    piano?: boolean;
}

/** The keys of a spec, in the pitch the staff is written in, and the concert first key. */
export function lickKeys(spec: LickSpec, piano = spec.horn === 'piano'): { written: JazzRoot[]; concert: JazzRoot } {
    const horn = HORNS.find(h => h.id === spec.horn) ?? HORNS[0];
    const given = parseRoot(spec.root);
    const concert = spec.domain === 'concert' || spec.horn === 'piano' ? given : toConcert(given, horn);
    const first = piano ? concert : simplifyRoot(spec.domain === 'written' ? given : toWritten(given, horn));
    return { written: spec.keys === 'circle' ? circleFrom(first) : [first], concert };
}

/** MEI for a lick: one treble staff in written pitch for the horn — or, for the piano, a grand staff at concert pitch. */
export function generateLickMei(spec: LickSpec, lick: Lick, options: LickScoreOptions = {}): string {
    const piano = !!options.piano || spec.horn === 'piano';
    const arpeggio = piano && spec.left === 'arpeggio';
    let counter = 0;
    const nextId = () => `lk${++counter}`;
    const { written: keys } = lickKeys(spec, piano);
    const low = piano ? 60 : WRITTEN_LOW, high = piano ? 84 : WRITTEN_HIGH;
    const segments = keys.map(k => segment(lick, k, spec.rhythm, low, high));

    // One line through all the keys, bar after bar.
    const notes: Array<{ at: number; pitches: Pitch[] }> = [];
    const chordMarks: Array<{ at: number; text: string }> = [];
    const left: Array<{ at: number; pitches: Pitch[] }> = [];
    const spans: Array<{ at: number; root: JazzRoot; family: Family; quality: string }> = [];
    let bar = 0;
    for (const s of segments) {
        const base = bar * BAR;
        s.notes.forEach(n => notes.push({ at: base + n.at, pitches: [n.pitch] }));
        s.chords.forEach(c => {
            chordMarks.push({ at: base + c.at, text: c.text });
            if (piano) spans.push({ at: base + c.at, root: c.root, family: c.family, quality: c.quality });
        });
        bar += s.bars;
    }
    const total = bar;
    // The left hand: each chord from its change to the next — held as a shell (root from E2, its
    // third and seventh), or broken in eighths up root, fifth, seventh and tenth (root from C2),
    // from the first eighth at or after the change.
    spans.forEach((c, k) => {
        const end = k + 1 < spans.length ? spans[k + 1].at : total * BAR;
        const t = chordTones(c.quality, c.family);
        if (!arpeggio) {
            const bass = 40 + ((rootPc(c.root) - 4) % 12 + 12) % 12;
            left.push({ at: c.at, pitches: [bass, bass + t.third, bass + t.seventh].map((m, j) => spell(m, c.root, c.family, j === 0 ? 0 : 1)) });
            return;
        }
        const bass = 36 + rootPc(c.root);
        const tones = [bass, bass + t.fifth, bass + t.seventh, bass + 12 + t.third];
        for (let at = Math.ceil(c.at / 6) * 6, j = 0; at < end; at += 6, j++) {
            left.push({ at, pitches: [spell(tones[j % 4], c.root, c.family, 1)] });
        }
    });
    // Each key's last note holds to its bar line; the next key begins in the next bar.
    const events: Ev[] = [];
    let from = 0;
    bar = 0;
    for (const s of segments) {
        const end = (bar + s.bars) * BAR;
        const own = notes.filter(n => n.at >= bar * BAR && n.at < end);
        events.push(...lineEvents(own, from, end));
        from = end;
        bar += s.bars;
    }
    const upper = serialize(layout(events, total), 1, nextId);
    const lower = piano ? serialize(layout(lineEvents(left, 0, total * BAR), total), 2, nextId) : null;

    const harm = Array.from({ length: total }, () => [] as string[]);
    if (spec.chords) {
        for (const c of chordMarks) {
            const m = Math.floor(c.at / BAR);
            const tstamp = 1 + (c.at % BAR) / TICKS;
            harm[m]?.push(`<harm staff="1" tstamp="${Number(tstamp.toFixed(3))}">${c.text}</harm>`);
        }
    }
    const body = upper.map((staff1, m) =>
        `<measure n="${m + 1}"${m === total - 1 ? ' right="end"' : ''}>${staff1}${lower ? lower[m] : ''}${harm[m].join('')}</measure>`);

    const staffDefs = piano
        ? `<staffGrp symbol="brace" bar.thru="true"><staffDef n="1" lines="5"><clef shape="G" line="2" /><meterSig count="4" unit="4" /></staffDef><staffDef n="2" lines="5"><clef shape="F" line="4" /><meterSig count="4" unit="4" /></staffDef></staffGrp>`
        : `<staffGrp><staffDef n="1" lines="5"><clef shape="G" line="2" /><meterSig count="4" unit="4" /></staffDef></staffGrp>`;
    const countIn = piano
        ? '<staff n="1"><layer n="1"><rest dur="4" /></layer></staff><staff n="2"><layer n="1"><rest dur="4" /></layer></staff>'
        : '<staff n="1"><layer n="1"><rest dur="4" /></layer></staff>';
    const title = `Jazz lick #${lick.rank}${spec.keys === 'circle' ? ', round the circle' : ''}`;
    return `<?xml version='1.0' encoding='UTF-8'?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead>
    <fileDesc>
      <titleStmt><title>${title}</title><respStmt /></titleStmt>
      <pubStmt><availability><p>Pattern from the Jazzomat Research Project's Pattern History Explorer and the Weimar Jazz Database (ODbL 1.0).</p></availability></pubStmt>
    </fileDesc>
  </meiHead>
  <music><body><mdiv><score>
    <scoreDef>${staffDefs}</scoreDef>
    <section>
      <measure n="0">${countIn}</measure>
      ${body.join('\n      ')}
    </section>
  </score></mdiv></body></music>
</mei>`;
}

/** The MEI for a lick: URL, the licks fetched as needed (loadSongText). */
export async function lickMeiForUrl(url: string): Promise<string> {
    const spec = parseLickUrl(url);
    if (!spec) throw new Error(`Not a lick: ${url}`);
    const lick = (await loadLicks()).find(l => l.rank === spec.rank);
    if (!lick) throw new Error(`No lick #${spec.rank}`);
    return generateLickMei(spec, lick);
}

/** A lick's notes written out over a chord on C (concert), for lists: "C B B♭ A G F E". */
export function lickNotes(lick: Lick): string {
    const seg = segment(lick, { letter: 'C', alter: 0 }, 'eighths', 55, 90);
    return seg.notes.map(n => n.pitch.step + (n.pitch.alter === 1 ? '♯' : n.pitch.alter === -1 ? '♭' : n.pitch.alter === 2 ? '𝄪' : n.pitch.alter === -2 ? '𝄫' : '')).join(' ');
}

/** The chords a lick is played over, on C: "Dm7 → G7" style, for lists. */
export function lickChords(lick: Lick, root: JazzRoot = { letter: 'C', alter: 0 }): string {
    const chords = lick.harmony?.chords ?? [];
    return chords.map(([, , rel, q]) => `${rootPretty(rootAbove(root, rel))}${q}`).join(' → ');
}

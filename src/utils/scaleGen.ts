/**
 * Scale-exercise generator for the piano song selector.
 *
 * A ScaleSpec (key, form, rhythm, octaves, repetitions, fingering) is encoded
 * as a synthetic `scale:` song URL — a stable string that works as a stats
 * key — and resolved on demand into an MEI document (see resolveSongUrl).
 * The MEI mimics the dialect of the bundled piano files: MEI 5.1, grand
 * staff (G2/F4), 4/4, a pickup measure n="0" holding a single quarter rest,
 * and <fing> control events for fingering.
 *
 * Exercise forms are built from two primitives so new ones stay cheap:
 *  - a "run": both hands walk a tone sequence up N steps, back down, times
 *    `reps`, closing on a long tonic. Scales map tone j to diatonic degree j;
 *    arpeggios map j across chord tones; offsets/negation give the
 *    thirds/sixths/tenths and contrary variants.
 *  - "chords": one block chord per measure (cadences).
 *
 * Fingering comes from published charts (pianoscales.org for scales, Robert
 * Kelley's chart for root-position arpeggios), stored as the conventional
 * 8-digit one-octave patterns. Multi-octave continuation fingers are derived
 * from the thumb positions of the printed octave (see steadyFinger).
 */

import { keyAlter } from './musicxml';

export type ScaleForm =
    | 'parallel' | 'contrary' | 'thirds' | 'sixths' | 'tenths'
    | 'scaletriads' | 'inversions' | 'triads' | 'arpeggio' | 'dom7' | 'cadence';
export type ScaleMode = 'major' | 'natural' | 'harmonic' | 'melodic';
export type ScaleRhythm = 'quarters' | 'eighths' | '16ths' | 'triplets';

export interface ScaleSpec {
    tonic: string;       // "C", "F#", "Eb" — letter plus optional #/b
    mode: ScaleMode;     // 'major' or one of the three minor variants
    form: ScaleForm;
    octaves: number;     // 1..4 (contrary is clamped to 3)
    reps: number;        // 1..4
    rhythm: ScaleRhythm; // ignored by 'cadence' (whole-note chords)
    fingering: boolean;
}

export const SCALE_FORMS: Array<{ value: ScaleForm; label: string }> = [
    { value: 'parallel', label: 'Parallel motion' },
    { value: 'contrary', label: 'Contrary motion' },
    { value: 'thirds', label: 'In thirds' },
    { value: 'sixths', label: 'In sixths' },
    { value: 'tenths', label: 'In tenths' },
    { value: 'scaletriads', label: 'Scale triads' },
    { value: 'inversions', label: 'Triad inversions' },
    { value: 'triads', label: 'Broken triads' },
    { value: 'arpeggio', label: 'Arpeggio' },
    { value: 'dom7', label: 'Dominant 7th arpeggio' },
    { value: 'cadence', label: 'Cadence (I–IV–V7–I)' },
];

export const SCALE_RHYTHMS: Array<{ value: ScaleRhythm; label: string }> = [
    { value: 'quarters', label: 'Quarters' },
    { value: 'eighths', label: 'Eighths' },
    { value: '16ths', label: 'Sixteenths' },
    { value: 'triplets', label: 'Triplets' },
];

const LETTERS = 'CDEFGAB';
// Letters ordered by fifths; index-1 (+7 per sharp in the tonic) = key fifths.
const FIFTHS_ORDER = 'FCGDAEB';

interface Pitch { step: string; alter: number; oct: number }

// ---------------------------------------------------------------- URL codec

const TONIC_RE = /^[A-G](#|b)?$/;
const MODES: ScaleMode[] = ['major', 'natural', 'harmonic', 'melodic'];
const RHYTHMS: ScaleRhythm[] = ['quarters', 'eighths', '16ths', 'triplets'];

export function buildScaleUrl(spec: ScaleSpec): string {
    return `scale:${spec.tonic}-${spec.mode}-${spec.form}-${spec.octaves}o-${spec.rhythm}-x${spec.reps}-f${spec.fingering ? 1 : 0}`;
}

export function parseScaleUrl(url: string): ScaleSpec | null {
    if (!url.startsWith('scale:')) return null;
    const parts = url.slice('scale:'.length).split('-');
    if (parts.length !== 7) return null;
    const [tonic, mode, form, oct, rhythm, reps, fing] = parts;
    const octaves = parseInt(oct, 10);
    const repCount = parseInt(reps.replace(/^x/, ''), 10);
    if (
        !TONIC_RE.test(tonic)
        || !MODES.includes(mode as ScaleMode)
        || !SCALE_FORMS.some(f => f.value === form)
        || !/^[1-4]o$/.test(oct)
        || !RHYTHMS.includes(rhythm as ScaleRhythm)
        || !/^x[1-4]$/.test(reps)
        || !/^f[01]$/.test(fing)
    ) return null;
    return {
        tonic, mode: mode as ScaleMode, form: form as ScaleForm,
        octaves, reps: repCount, rhythm: rhythm as ScaleRhythm,
        fingering: fing === 'f1',
    };
}

const PRETTY_ALTER: Record<string, string> = { '#': '♯', b: '♭' };

/** Human-readable name for a scale URL, or null if it isn't one. */
export function describeScaleUrl(url: string): string | null {
    const spec = parseScaleUrl(url);
    if (!spec) return null;
    const tonic = spec.tonic[0] + (PRETTY_ALTER[spec.tonic[1]] ?? '');
    const key = spec.mode === 'major' ? `${tonic} major` : `${tonic} ${spec.mode} minor`;
    const form = SCALE_FORMS.find(f => f.value === spec.form)?.label ?? spec.form;
    if (spec.form === 'cadence') return `${key} · ${form}${spec.reps > 1 ? ` ×${spec.reps}` : ''}`;
    return `${key} · ${form} · ${spec.octaves} oct · ${spec.rhythm}`
        + (spec.reps > 1 ? ` ×${spec.reps}` : '');
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Pitch classes the exercise uses (ascending ∪ descending spellings, so
 * melodic minor contributes both its raised and natural 6/7). Used to gray
 * out foreign keys on the virtual piano. Null when the URL isn't a scale:.
 */
export function scaleUrlPitchClasses(url: string): Set<number> | null {
    const spec = parseScaleUrl(url);
    if (!spec) return null;
    const pcs = new Set<number>();
    for (const ascending of [true, false]) {
        for (const deg of degreeTable(spec, ascending)) {
            pcs.add(((STEP_PC[deg.step] + deg.alter) % 12 + 12) % 12);
        }
    }
    return pcs;
}

// ------------------------------------------------------------ scale spelling

function tonicParts(tonic: string): { letter: string; alter: number } {
    return { letter: tonic[0], alter: tonic[1] === '#' ? 1 : tonic[1] === 'b' ? -1 : 0 };
}

export function scaleFifths(spec: ScaleSpec): number {
    const { letter, alter } = tonicParts(spec.tonic);
    const major = FIFTHS_ORDER.indexOf(letter) - 1 + 7 * alter;
    return spec.mode === 'major' ? major : major - 3;
}

interface DegreeSpelling { step: string; alter: number }

/**
 * Spelled degrees 0..6 for one direction of travel. Harmonic raises the 7th
 * both ways, melodic raises 6 and 7 ascending only, and the dominant-seventh
 * and cadence forms always need the raised leading tone in minor.
 */
function degreeTable(spec: ScaleSpec, ascending: boolean): DegreeSpelling[] {
    const { letter } = tonicParts(spec.tonic);
    const fifths = scaleFifths(spec);
    const start = LETTERS.indexOf(letter);
    const needsLeadingTone = spec.form === 'dom7' || spec.form === 'cadence';
    const raise7 = spec.mode === 'harmonic'
        || (spec.mode !== 'major' && needsLeadingTone)
        || (spec.mode === 'melodic' && ascending);
    const raise6 = spec.mode === 'melodic' && ascending && !needsLeadingTone;
    return Array.from({ length: 7 }, (_, d) => {
        const step = LETTERS[(start + d) % 7];
        let alter = keyAlter(step, fifths);
        if ((d === 6 && raise7) || (d === 5 && raise6)) alter += 1;
        return { step, alter };
    });
}

/** Pitch at diatonic index idx (0 = tonic, may be negative) above baseOct. */
function pitchAt(spec: ScaleSpec, idx: number, baseOct: number, ascending: boolean): Pitch {
    const { letter } = tonicParts(spec.tonic);
    const table = degreeTable(spec, ascending);
    const deg = ((idx % 7) + 7) % 7;
    const abs = LETTERS.indexOf(letter) + idx;
    return { ...table[deg], oct: baseOct + Math.floor(abs / 7) };
}

// ---------------------------------------------------------------- fingering

// One-octave charts as printed (8 digits, ascending, degree 0..7).
// Source: pianoscales.org major/harmonic-minor charts. Minor entries are
// applied to all three minor variants, per common practice.
const SCALE_FING: Record<string, { rh: string; lh: string }> = {
    'C': { rh: '12312345', lh: '54321321' },
    'G': { rh: '12312345', lh: '54321321' },
    'D': { rh: '12312345', lh: '54321321' },
    'A': { rh: '12312345', lh: '54321321' },
    'E': { rh: '12312345', lh: '54321321' },
    'B': { rh: '12312345', lh: '43214321' },
    'F#': { rh: '23412312', lh: '43213214' },
    'Db': { rh: '23123412', lh: '32143213' },
    'Ab': { rh: '34123123', lh: '32143213' },
    'Eb': { rh: '31234123', lh: '32143213' },
    'Bb': { rh: '21231234', lh: '32143213' },
    'F': { rh: '12341234', lh: '54321321' },
    'Am': { rh: '12312345', lh: '54321321' },
    'Em': { rh: '12312345', lh: '54321321' },
    'Bm': { rh: '12312345', lh: '43214321' },
    'F#m': { rh: '23123123', lh: '43213214' },
    'C#m': { rh: '34123123', lh: '32143213' },
    'G#m': { rh: '23123123', lh: '32143213' },
    'Ebm': { rh: '31234123', lh: '21432132' },
    'Bbm': { rh: '21231234', lh: '21321432' },
    'Fm': { rh: '12341234', lh: '54321321' },
    'Cm': { rh: '12312345', lh: '54321321' },
    'Gm': { rh: '12312345', lh: '54321321' },
    'Dm': { rh: '12312345', lh: '54321321' },
};

// Root-position triad arpeggios (Robert Kelley's chart): fingers for
// [root, 3rd, 5th], the octave-root finger, plus the RH top note.
interface ArpFing { cycle: [number, number, number]; oct: number; top: number; bottom: number }
const ARP_RH: Record<string, ArpFing> = {};
const ARP_LH: Record<string, ArpFing> = {};
{
    const rh = (keys: string, f: ArpFing) => keys.split(' ').forEach(k => { ARP_RH[k] = f; });
    const lh = (keys: string, f: ArpFing) => keys.split(' ').forEach(k => { ARP_LH[k] = f; });
    rh('C D E F G A B F# Am Bm Cm Dm Em Fm Gm Ebm', { cycle: [1, 2, 3], oct: 1, top: 5, bottom: 1 });
    rh('Db Eb Ab Bb C#m F#m G#m', { cycle: [2, 1, 2], oct: 4, top: 4, bottom: 2 });
    rh('Bbm', { cycle: [2, 3, 1], oct: 2, top: 2, bottom: 2 });
    lh('C F G Am Bm Cm Dm Em Fm Gm Ebm', { cycle: [1, 4, 2], oct: 1, top: 1, bottom: 5 });
    lh('D E A B F#', { cycle: [1, 3, 2], oct: 1, top: 1, bottom: 5 });
    lh('Db Eb Ab C#m F#m G#m', { cycle: [2, 1, 4], oct: 2, top: 2, bottom: 2 });
    lh('Bb Bbm', { cycle: [3, 2, 1], oct: 3, top: 3, bottom: 3 });
}
// Dominant sevenths keep a universally standard pattern only when the
// dominant root is a white key; other keys get no fingering.
const DOM7_RH: number[] = [1, 2, 3, 4]; // + top 5
const DOM7_LH: number[] = [1, 4, 3, 2]; // bottom 5, top 1

// Broken-triad group patterns by inversion (standard ABRSM broken chords);
// only emitted for natural-letter tonics where they are conventional.
const TRIAD_RH = [[1, 3, 5], [1, 2, 5], [1, 3, 5]];
const TRIAD_LH = [[5, 3, 1], [5, 3, 1], [5, 2, 1]];

function fingKey(spec: ScaleSpec): string {
    return spec.mode === 'major' ? spec.tonic : `${spec.tonic}m`;
}

/**
 * Continuation finger for a degree once the run is past the printed octave:
 * count from the nearest thumb of the printed pattern (RH counts up from the
 * previous thumb, LH counts down to the next one).
 */
function steadyFinger(digits: string, hand: 'rh' | 'lh', deg: number): number {
    const d = digits.split('').map(Number);
    const thumbs = new Set<number>();
    for (let i = 0; i < 7; i++) if (d[i] === 1) thumbs.add(i);
    if (d[7] === 1) thumbs.add(0);
    for (let k = 0; k < 7; k++) {
        const probe = ((hand === 'rh' ? deg - k : deg + k) % 7 + 7) % 7;
        if (thumbs.has(probe)) return k + 1;
    }
    return 3; // unreachable for real charts
}

/**
 * Finger for a scale-run note at diatonic index idx. The printed octave is
 * used verbatim, the bottom/top conventions apply at the extremes, and
 * everything else falls back to the steady cycle. Hands playing at a degree
 * offset (thirds/sixths/tenths) are mid-cycle, so only the steady cycle
 * applies to them.
 */
function scaleFinger(
    spec: ScaleSpec, hand: 'rh' | 'lh', idx: number,
    opts: { top: boolean; offset: boolean },
): number | null {
    const chart = SCALE_FING[fingKey(spec)];
    if (!chart) return null;
    const digits = chart[hand];
    const deg = ((idx % 7) + 7) % 7;
    if (opts.offset) return steadyFinger(digits, hand, deg);
    if (idx === 0) return Number(digits[0]);
    if (opts.top) return Number(digits[7]);
    if (idx >= 1 && idx <= 6) return Number(digits[idx]);
    return steadyFinger(digits, hand, deg);
}

function arpFinger(
    table: Record<string, ArpFing>, spec: ScaleSpec, hand: 'rh' | 'lh',
    j: number, opts: { top: boolean; tonesPerOct: number },
): number | null {
    if (spec.form === 'dom7') {
        const root = pitchAt(spec, -3, 4, true);
        if (root.alter !== 0) return null;
        const cyc = hand === 'rh' ? DOM7_RH : DOM7_LH;
        if (j === 0) return hand === 'rh' ? cyc[0] : 5;
        if (opts.top) return hand === 'rh' ? 5 : 1;
        return cyc[j % 4];
    }
    const f = table[fingKey(spec)];
    if (!f) return null;
    if (j === 0) return f.bottom;
    if (opts.top) return f.top;
    const tone = j % 3;
    return tone === 0 ? f.oct : f.cycle[tone];
}

// ------------------------------------------------------------- run building

interface Ev { pitches: Pitch[]; fings: Array<number | null> }
interface RunMusic { kind: 'run'; events: Ev[] }
interface ChordMusic { kind: 'chords'; measures: Ev[] }
type Music = RunMusic | ChordMusic;

/** Tone sequence of one rep: up 0..N, down N-1..1; `close` appends the final 0. */
function runSequence(N: number, reps: number): Array<{ j: number; asc: boolean }> {
    const seq: Array<{ j: number; asc: boolean }> = [];
    for (let r = 0; r < reps; r++) {
        for (let j = 0; j <= N; j++) seq.push({ j, asc: true });
        for (let j = N - 1; j >= 1; j--) seq.push({ j, asc: false });
    }
    seq.push({ j: 0, asc: false });
    return seq;
}

function baseOctaves(spec: ScaleSpec): { rh: number; lh: number } {
    if (spec.form === 'contrary') return { rh: 4, lh: 4 };
    const rh = spec.octaves >= 3 ? 3 : 4;
    const lh = rh - 1;
    if (spec.form === 'thirds' || spec.form === 'sixths') return { rh: lh, lh };
    return { rh, lh };
}

function effectiveOctaves(spec: ScaleSpec): number {
    return spec.form === 'contrary' ? Math.min(spec.octaves, 3) : spec.octaves;
}

function buildMusic(spec: ScaleSpec): { rh: Music; lh: Music } {
    const oct = effectiveOctaves(spec);
    const { rh: rhOct, lh: lhOct } = baseOctaves(spec);

    if (spec.form === 'cadence') {
        // LH root octaves, RH close voicings with standard voice leading.
        const LH_ROOTS = [0, 3, 4, 0];
        const RH_VOICES = [[2, 4, 7], [3, 5, 7], [3, 4, 6], [2, 4, 7]];
        const lhM: Ev[] = [], rhM: Ev[] = [];
        for (let r = 0; r < spec.reps; r++) {
            for (let c = 0; c < 4; c++) {
                lhM.push({
                    pitches: [pitchAt(spec, LH_ROOTS[c], 2, true), pitchAt(spec, LH_ROOTS[c], 3, true)],
                    fings: [null, null],
                });
                rhM.push({
                    pitches: RH_VOICES[c].map(i => pitchAt(spec, i, 4, true)),
                    fings: RH_VOICES[c].map(() => null),
                });
            }
        }
        return { rh: { kind: 'chords', measures: rhM }, lh: { kind: 'chords', measures: lhM } };
    }

    if (spec.form === 'triads') {
        // Broken chords: groups of three chord tones climbing the triad, then
        // the mirrored descent. t(g) is the g-th chord tone above the tonic.
        const t = (g: number) => 7 * Math.floor(g / 3) + [0, 2, 4][g % 3];
        const G = 3 * oct;
        const groups: Array<{ tones: number[]; inv: number; asc: boolean }> = [];
        for (let r = 0; r < spec.reps; r++) {
            for (let g = 0; g <= G; g++) groups.push({ tones: [t(g), t(g + 1), t(g + 2)], inv: g % 3, asc: true });
            for (let g = G; g >= 0; g--) groups.push({ tones: [t(g + 2), t(g + 1), t(g)], inv: g % 3, asc: false });
        }
        const useFing = tonicParts(spec.tonic).alter === 0;
        const hand = (h: 'rh' | 'lh', base: number): Music => ({
            kind: 'run',
            events: groups.flatMap(grp => grp.tones.map((idx, k) => ({
                pitches: [pitchAt(spec, idx, base, grp.asc)],
                fings: [useFing
                    ? (h === 'rh' ? TRIAD_RH : TRIAD_LH)[grp.inv][grp.asc ? k : 2 - k]
                    : null],
            }))),
        });
        return { rh: hand('rh', rhOct), lh: hand('lh', lhOct) };
    }

    // Block-chord runs: triads on every scale degree, or tonic-triad
    // inversions climbing chord tones like the broken form — both hands in
    // parallel, one chord per rhythm unit, same up/down skeleton as a run.
    if (spec.form === 'scaletriads' || spec.form === 'inversions') {
        const t = (g: number) => 7 * Math.floor(g / 3) + [0, 2, 4][g % 3];
        const N = spec.form === 'scaletriads' ? 7 * oct : 3 * oct;
        const chordIdx = (j: number): number[] =>
            spec.form === 'scaletriads' ? [j, j + 2, j + 4] : [t(j), t(j + 1), t(j + 2)];
        const useFing = spec.form === 'inversions'
            ? tonicParts(spec.tonic).alter === 0
            : true;
        const chordFings = (h: 'rh' | 'lh', j: number, first: boolean): Array<number | null> => {
            if (!useFing) return [null, null, null];
            if (spec.form === 'scaletriads') {
                // Uniform 1-3-5 shape; print it once, manual-style.
                return first ? (h === 'rh' ? [1, 3, 5] : [5, 3, 1]) : [null, null, null];
            }
            return (h === 'rh' ? TRIAD_RH : TRIAD_LH)[j % 3];
        };
        const hand = (h: 'rh' | 'lh', base: number): Music => ({
            kind: 'run',
            events: runSequence(N, spec.reps).map(({ j, asc }, i) => ({
                pitches: chordIdx(j).map(idx => pitchAt(spec, idx, base, asc)),
                fings: chordFings(h, j, i === 0),
            })),
        });
        return { rh: hand('rh', rhOct), lh: hand('lh', lhOct) };
    }

    // Run forms share one skeleton: a tone map from step j to diatonic index.
    const arp = spec.form === 'arpeggio';
    const dom7 = spec.form === 'dom7';
    const tonesPerOct = arp ? 3 : dom7 ? 4 : 7;
    const N = tonesPerOct * oct;
    const toneMap = (j: number): number => {
        if (arp) return 7 * Math.floor(j / 3) + [0, 2, 4][j % 3];
        if (dom7) return -3 + 7 * Math.floor(j / 4) + [0, 2, 4, 6][j % 4];
        return j;
    };
    const rhOffset = spec.form === 'thirds' || spec.form === 'tenths' ? 2
        : spec.form === 'sixths' ? 5 : 0;
    const seq = runSequence(N, spec.reps);

    const fingerOf = (h: 'rh' | 'lh', j: number, offset: boolean): number | null => {
        if (arp || dom7) {
            return arpFinger(h === 'rh' ? ARP_RH : ARP_LH, spec, h, j, { top: j === N, tonesPerOct });
        }
        return scaleFinger(spec, h, j, { top: j === N, offset });
    };

    const rhEvents: Ev[] = seq.map(({ j, asc }) => ({
        pitches: [pitchAt(spec, toneMap(j) + rhOffset, rhOct, asc)],
        fings: [rhOffset === 0 ? fingerOf('rh', j, false) : fingerOf('rh', j, true)],
    }));

    const lhEvents: Ev[] = spec.form === 'contrary'
        ? seq.map(({ j, asc }) => ({
            pitches: [pitchAt(spec, -j, lhOct, !asc)],
            // Mirrored hand: the tonic start is its "top" (thumb) and the
            // low turnaround its printed bottom, so reflect the index.
            fings: [scaleFinger(spec, 'lh', N - j, { top: j === 0, offset: false })],
        }))
        : seq.map(({ j, asc }) => ({
            pitches: [pitchAt(spec, toneMap(j), lhOct, asc)],
            fings: [fingerOf('lh', j, false)],
        }));

    return { rh: { kind: 'run', events: rhEvents }, lh: { kind: 'run', events: lhEvents } };
}

// ---------------------------------------------------------- MEI serializing

// Tick base: 12 per quarter (LCM of sixteenths and triplet eighths); 48/measure.
const MEASURE_TICKS = 48;
const UNIT_TICKS: Record<ScaleRhythm, number> = { quarters: 12, eighths: 6, '16ths': 3, triplets: 4 };
const ACCID: Record<number, string> = { [-2]: 'ff', [-1]: 'f', 0: 'n', 1: 's', 2: 'x' };
// Gestural accidentals use a different vocabulary: double sharp is "ss", not "x".
const ACCID_GES: Record<number, string> = { [-2]: 'ff', [-1]: 'f', 0: 'n', 1: 's', 2: 'ss' };

interface NoteItem {
    id: string;
    pitches: Pitch[];          // 1 = note, >1 = chord
    dur: number;               // MEI dur value (1, 2, 4, 8, 16)
    dots: number;
    tie: '' | 'i' | 'm' | 't';
    inTuplet: boolean;
    fings: Array<number | null>;
}

interface Beat { items: NoteItem[]; tuplet: boolean }

/** Chop a beat-aligned tick length into displayable durations (largest first). */
function plainDurs(ticks: number, atMeasureStart: boolean): Array<{ dur: number; dots: number }> {
    const out: Array<{ dur: number; dots: number }> = [];
    let left = ticks;
    if (atMeasureStart && left === 48) return [{ dur: 1, dots: 0 }];
    for (const [t, dur, dots] of [[36, 2, 1], [24, 2, 0], [12, 4, 0], [9, 8, 1], [6, 8, 0], [3, 16, 0]] as const) {
        while (left >= t) { out.push({ dur, dots }); left -= t; }
    }
    return out;
}

/**
 * Lay a hand's run out into measures of four beats. All events are one
 * rhythm unit long except the last, which is stretched (with ties where
 * needed) to close exactly on a barline.
 */
function layoutRun(events: Ev[], rhythm: ScaleRhythm, nextId: () => string): Beat[][] {
    const unit = UNIT_TICKS[rhythm];
    const runTicks = (events.length - 1) * unit;
    const finalTicks = MEASURE_TICKS - (runTicks % MEASURE_TICKS) || MEASURE_TICKS;
    const isTriplet = rhythm === 'triplets';
    const unitDur = rhythm === 'quarters' ? 4 : rhythm === '16ths' ? 16 : 8;

    const measures: Beat[][] = [];
    const beatAt = (pos: number): Beat => {
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
                tie: '', inTuplet: isTriplet, fings: ev.fings,
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
                inTuplet: c.tuplet, fings: k === 0 ? ev.fings : ev.fings.map(() => null),
            });
            const ticks = c.tuplet
                ? (c.dur === 8 ? 4 : 8)
                : [0, 48, 24, 0, 12, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 3][c.dur] * (c.dots ? 1.5 : 1);
            pos += ticks;
        });
    });
    return measures;
}

function xmlNote(p: Pitch, attrs: string, accidState: Map<string, number>, fifths: number): string {
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

function serializeItem(it: NoteItem, accidState: Map<string, number>, fifths: number): string {
    const durAttrs = `dur="${it.dur}"${it.dots ? ` dots="${it.dots}"` : ''}${it.tie ? ` tie="${it.tie}"` : ''}`;
    if (it.pitches.length > 1) {
        const notes = it.pitches
            .map((p, i) => xmlNote(p, `xml:id="${it.id}-${i}"`, accidState, fifths))
            .join('');
        return `<chord xml:id="${it.id}" ${durAttrs}>${notes}</chord>`;
    }
    return xmlNote(it.pitches[0], `xml:id="${it.id}" ${durAttrs}`, accidState, fifths);
}

function serializeBeat(beat: Beat, accidState: Map<string, number>, fifths: number): string {
    let inner = beat.items.map(it => serializeItem(it, accidState, fifths)).join('');
    const beamable = beat.items.length > 1 && beat.items.every(it => it.dur >= 8);
    if (beamable) inner = `<beam>${inner}</beam>`;
    if (beat.tuplet) inner = `<tuplet num="3" numbase="2">${inner}</tuplet>`;
    return inner;
}

/** MEI for a spec, in the dialect of the bundled piano files. */
export function generateScaleMei(spec: ScaleSpec): string {
    const fifths = scaleFifths(spec);
    const { rh, lh } = buildMusic(spec);
    let counter = 0;
    const nextId = () => `sg${++counter}`;

    const toMeasures = (m: Music): Beat[][] => m.kind === 'run'
        ? layoutRun(m.events, spec.rhythm, nextId)
        : m.measures.map(ev => [{
            items: [{
                id: nextId(), pitches: ev.pitches, dur: 1, dots: 0,
                tie: '' as const, inTuplet: false, fings: ev.fings,
            }],
            tuplet: false,
        }]);

    const rhMeasures = toMeasures(rh);
    const lhMeasures = toMeasures(lh);
    const count = Math.max(rhMeasures.length, lhMeasures.length);

    const measureXml: string[] = [];
    for (let m = 0; m < count; m++) {
        const fings: string[] = [];
        const staffXml = ([[1, rhMeasures[m]], [2, lhMeasures[m]]] as Array<[number, Beat[] | undefined]>)
            .map(([n, beats]) => {
                const accidState = new Map<string, number>();
                const inner = (beats ?? []).map(b => serializeBeat(b, accidState, fifths)).join('');
                if (spec.fingering) {
                    (beats ?? []).forEach(b => b.items.forEach(it => it.fings.forEach((f, i) => {
                        if (f == null) return;
                        const target = it.pitches.length > 1 ? `${it.id}-${i}` : it.id;
                        fings.push(`<fing staff="${n}" startid="#${target}">${f}</fing>`);
                    })));
                }
                return `<staff n="${n}"><layer n="1">${inner}</layer></staff>`;
            }).join('');
        const right = m === count - 1 ? ' right="end"' : '';
        measureXml.push(`<measure n="${m + 1}"${right}>${staffXml}${fings.join('')}</measure>`);
    }

    const keySig = fifths !== 0
        ? `<keySig sig="${fifths > 0 ? `${fifths}s` : `${-fifths}f`}" />`
        : '';
    const staffDef = (n: number, shape: string, line: number) =>
        `<staffDef n="${n}" lines="5"><clef shape="${shape}" line="${line}" />${keySig}<meterSig count="4" unit="4" /></staffDef>`;

    return `<?xml version='1.0' encoding='UTF-8'?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead>
    <fileDesc>
      <titleStmt><title>${describeScaleUrl(buildScaleUrl(spec)) ?? 'Scale exercise'}</title><respStmt /></titleStmt>
      <pubStmt />
    </fileDesc>
  </meiHead>
  <music><body><mdiv><score>
    <scoreDef>
      <staffGrp>
        ${staffDef(1, 'G', 2)}
        ${staffDef(2, 'F', 4)}
      </staffGrp>
    </scoreDef>
    <section>
      <measure n="0">
        <staff n="1"><layer n="1"><rest dur="4" /></layer></staff>
        <staff n="2"><layer n="1"><rest dur="4" /></layer></staff>
      </measure>
      ${measureXml.join('\n      ')}
    </section>
  </score></mdiv></body></music>
</mei>`;
}

/** Data URL serving the generated MEI (fetch() handles data: natively). */
export function scaleDataUrl(spec: ScaleSpec): string {
    return `data:application/xml;charset=utf-8,${encodeURIComponent(generateScaleMei(spec))}`;
}

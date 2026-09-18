/**
 * Jazz scale/pattern generator for the Saxo song selector.
 *
 * Where the piano generator (scaleGen.ts) engraves conservatory technique on
 * a grand staff, this one engraves *saxophone* practice material: one treble
 * staff, in written pitch for the chosen horn, over the real keyed range of
 * the instrument. A JazzSpec is encoded as a synthetic `sax:` song URL — a
 * stable string that doubles as a stats key — and resolved on demand into an
 * MEI document (see resolveSongUrl).
 *
 * The design follows the four layers of the original brief (restated, with
 * the musical sources and the two corrections to it, in docs/saxo-scales.md):
 *
 *  1. Transposition & tessitura. Concert pitch (the harmonic state you think
 *     in, the key the band is in) is kept separate from written pitch (what
 *     lands on the staff). Exercises traverse the *horn*, not an abstract
 *     octave count: the "full range" form starts on the root, climbs to the
 *     highest scale tone that still fits under the top of the range, descends
 *     to the lowest one above the bottom, and returns to the root.
 *  2. Scale taxonomy. The four bebop scales are 8-note scales whose added
 *     chromatic passing tone puts chord tones on the downbeats when the line
 *     is played in straight eighths from a chord tone — an even note count
 *     per octave is what makes that hold, and the turnarounds preserve it
 *     (see docs/saxo-scales.md). Beside them: the melodic-minor modes, the
 *     symmetrical scales, and the pentatonic/blues family.
 *  3. Patterns & articulation. Scalar runs, scales in thirds, the digital
 *     patterns (1-2-3-5, 3-5-7-9), triad pairs, and three enclosure types
 *     that approach every chord tone. Jazz articulation slurs the offbeat
 *     into the downbeat and accents the top note of every leap wider than a
 *     minor third.
 *  4. Notation & enharmonics. Degrees carry their own spelling (a bebop
 *     dominant is spelled ♭7 → ♮7, never ♯6 → ♮7), the key signature is the
 *     one that draws the fewest accidentals for the scale, and accidental
 *     state resets at every barline — all of that lives in meiNotation.ts,
 *     shared with the piano generator.
 *
 * Playback is straight, not swung: the trainer's hit-detection follows the
 * engraved rhythm, so nothing here asks the player to swing the eighths.
 */

import { keyAlter } from './musicxml';
import {
    layoutRun, newAccidState, serializeBeat,
    type Beat, type Pitch, type Rhythm,
} from './meiNotation';

const LETTERS = 'CDEFGAB';
const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// Letters ordered by fifths; index-1 (+7 per sharp) = fifths of that major key.
const FIFTHS_ORDER = 'FCGDAEB';
const PRETTY_ALTER: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

// ------------------------------------------------- layer 1: horns and range

export type HornId = 'alto' | 'tenor' | 'soprano' | 'bari';

export interface Horn {
    id: HornId;
    label: string;
    /** Concert → written: semitones up, and letter steps up (keeps spelling right). */
    semitones: number;
    letters: number;
}

export const HORNS: Horn[] = [
    { id: 'alto', label: 'Alto (E♭)', semitones: 9, letters: 5 },      // up a M6
    { id: 'tenor', label: 'Tenor (B♭)', semitones: 14, letters: 8 },   // up a M9
    { id: 'soprano', label: 'Soprano (B♭)', semitones: 2, letters: 1 }, // up a M2
    { id: 'bari', label: 'Baritone (E♭)', semitones: 21, letters: 12 }, // up a M6 + 8ve
];

/**
 * Standard keyed range in WRITTEN pitch — identical for every saxophone,
 * which is the whole point of the transposing convention: low B♭3 up to
 * high F6, or F♯6 on a horn with the extra key.
 */
export const WRITTEN_LOW = 58;      // B♭3
export const WRITTEN_HIGH = 89;     // F6
export const WRITTEN_HIGH_FS = 90;  // F♯6

// ------------------------------------------------- layer 2: scale taxonomy

export type JazzScaleId =
    | 'bebopdom' | 'bebopmaj' | 'bebopdor' | 'bebopmin' | 'bebopmm'
    | 'ionian' | 'dorian' | 'mixo' | 'melmin'
    | 'dorianb2' | 'lydaug' | 'lyddom' | 'mixob6' | 'locrian2' | 'altered'
    | 'halfwhole' | 'wholehalf' | 'wholetone'
    | 'majpent' | 'minpent' | 'blues' | 'jazzblues';

export interface JazzScaleDef {
    id: JazzScaleId;
    label: string;
    group: string;
    /** Chord the scale is practised against (shown in the exercise title). */
    chord: string;
    /** Degrees in order, each as a figure with its own spelling. */
    degrees: string[];
    /** Degrees that are chord tones: enclosure targets, and the notes that
     *  a bebop scale is built to place on the downbeats. */
    chordTones: string[];
    /** Key-signature preference, as fifths relative to the root's major key.
     *  Only a tie-break — the signature that draws fewest accidentals wins. */
    bias: number;
}

export const JAZZ_SCALES: JazzScaleDef[] = [
    // The four bebop scales: a parent scale plus one chromatic passing tone,
    // 8 notes, chord tones on the downbeats in straight eighths.
    { id: 'bebopdom', label: 'Bebop dominant', group: 'Bebop', chord: 'V7', bias: -1, degrees: ['1', '2', '3', '4', '5', '6', 'b7', '7'], chordTones: ['1', '3', '5', 'b7'] },
    { id: 'bebopmaj', label: 'Bebop major', group: 'Bebop', chord: 'Imaj7', bias: 0, degrees: ['1', '2', '3', '4', '5', '#5', '6', '7'], chordTones: ['1', '3', '5', '6'] },
    // Dorian + a ♮3 passing tone (David Baker's bebop minor). Careful: this is
    // the same note collection as the bebop dominant a fourth below, so what
    // lands on the downbeats are the chord tones of that V7 — of the iim7's own
    // tones only the root and ♭3 do. The ♮7 variant below is the one that puts
    // all four m7 tones on the beat; downbeatAligned() tells them apart.
    { id: 'bebopdor', label: 'Bebop dorian (♮3)', group: 'Bebop', chord: 'iim7', bias: -2, degrees: ['1', '2', 'b3', '3', '4', '5', '6', 'b7'], chordTones: ['1', 'b3', '5', 'b7'] },
    { id: 'bebopmin', label: 'Bebop minor (♮7)', group: 'Bebop', chord: 'im7', bias: -3, degrees: ['1', '2', 'b3', '4', '5', '6', 'b7', '7'], chordTones: ['1', 'b3', '5', 'b7'] },
    { id: 'bebopmm', label: 'Bebop melodic minor', group: 'Bebop', chord: 'mMaj7', bias: -3, degrees: ['1', '2', 'b3', '4', '5', '#5', '6', '7'], chordTones: ['1', 'b3', '5', '6'] },

    // The parents, for hearing what the passing tone was added to.
    { id: 'ionian', label: 'Major (Ionian)', group: 'Parent scales', chord: 'Imaj7', bias: 0, degrees: ['1', '2', '3', '4', '5', '6', '7'], chordTones: ['1', '3', '5', '7'] },
    { id: 'dorian', label: 'Dorian', group: 'Parent scales', chord: 'iim7', bias: -2, degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'], chordTones: ['1', 'b3', '5', 'b7'] },
    { id: 'mixo', label: 'Mixolydian', group: 'Parent scales', chord: 'V7', bias: -1, degrees: ['1', '2', '3', '4', '5', '6', 'b7'], chordTones: ['1', '3', '5', 'b7'] },
    { id: 'melmin', label: 'Melodic minor', group: 'Parent scales', chord: 'mMaj7', bias: -3, degrees: ['1', '2', 'b3', '4', '5', '6', '7'], chordTones: ['1', 'b3', '5', '7'] },

    // Modes of melodic minor — spelled as modes, every letter used once.
    { id: 'dorianb2', label: 'Dorian ♭2', group: 'Melodic minor modes', chord: 'm7 (phrygian)', bias: -4, degrees: ['1', 'b2', 'b3', '4', '5', '6', 'b7'], chordTones: ['1', 'b3', '5', 'b7'] },
    { id: 'lydaug', label: 'Lydian augmented', group: 'Melodic minor modes', chord: 'maj7♯5', bias: 2, degrees: ['1', '2', '3', '#4', '#5', '6', '7'], chordTones: ['1', '3', '#5', '7'] },
    { id: 'lyddom', label: 'Lydian dominant', group: 'Melodic minor modes', chord: '7♯11', bias: 0, degrees: ['1', '2', '3', '#4', '5', '6', 'b7'], chordTones: ['1', '3', '5', 'b7'] },
    { id: 'mixob6', label: 'Mixolydian ♭6', group: 'Melodic minor modes', chord: '7♭13', bias: -2, degrees: ['1', '2', '3', '4', '5', 'b6', 'b7'], chordTones: ['1', '3', '5', 'b7'] },
    { id: 'locrian2', label: 'Locrian ♯2', group: 'Melodic minor modes', chord: 'm7♭5', bias: -4, degrees: ['1', '2', 'b3', '4', 'b5', 'b6', 'b7'], chordTones: ['1', 'b3', 'b5', 'b7'] },
    { id: 'altered', label: 'Altered (super Locrian)', group: 'Melodic minor modes', chord: '7alt', bias: -5, degrees: ['1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'], chordTones: ['1', 'b4', 'b5', 'b7'] },

    // Symmetrical.
    { id: 'halfwhole', label: 'Half-whole diminished', group: 'Symmetrical', chord: '7♭9', bias: -1, degrees: ['1', 'b2', 'b3', '3', '#4', '5', '6', 'b7'], chordTones: ['1', '3', '5', 'b7'] },
    { id: 'wholehalf', label: 'Whole-half diminished', group: 'Symmetrical', chord: '°7', bias: -3, degrees: ['1', '2', 'b3', '4', 'b5', 'b6', '6', '7'], chordTones: ['1', 'b3', 'b5', '6'] },
    { id: 'wholetone', label: 'Whole tone', group: 'Symmetrical', chord: '7♯5', bias: 0, degrees: ['1', '2', '3', '#4', '#5', 'b7'], chordTones: ['1', '3', '#5', 'b7'] },

    // Pentatonic & blues.
    { id: 'majpent', label: 'Major pentatonic', group: 'Pentatonic & blues', chord: 'maj6', bias: 0, degrees: ['1', '2', '3', '5', '6'], chordTones: ['1', '3', '5', '6'] },
    { id: 'minpent', label: 'Minor pentatonic', group: 'Pentatonic & blues', chord: 'm7', bias: -3, degrees: ['1', 'b3', '4', '5', 'b7'], chordTones: ['1', 'b3', '5', 'b7'] },
    { id: 'blues', label: 'Blues', group: 'Pentatonic & blues', chord: '7', bias: -3, degrees: ['1', 'b3', '4', 'b5', '5', 'b7'], chordTones: ['1', 'b3', '5', 'b7'] },
    { id: 'jazzblues', label: 'Jazz blues (9-note)', group: 'Pentatonic & blues', chord: '7', bias: -3, degrees: ['1', '2', 'b3', '3', '4', 'b5', '5', '6', 'b7'], chordTones: ['1', '3', '5', '6', 'b7'] },
];

const SCALE_BY_ID = new Map(JAZZ_SCALES.map(s => [s.id, s]));

/**
 * Whether playing this scale in straight eighths from the root puts every one
 * of its chord tones on a downbeat — the property the bebop scales exist for.
 * It needs an even number of notes per octave (so the alignment survives from
 * octave to octave, and through the turnarounds) with the chord tones on the
 * even scale steps.
 */
export function downbeatAligned(def: JazzScaleDef): boolean {
    return def.degrees.length % 2 === 0
        && def.chordTones.every(d => {
            const i = def.degrees.indexOf(d);
            return i >= 0 && i % 2 === 0;
        });
}

// ---------------------------------------------- layer 3: patterns & rhythm

export type JazzPattern =
    | 'scalar' | 'thirds' | 'p1235' | 'p3579' | 'triadpair'
    | 'enclow' | 'enchigh' | 'encaround';

export const JAZZ_PATTERNS: Array<{ value: JazzPattern; label: string; hint: string }> = [
    { value: 'scalar', label: 'Scalar run', hint: 'the scale itself, up and back down' },
    { value: 'thirds', label: 'In thirds', hint: 'every scale step paired with the one two above' },
    { value: 'p1235', label: 'Digital 1-2-3-5', hint: 'the Coltrane-changes cell, from each degree' },
    { value: 'p3579', label: 'Digital 3-5-7-9', hint: 'rootless arpeggiation, from each degree' },
    { value: 'triadpair', label: 'Triad pairs', hint: 'triads on degrees 1 and 2, alternating' },
    { value: 'enclow', label: 'Approach from below', hint: 'one chromatic below each chord tone' },
    { value: 'enchigh', label: 'Double chromatic above', hint: 'two chromatic steps down onto each chord tone' },
    { value: 'encaround', label: 'Enclosure', hint: 'diatonic above + chromatic below each chord tone' },
];

export const JAZZ_RHYTHMS: Array<{ value: Rhythm; label: string }> = [
    { value: 'quarters', label: 'Quarters' },
    { value: 'eighths', label: 'Eighths' },
    { value: '16ths', label: 'Sixteenths' },
    { value: 'triplets', label: 'Triplets' },
];

/** 'full' traverses the whole horn; 1–3 is the piano-style octave count. */
export type JazzRange = 'full' | 1 | 2 | 3;

export interface JazzSpec {
    /** Root as written by the user, in the domain below ("C", "F#", "Eb"). */
    root: string;
    /** Whether `root` names the concert key (what the band plays) or the
     *  written key (what lands on this player's staff). */
    domain: 'concert' | 'written';
    scale: JazzScaleId;
    pattern: JazzPattern;
    range: JazzRange;
    rhythm: Rhythm;
    reps: number;       // 1..4
    horn: HornId;
    /** Jazz articulation: slur the offbeat into the downbeat, accent leaps. */
    artic: boolean;
    /** Allow the high F♯ key at the top of the range. */
    highFs: boolean;
}

// ---------------------------------------------------------------- URL codec

const ROOT_RE = /^[A-G](#|b)?$/;
const RHYTHMS: Rhythm[] = ['quarters', 'eighths', '16ths', 'triplets'];

export function buildJazzUrl(spec: JazzSpec): string {
    const range = spec.range === 'full' ? 'full' : `${spec.range}o`;
    const flags = `a${spec.artic ? 1 : 0}w${spec.domain === 'written' ? 1 : 0}h${spec.highFs ? 1 : 0}`;
    return `sax:${spec.root}-${spec.scale}-${spec.pattern}-${range}-${spec.rhythm}-x${spec.reps}-${spec.horn}-${flags}`;
}

export function parseJazzUrl(url: string): JazzSpec | null {
    if (!url.startsWith('sax:')) return null;
    const parts = url.slice('sax:'.length).split('-');
    if (parts.length !== 8) return null;
    const [root, scale, pattern, range, rhythm, reps, horn, flags] = parts;
    const flagMatch = /^a([01])w([01])h([01])$/.exec(flags);
    if (
        !ROOT_RE.test(root)
        || !SCALE_BY_ID.has(scale as JazzScaleId)
        || !JAZZ_PATTERNS.some(p => p.value === pattern)
        || !(range === 'full' || /^[1-3]o$/.test(range))
        || !RHYTHMS.includes(rhythm as Rhythm)
        || !/^x[1-4]$/.test(reps)
        || !HORNS.some(h => h.id === horn)
        || !flagMatch
    ) return null;
    return {
        root,
        scale: scale as JazzScaleId,
        pattern: pattern as JazzPattern,
        range: range === 'full' ? 'full' : (parseInt(range, 10) as 1 | 2 | 3),
        rhythm: rhythm as Rhythm,
        reps: parseInt(reps.slice(1), 10),
        horn: horn as HornId,
        artic: flagMatch[1] === '1',
        domain: flagMatch[2] === '1' ? 'written' : 'concert',
        highFs: flagMatch[3] === '1',
    };
}

// ------------------------------------------------------- spelling machinery

interface Root { letter: string; alter: number }

function parseRoot(s: string): Root {
    return { letter: s[0], alter: s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0 };
}

function rootPc(r: Root): number {
    return ((STEP_PC[r.letter] + r.alter) % 12 + 12) % 12;
}

function rootText(r: Root): string {
    return r.letter + (r.alter === 1 ? '#' : r.alter === -1 ? 'b' : '');
}

function rootPretty(r: Root): string {
    return r.letter + (PRETTY_ALTER[r.alter] ?? '');
}

/** Fifths of the major key on this root (C = 0, G = 1, F = -1, …). */
function majorFifths(r: Root): number {
    return FIFTHS_ORDER.indexOf(r.letter) - 1 + 7 * r.alter;
}

/** Centre an alteration into [-6, 5] so pitch-class maths can't invent 𝄪𝄪. */
function centreAlter(a: number): number {
    return ((a + 6) % 12 + 12) % 12 - 6;
}

/** Spell a MIDI number on a given letter (the letter fixes the octave too). */
function spellAs(midi: number, letter: string): Pitch {
    const pc = ((midi % 12) + 12) % 12;
    const alter = centreAlter(pc - STEP_PC[letter]);
    return { step: letter, alter, oct: (midi - STEP_PC[letter] - alter) / 12 - 1 };
}

function pitchMidi(p: Pitch): number {
    return (p.oct + 1) * 12 + STEP_PC[p.step] + p.alter;
}

const letterAt = (letter: string, steps: number) => LETTERS[((LETTERS.indexOf(letter) + steps) % 7 + 7) % 7];

/** Concert root → written root for a horn, keeping the interval spelling. */
function toWritten(concert: Root, horn: Horn): Root {
    const letter = letterAt(concert.letter, horn.letters);
    return { letter, alter: centreAlter((rootPc(concert) + horn.semitones) % 12 - STEP_PC[letter]) };
}

/** Written root → concert root (the inverse transposition). */
function toConcert(written: Root, horn: Horn): Root {
    const letter = letterAt(written.letter, -horn.letters);
    return { letter, alter: centreAlter(((rootPc(written) - horn.semitones) % 12 + 12) % 12 - STEP_PC[letter]) };
}

/**
 * Respell a root whose key would be unreadable. Concert F♯ on alto transposes
 * to written D♯ — a 9-sharp key that no one engraves; E♭ is the same pitch
 * with 3 flats. Only kicks in past the 7-accidental wall.
 */
function simplifyRoot(r: Root): Root {
    if (Math.abs(majorFifths(r)) <= 6) return r;
    const pc = rootPc(r);
    let best = r;
    for (const letter of LETTERS) {
        for (const alter of [0, -1, 1, -2, 2]) {
            if (((STEP_PC[letter] + alter) % 12 + 12) % 12 !== pc) continue;
            const cand = { letter, alter };
            if (Math.abs(majorFifths(cand)) < Math.abs(majorFifths(best))) best = cand;
        }
    }
    return best;
}

// --------------------------------------------------------- degrees → pitches

const DEGREE_SEMI = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_RE = /^(bb|b|##|#)?([1-7])$/;
const DEGREE_ALTER: Record<string, number> = { bb: -2, b: -1, '': 0, '#': 1, '##': 2 };

interface DegreeParts { letterStep: number; semitones: number }

function degreeParts(degree: string): DegreeParts {
    const m = DEGREE_RE.exec(degree);
    if (!m) throw new Error(`bad scale degree: ${degree}`);
    const n = parseInt(m[2], 10);
    return { letterStep: n - 1, semitones: DEGREE_SEMI[n - 1] + DEGREE_ALTER[m[1] ?? ''] };
}

/** Pretty degree figure for titles: "b7" → "♭7". */
function degreePretty(degree: string): string {
    return degree.replace('bb', '𝄫').replace(/^b/, '♭').replace('##', '𝄪').replace('#', '♯');
}

/** One tone of the scale as it sits on the horn. */
interface Tone {
    pitch: Pitch;
    midi: number;
    /** Index into the scale definition's degree list. */
    degree: number;
}

/**
 * Every scale tone inside the written range, ascending. This is the tessitura
 * engine: the exercise is laid out on *this* array, so it can never ask for a
 * note the horn does not have.
 */
function buildLine(written: Root, def: JazzScaleDef, low: number, high: number): Tone[] {
    const tones: Tone[] = [];
    const rootBase = STEP_PC[written.letter] + written.alter; // pitch class + octave offset
    for (let oct = 0; oct <= 9; oct++) {
        def.degrees.forEach((degree, degreeIdx) => {
            const { letterStep, semitones } = degreeParts(degree);
            const midi = (oct + 1) * 12 + rootBase + semitones;
            if (midi < low || midi > high) return;
            tones.push({
                pitch: spellAs(midi, letterAt(written.letter, letterStep)),
                midi,
                degree: degreeIdx,
            });
        });
    }
    return tones.sort((a, b) => a.midi - b.midi);
}

// --------------------------------------------------------------- traversals

/** Index sequence walking the line: one entry per scale step travelled. */
function traversal(line: Tone[], spec: JazzSpec): number[] {
    const rootIdx = line.map((t, i) => (t.degree === 0 ? i : -1)).filter(i => i >= 0);
    if (line.length === 0) return [];
    if (rootIdx.length === 0) {
        // No root in range (possible only for absurd ranges): walk everything.
        return [...line.keys(), ...[...line.keys()].reverse().slice(1)];
    }

    const span = (from: number, to: number): number[] => {
        const step = to >= from ? 1 : -1;
        const out: number[] = [];
        for (let i = from + step; step > 0 ? i <= to : i >= to; i += step) out.push(i);
        return out;
    };

    if (spec.range === 'full') {
        // Bergonzi/Viola: root → top of the horn → bottom → root.
        const start = rootIdx[0];
        return [start, ...span(start, line.length - 1), ...span(line.length - 1, 0), ...span(0, start)];
    }

    // Octave-limited: the lowest root that still has `range` octaves above it,
    // clamped down when the horn cannot hold the request.
    for (let octaves = spec.range as number; octaves >= 1; octaves--) {
        for (const start of rootIdx) {
            const top = rootIdx.find(i => line[i].midi === line[start].midi + 12 * octaves);
            if (top === undefined) continue;
            return [start, ...span(start, top), ...span(top, start)];
        }
    }
    const start = rootIdx[0];
    return [start, ...span(start, line.length - 1), ...span(line.length - 1, start)];
}

/** Split an index walk into runs of constant direction. */
function segments(walk: number[]): Array<{ from: number; to: number; up: boolean }> {
    const out: Array<{ from: number; to: number; up: boolean }> = [];
    let start = 0;
    for (let i = 1; i < walk.length; i++) {
        const up = walk[i] > walk[i - 1];
        const prevUp = i >= 2 ? walk[i - 1] > walk[i - 2] : up;
        if (i >= 2 && up !== prevUp) {
            out.push({ from: walk[start], to: walk[i - 1], up: prevUp });
            start = i - 1;
        }
    }
    if (walk.length > 1) {
        out.push({ from: walk[start], to: walk[walk.length - 1], up: walk[walk.length - 1] > walk[start] });
    }
    return out;
}

// ------------------------------------------------------------- enclosures

/** Chromatic neighbour below: the letter below, raised (F♯ → G, never G♭ → G). */
function chromaticBelow(target: Tone): Pitch {
    return spellAs(target.midi - 1, letterAt(target.pitch.step, -1));
}

/** Neighbour above, `semis` semitones up, spelled on the letter above. */
function chromaticAbove(target: Tone, semis: number): Pitch {
    return spellAs(target.midi + semis, letterAt(target.pitch.step, 1));
}

// --------------------------------------------------- pattern → note stream

interface Note { pitch: Pitch; midi: number }

const toNote = (t: Tone): Note => ({ pitch: t.pitch, midi: t.midi });

/** Relative scale-step offsets of the grouped patterns, ascending. */
const GROUPS: Partial<Record<JazzPattern, number[]>> = {
    thirds: [0, 2],
    p1235: [0, 1, 2, 4],
    p3579: [2, 4, 6, 8],
};

function patternNotes(line: Tone[], walk: number[], spec: JazzSpec, low: number, high: number): Note[] {
    const def = SCALE_BY_ID.get(spec.scale)!;
    const inRange = (i: number) => i >= 0 && i < line.length;

    if (spec.pattern === 'scalar') return walk.map(i => toNote(line[i]));

    const group = GROUPS[spec.pattern];
    if (group) {
        const out: Note[] = [];
        for (const seg of segments(walk)) {
            const step = seg.up ? 1 : -1;
            for (let i = seg.from; seg.up ? i <= seg.to : i >= seg.to; i += step) {
                const idx = group.map(o => i + o * step);
                // A cell that would run off either end of the horn is skipped
                // rather than clipped, so every group keeps its shape.
                if (!idx.every(inRange)) continue;
                idx.forEach(j => out.push(toNote(line[j])));
            }
        }
        return out;
    }

    if (spec.pattern === 'triadpair') {
        // Two triads a step apart (C and D over C lydian), alternating, one
        // pair per octave of the horn, up and back down.
        const roots = line.map((t, i) => (t.degree === 0 ? i : -1)).filter(i => i >= 0);
        const pair = (i: number): number[][] => [[i, i + 2, i + 4], [i + 1, i + 3, i + 5]];
        const up: Note[] = [];
        for (const r of roots) {
            for (const triad of pair(r)) {
                if (!triad.every(inRange)) continue;
                triad.forEach(j => up.push(toNote(line[j])));
            }
        }
        if (up.length === 0) return walk.map(i => toNote(line[i]));
        const down = [...up].reverse().slice(1);
        return [...up, ...down];
    }

    // Enclosures: every chord tone in the line gets approached, ascending
    // through the horn and back down.
    const tones = def.chordTones.map(d => def.degrees.indexOf(d)).filter(i => i >= 0);
    const targets = line.filter(t => tones.includes(t.degree));
    if (targets.length === 0) return walk.map(i => toNote(line[i]));
    // An approach note may sit outside the *scale* but never outside the horn.
    const fits = (p: Pitch) => { const m = pitchMidi(p); return m >= low && m <= high; };

    const approach = (t: Tone): Pitch[] => {
        if (spec.pattern === 'enclow') return [chromaticBelow(t)];
        if (spec.pattern === 'enchigh') return [chromaticAbove(t, 2), chromaticAbove(t, 1)];
        // encaround: the next scale tone above, then the chromatic below.
        const above = line.find(o => o.midi > t.midi);
        return above ? [above.pitch, chromaticBelow(t)] : [chromaticBelow(t)];
    };

    const cell = (t: Tone): Note[] => [
        ...approach(t).filter(fits).map(p => ({ pitch: p, midi: pitchMidi(p) })),
        toNote(t),
    ];
    const up = targets.flatMap(cell);
    const down = [...targets].reverse().slice(1).flatMap(cell);
    return [...up, ...down];
}

// ------------------------------------------------------------- articulation

/** Per-note articulation payload carried through the layout. */
interface Artic { accent: boolean }

/**
 * Accent the top note of every leap wider than a minor third — ascending,
 * that is the note you arrive on; descending, the one you leave from.
 */
function accents(notes: Note[]): boolean[] {
    const out = notes.map(() => false);
    for (let i = 1; i < notes.length; i++) {
        const delta = notes[i].midi - notes[i - 1].midi;
        if (Math.abs(delta) <= 3) continue;
        out[delta > 0 ? i : i - 1] = true;
    }
    return out;
}

// ------------------------------------------------- layer 4: key & document

/**
 * Key signature: the one that draws the fewest accidentals for this scale,
 * tie-broken toward the scale's conventional parent key (a bebop dominant
 * prefers the signature of the key it is the V7 of).
 */
function chooseFifths(written: Root, def: JazzScaleDef): number {
    const spellings = def.degrees.map(d => {
        const { letterStep, semitones } = degreeParts(d);
        const letter = letterAt(written.letter, letterStep);
        return { step: letter, alter: centreAlter((rootPc(written) + semitones) % 12 - STEP_PC[letter]) };
    });
    const target = majorFifths(written) + def.bias;
    let best = 0;
    let bestCost = Infinity;
    for (let f = -7; f <= 7; f++) {
        const drawn = spellings.filter(s => s.alter !== keyAlter(s.step, f)).length;
        const cost = drawn * 100 + Math.abs(f - target);
        if (cost < bestCost) { bestCost = cost; best = f; }
    }
    return best;
}

export interface JazzResolved {
    spec: JazzSpec;
    horn: Horn;
    def: JazzScaleDef;
    concert: Root;
    written: Root;
    fifths: number;
    line: Tone[];
    notes: Note[];
}

/** Everything the generator and the UI need, derived once from a spec. */
export function resolveJazzSpec(spec: JazzSpec): JazzResolved {
    const horn = HORNS.find(h => h.id === spec.horn) ?? HORNS[0];
    const def = SCALE_BY_ID.get(spec.scale) ?? JAZZ_SCALES[0];
    const given = parseRoot(spec.root);
    const concert = spec.domain === 'concert' ? given : toConcert(given, horn);
    const written = simplifyRoot(spec.domain === 'written' ? given : toWritten(given, horn));
    const high = spec.highFs ? WRITTEN_HIGH_FS : WRITTEN_HIGH;
    const line = buildLine(written, def, WRITTEN_LOW, high);
    const walk = traversal(line, spec);
    const pass = patternNotes(line, walk, spec, WRITTEN_LOW, high);

    // Repeat the pass, then close on the root it started from — the long
    // final note that lets the layout land on a barline.
    //
    // When a pass ends on the pitch it began with (every traversal does), the
    // repeat drops that duplicated note at the seam. That is not only better
    // playing — it is what keeps a bebop scale's chord tones on the downbeats
    // across repetitions: a pass is an odd number of notes, so repeating it
    // whole would flip every following note onto the offbeat.
    const notes: Note[] = [];
    const loops = pass.length > 1 && pass[pass.length - 1].midi === pass[0].midi;
    for (let r = 0; r < spec.reps; r++) notes.push(...(r > 0 && loops ? pass.slice(1) : pass));
    if (notes.length > 0 && notes[notes.length - 1].midi !== pass[0].midi) notes.push(pass[0]);

    return { spec, horn, def, concert, written, fifths: chooseFifths(written, def), line, notes };
}

/** Human-readable name for a sax: URL, or null if it isn't one. */
export function describeJazzUrl(url: string): string | null {
    const spec = parseJazzUrl(url);
    if (!spec) return null;
    const { def, horn, concert, written } = resolveJazzSpec(spec);
    const pattern = JAZZ_PATTERNS.find(p => p.value === spec.pattern)?.label ?? spec.pattern;
    const range = spec.range === 'full' ? 'full range' : `${spec.range} oct`;
    const reps = spec.reps > 1 ? ` ×${spec.reps}` : '';
    const keys = spec.domain === 'concert'
        ? `${rootPretty(concert)} concert → ${rootPretty(written)} written`
        : `${rootPretty(written)} written → ${rootPretty(concert)} concert`;
    return `${rootPretty(concert)} ${def.label} · ${pattern} · ${range} · ${spec.rhythm}${reps}`
        + ` · ${horn.label.split(' ')[0]} (${keys})`;
}

/** The degrees of the exercise's scale, spelled on its written root. */
export function jazzScaleSpelling(spec: JazzSpec): Array<{ degree: string; name: string }> {
    const { def, written } = resolveJazzSpec(spec);
    return def.degrees.map(d => {
        const { letterStep, semitones } = degreeParts(d);
        const letter = letterAt(written.letter, letterStep);
        const alter = centreAlter((rootPc(written) + semitones) % 12 - STEP_PC[letter]);
        return { degree: degreePretty(d), name: letter + (PRETTY_ALTER[alter] ?? '') };
    });
}

/** MEI for a spec: one treble staff in written pitch, 4/4, with a count-in. */
export function generateJazzMei(spec: JazzSpec): string {
    const resolved = resolveJazzSpec(spec);
    const { notes, fifths } = resolved;
    let counter = 0;
    const nextId = () => `jz${++counter}`;

    const accent = spec.artic ? accents(notes) : notes.map(() => false);
    const measures: Array<Array<Beat<Artic>>> = layoutRun(
        notes.map((n, i) => ({ pitches: [n.pitch], data: { accent: accent[i] } })),
        spec.rhythm,
        nextId,
    );

    // The layout hands back items in order; the first item of each event is
    // the one control events attach to (a stretched final note is tied).
    const eventIds: string[] = [];
    const measureOfId = new Map<string, number>();
    measures.forEach((beats, m) => beats.forEach(b => b.items.forEach(it => {
        measureOfId.set(it.id, m);
        if (it.first) eventIds.push(it.id);
        if (it.data.accent && it.first) it.attrs = ' artic="acc"';
    })));

    // Jazz articulation: tongue the "and", slur it into the downbeat. Only
    // meaningful when the line actually runs in eighths.
    const slurs: string[][] = measures.map(() => []);
    if (spec.artic && spec.rhythm === 'eighths') {
        for (let i = 1; i < eventIds.length; i += 2) {
            const start = eventIds[i];
            const end = eventIds[i + 1];
            if (!end) break;
            const m = measureOfId.get(start);
            if (m === undefined) continue;
            slurs[m].push(`<slur staff="1" startid="#${start}" endid="#${end}" />`);
        }
    }

    const body = measures.map((beats, m) => {
        const accidState = newAccidState();
        const inner = beats.map(b => serializeBeat(b, accidState, fifths)).join('');
        const right = m === measures.length - 1 ? ' right="end"' : '';
        return `<measure n="${m + 1}"${right}><staff n="1"><layer n="1">${inner}</layer></staff>${slurs[m].join('')}</measure>`;
    });

    const keySig = fifths !== 0
        ? `<keySig sig="${fifths > 0 ? `${fifths}s` : `${-fifths}f`}" />`
        : '';
    const title = describeJazzUrl(buildJazzUrl(spec)) ?? 'Jazz exercise';

    return `<?xml version='1.0' encoding='UTF-8'?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead>
    <fileDesc>
      <titleStmt><title>${title}</title><respStmt /></titleStmt>
      <pubStmt />
    </fileDesc>
  </meiHead>
  <music><body><mdiv><score>
    <scoreDef>
      <staffGrp>
        <staffDef n="1" lines="5"><clef shape="G" line="2" />${keySig}<meterSig count="4" unit="4" /></staffDef>
      </staffGrp>
    </scoreDef>
    <section>
      <measure n="0">
        <staff n="1"><layer n="1"><rest dur="4" /></layer></staff>
      </measure>
      ${body.join('\n      ')}
    </section>
  </score></mdiv></body></music>
</mei>`;
}

/** Data URL serving the generated MEI (fetch() handles data: natively). */
export function jazzDataUrl(spec: JazzSpec): string {
    return `data:application/xml;charset=utf-8,${encodeURIComponent(generateJazzMei(spec))}`;
}

/** Default spec for the builder UI: alto, B♭ bebop dominant, full range. */
export function defaultJazzSpec(): JazzSpec {
    return {
        root: 'Bb', domain: 'concert', scale: 'bebopdom', pattern: 'scalar',
        range: 'full', rhythm: 'eighths', reps: 1, horn: 'alto',
        artic: true, highFs: false,
    };
}

export { rootText as jazzRootText };

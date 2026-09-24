import type { TimemapData } from '../utils/timemap';
import { TONE_PPQ } from '../utils/timemap';
import { barBoundaries } from '../utils/loopRange';
import { extractMelody } from '../utils/earTraining';

/**
 * The rhythm games' material: a level is a line of notes, each with a start
 * and a length in beats (quarter notes) from the first downbeat. A note's
 * length is the thing the games are about — the Slingshot holds it — so
 * rests are simply the gaps between notes.
 *
 * Levels come from two places: short lessons written as note values here,
 * one idea each; and any piece in the library, whose melody becomes the
 * level (levelFromTimemap) — so a game can teach the rhythm of a piece before
 * it is played on an instrument. Pure, for the node checks.
 */

export interface RhythmNote {
    /** Beats from the level's first downbeat. */
    start: number;
    /** Beats. */
    dur: number;
    /** A pitch to sound while the note is held (the piece's own, for songs). */
    midi?: number;
    /** The note's id in the level's notation, to colour it in the results. */
    id?: string;
}

export interface RhythmLevel {
    id: string;
    title: string;
    /** One line: what the level teaches, or where the piece comes from. */
    detail: string;
    /** Quarter notes a minute. */
    bpm: number;
    beatsPerBar: number;
    /** Beat unit of the time signature, for the notation. */
    meter: { count: number; unit: number };
    notes: RhythmNote[];
    /** Beats, first downbeat to the level's end. */
    length: number;
    /** The rest of the music, played along while the notes are the player's:
     *  a song's other parts, a lesson's chords (the Conductor's piano). */
    backing?: RhythmNote[];
    source:
        | { kind: 'lesson'; mei: string }
        | { kind: 'song'; songKey: string; instrument: 'piano' | 'saxo'; mei: string; measureRange: string };
}

// ------------------------------------------------------------- lessons

/**
 * The pitch a lesson's notes sound at: C3, low and warm — a C5 tone went
 * shrill over a whole lesson. (A2 = 45 is nicer still through headphones,
 * but thin on laptop speakers.) Songs sound at their own pitches.
 */
export const LESSON_PITCH = 48;

/** Note values the lessons are written in: w h. h q. q e, and the same + "r" for a rest. */
const VALUES: Record<string, number> = { w: 4, 'h.': 3, h: 2, 'q.': 1.5, q: 1, e: 0.5 };
const MEI_DUR: Record<string, { dur: string; dots?: number }> = {
    w: { dur: '1' }, 'h.': { dur: '2', dots: 1 }, h: { dur: '2' }, 'q.': { dur: '4', dots: 1 }, q: { dur: '4' }, e: { dur: '8' },
};

/** "C4" → 60, "F#3" → 54, "Bb3" → 58. */
export function pitchOf(name: string): number {
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
    if (!m) throw new Error(`Unknown pitch "${name}"`);
    const pc = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase() as 'c'];
    return (parseInt(m[3], 10) + 1) * 12 + pc + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** "C4 E4 G4" → MIDI pitches. */
export function tune(names: string): number[] {
    return names.split(/[\s|]+/).filter(Boolean).map(pitchOf);
}

/** How a pitch is written: 61 → c♯4. Sharps for the black keys. */
export function spell(midi: number): { pname: string; oct: number; accid?: 's' } {
    const names = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
    const pc = ((midi % 12) + 12) % 12;
    return { pname: names[pc], oct: Math.floor(midi / 12) - 1, ...([1, 3, 6, 8, 10].includes(pc) ? { accid: 's' as const } : {}) };
}

/**
 * "h hr | q q q qr" → notes, checked to fill each bar exactly. `pitch` is one
 * pitch for every note, or a tune: one pitch per note, in order.
 */
export function parseBars(bars: string, beatsPerBar: number, pitch: number | number[] = LESSON_PITCH): { notes: RhythmNote[]; length: number } {
    const notes: RhythmNote[] = [];
    let at = 0;
    bars.split('|').forEach((bar, b) => {
        let inBar = 0;
        for (const token of bar.trim().split(/\s+/).filter(Boolean)) {
            const rest = token.endsWith('r');
            const value = rest ? token.slice(0, -1) : token;
            const beats = VALUES[value];
            if (beats === undefined) throw new Error(`Unknown note value "${token}"`);
            if (!rest) {
                const midi = typeof pitch === 'number' ? pitch : pitch[notes.length];
                if (midi === undefined) throw new Error(`The tune has ${notes.length} pitches, and the rhythm more notes`);
                notes.push({ start: at + inBar, dur: beats, midi, id: `g-${notes.length}` });
            }
            inBar += beats;
        }
        if (Math.abs(inBar - beatsPerBar) > 1e-9) throw new Error(`Bar ${b + 1} has ${inBar} beats, not ${beatsPerBar}`);
        at += inBar;
    });
    if (typeof pitch !== 'number' && pitch.length !== notes.length) throw new Error(`The tune has ${pitch.length} pitches for ${notes.length} notes`);
    return { notes, length: at };
}

/**
 * A lesson's notation, one note head per note, ids g-0, g-1…: on a one-line
 * rhythm staff, or — given the tune — on a real staff at its pitches, in the
 * clef the tune sits best in.
 */
export function lessonMei(bars: string, meter: { count: number; unit: number }, pitches?: number[]): string {
    let noteIndex = 0;
    const sorted = pitches ? [...pitches].sort((a, b) => a - b) : [];
    const treble = !pitches || sorted[Math.floor(sorted.length / 2)] >= 57;
    const measures = bars.split('|').map((bar, b) => {
        const events = bar.trim().split(/\s+/).filter(Boolean).map(token => {
            const rest = token.endsWith('r');
            const v = MEI_DUR[rest ? token.slice(0, -1) : token];
            const dots = v.dots ? ` dots="${v.dots}"` : '';
            if (rest) return `<rest dur="${v.dur}"${dots}/>`;
            const p = pitches ? spell(pitches[noteIndex]) : { pname: 'c', oct: 5 };
            const accid = 'accid' in p && p.accid ? ` accid="${p.accid}"` : '';
            return `<note xml:id="g-${noteIndex++}" dur="${v.dur}"${dots} pname="${p.pname}" oct="${p.oct}"${accid}/>`;
        }).join('');
        return `<measure n="${b + 1}"><staff n="1"><layer n="1">${events}</layer></staff></measure>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1"><meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
<music><body><mdiv><score><scoreDef meter.count="${meter.count}" meter.unit="${meter.unit}"><staffGrp>
${pitches ? `<staffDef n="1" lines="5" clef.shape="${treble ? 'G' : 'F'}" clef.line="${treble ? 2 : 4}"/>` : '<staffDef n="1" lines="1" clef.shape="perc" clef.line="1"/>'}</staffGrp></scoreDef><section>${measures}</section></score></mdiv></body></music></mei>`;
}

/** A lesson: its rhythm, and — for the games that sing it — its tune. */
export function rhythmLesson(
    id: string, title: string, detail: string, bpm: number, meter: { count: number; unit: number }, bars: string, pitches?: number[],
): RhythmLevel {
    const beatsPerBar = meter.count * (4 / meter.unit);
    const { notes, length } = parseBars(bars, beatsPerBar, pitches ?? LESSON_PITCH);
    return { id, title, detail, bpm, beatsPerBar, meter, notes, length, source: { kind: 'lesson', mei: lessonMei(bars, meter, pitches) } };
}

/** The lesson ladder: one idea each, in order. */
export const LESSONS: RhythmLevel[] = [
    rhythmLesson('halves', 'Hold on', 'Half notes: hold for two beats, let go for two.', 84, { count: 4, unit: 4 },
        'h hr | h hr | h hr | h hr | h hr | h hr | h hr | h hr'),
    rhythmLesson('quarters', 'One beat each', 'Quarter notes, one beat long, with a breath between.', 84, { count: 4, unit: 4 },
        'q qr q qr | q qr q qr | q q q qr | q q q qr | q qr q qr | q q q qr | q q q q | h hr'),
    rhythmLesson('longs', 'The long one', 'Whole notes and halves: four beats, then two.', 88, { count: 4, unit: 4 },
        'w | h hr | w | h h | w | h hr | h h | w'),
    rhythmLesson('waltz', 'Waltz', 'Three beats to the bar: dotted halves, halves and quarters.', 100, { count: 3, unit: 4 },
        'h. | h q | h. | q q qr | h. | h q | q q q | h.'),
    rhythmLesson('eighths', 'Twice as fast', 'Eighth notes: two to a beat.', 76, { count: 4, unit: 4 },
        'e e q e e q | e e e e q qr | e e q e e q | e e e e h'),
    rhythmLesson('dotted', 'The dot', 'A dot adds half: a dotted quarter lasts a beat and a half.', 80, { count: 4, unit: 4 },
        'q. e h | q. e q qr | q. e q. e | h hr | q. e h | q. e q qr | q. e q. e | w'),
];

// ------------------------------------------------------------- songs

/**
 * A level from a piece: its top line (the melody — extractMelody, as in
 * Learn by ear), in beats from its first bar, up to `maxBars` bars. Each
 * note keeps its pitch and its id in the score, so the results can colour
 * the real notation. The piece's other notes in those bars come back as the
 * backing.
 */
export function levelFromTimemap(timemap: TimemapData, maxBars: number): {
    notes: RhythmNote[]; backing: RhythmNote[]; beatsPerBar: number; bars: number; length: number; bpm: number;
} {
    const bounds = barBoundaries(timemap);
    const barCount = bounds.length - 1;
    const bars = Math.min(maxBars, barCount);
    const start = bounds[0];
    const end = bounds[bars];
    // The bar length of a full bar (the first may be a pickup).
    const barTicks = barCount > 1 ? bounds[2] - bounds[1] : bounds[1] - bounds[0];
    const notes = extractMelody(timemap, 1)
        .filter(n => n.tick >= start && n.tick < end)
        .map(n => ({
            start: (n.tick - start) / TONE_PPQ,
            dur: (Math.min(n.endTick, end) - n.tick) / TONE_PPQ,
            midi: n.midi,
            id: n.id,
        }))
        .filter(n => n.dur > 0);
    // Everything else in those bars: the accompaniment.
    const melodyIds = new Set(notes.map(n => n.id));
    const backing: RhythmNote[] = [];
    for (const o of timemap.onsets) {
        if (o.tick < start || o.tick >= end) continue;
        for (const n of o.notes) {
            if (n.id && melodyIds.has(n.id)) continue;
            const dur = (Math.min(n.endTick, end) - o.tick) / TONE_PPQ;
            if (dur > 0) backing.push({ start: (o.tick - start) / TONE_PPQ, dur, midi: n.midi, id: n.id });
        }
    }
    return {
        notes,
        backing,
        beatsPerBar: barTicks / TONE_PPQ,
        bars,
        length: (end - start) / TONE_PPQ,
        bpm: timemap.tempo?.initial?.bpm ?? 96,
    };
}

/** The pieces offered as song levels: short, well known, one line. */
export const SONGS: Array<{ songKey: string; title: string; instrument: 'saxo' | 'piano' }> = [
    { songKey: 'saxo/public_domain/Twinkle Twinkle.mei', title: 'Twinkle Twinkle', instrument: 'saxo' },
    { songKey: 'saxo/public_domain/Ode to Joy.mei', title: 'Ode to Joy', instrument: 'saxo' },
    { songKey: 'saxo/public_domain/015_Deutsches_Volkslied_-_Hänschen_klein.mei', title: 'Hänschen klein', instrument: 'saxo' },
    { songKey: 'saxo/public_domain/014_Skandinavisches_Volkslied_-_Gubben_Noak.mei', title: 'Gubben Noak', instrument: 'saxo' },
    { songKey: 'saxo/public_domain/Scarborough Fair.mei', title: 'Scarborough Fair', instrument: 'saxo' },
];

/** Bars a song level covers: the whole piece when it is short, else the opening. */
export const SONG_LEVEL_BARS = 12;

// ------------------------------------------------------------- note shapes

/** How a length is written: the head, stem, flags and dot of its note. */
export interface NoteShape {
    /** 'open' heads for wholes and halves, 'filled' for quarters and shorter. */
    head: 'open' | 'filled';
    stem: boolean;
    flags: 0 | 1 | 2;
    dotted: boolean;
    /** The name, for a tooltip or a screen reader. */
    name: string;
}

const SHAPES: Array<[number, NoteShape]> = [
    [4, { head: 'open', stem: false, flags: 0, dotted: false, name: 'whole note' }],
    [3, { head: 'open', stem: true, flags: 0, dotted: true, name: 'dotted half note' }],
    [2, { head: 'open', stem: true, flags: 0, dotted: false, name: 'half note' }],
    [1.5, { head: 'filled', stem: true, flags: 0, dotted: true, name: 'dotted quarter note' }],
    [1, { head: 'filled', stem: true, flags: 0, dotted: false, name: 'quarter note' }],
    [0.75, { head: 'filled', stem: true, flags: 1, dotted: true, name: 'dotted eighth note' }],
    [0.5, { head: 'filled', stem: true, flags: 1, dotted: false, name: 'eighth note' }],
    [0.25, { head: 'filled', stem: true, flags: 2, dotted: false, name: 'sixteenth note' }],
];

/**
 * The note that is written for a length in beats. A length no single note
 * writes takes the shortest plain value at least as long — the way tuplets
 * are written (a triplet eighth is an eighth under a 3) — and anything past a
 * whole note is a whole. The orbit's arc still shows the true length.
 */
export function noteShape(beats: number): NoteShape {
    const exact = SHAPES.find(([b]) => Math.abs(b - beats) < 1e-6);
    if (exact) return exact[1];
    if (beats >= 4) return SHAPES[0][1];
    const plain = SHAPES.filter(([, s]) => !s.dotted).reverse();   // shortest first
    return (plain.find(([b]) => b >= beats) ?? SHAPES[0])[1];
}

import type { TimemapData } from '../utils/timemap';
import { TONE_PPQ } from '../utils/timemap';
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
    /**
     * The beat as it is counted and conducted, in quarter notes: 1 unless
     * the metre says otherwise — in 6/8 an eighth (0.5), or a dotted
     * quarter (1.5) when the tune goes fast enough to feel two in a bar
     * (pulseOf).
     */
    pulse?: number;
    /**
     * Where each bar begins, in quarter notes from the level's start, as
     * written: a song's first bar may be a pickup, and a strain may end or
     * begin with a short one. Without it, bars of beatsPerBar from 0.
     */
    barLines?: number[];
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
 * The bars of a piece as written, in ticks: where each is in the timemap,
 * and where it falls once the repeats are left out. Verovio's timemap plays
 * a repeat a second time (the copies' ids end "-rend2") — and a repeat that
 * goes back to the start takes the count-in bar the viewers add with it. A
 * level follows the notation, so it keeps the first time through only. The
 * count-in itself is left out, as barBoundaries leaves it out.
 */
export function writtenBars(timemap: TimemapData): Array<{ from: number; to: number; at: number }> {
    const starts = [...timemap.measureTicks.entries()].sort((a, b) => a[1] - b[1]);
    const out: Array<{ from: number; to: number; at: number }> = [];
    let at = 0;
    starts.forEach(([id, from], i) => {
        const to = starts[i + 1]?.[1] ?? timemap.totalTicks;
        if (i === 0 && starts.length > 1) return;
        if (/-rend\d+$/.test(id) || to <= from) return;
        out.push({ from, to, at });
        at += to - from;
    });
    return out;
}

/**
 * A level from a piece: its top line (the melody — extractMelody, as in
 * Learn by ear), in beats from its first bar, up to `maxBars` bars as
 * written (writtenBars). Each note keeps its pitch and its id in the score,
 * so the results can colour the real notation. The piece's other notes in
 * those bars come back as the backing, and `barLines` says where each bar
 * begins (a first bar shorter than the rest is a pickup).
 */
export function levelFromTimemap(timemap: TimemapData, maxBars: number): {
    notes: RhythmNote[]; backing: RhythmNote[]; beatsPerBar: number; bars: number; length: number; bpm: number; barLines: number[];
} {
    const all = writtenBars(timemap);
    const kept = all.slice(0, maxBars);
    const end = kept.length ? kept[kept.length - 1].at + kept[kept.length - 1].to - kept[kept.length - 1].from : 0;
    // The bar length of a full bar (the first may be a pickup).
    const barTicks = all.length > 1 ? all[1].to - all[1].from : all.length ? all[0].to - all[0].from : TONE_PPQ * 4;
    /** A tick of the timemap, as written — or null outside the kept bars. */
    const place = (tick: number): number | null => {
        const bar = kept.find(b => tick >= b.from && tick < b.to);
        return bar ? bar.at + tick - bar.from : null;
    };
    const notes: RhythmNote[] = [];
    for (const n of extractMelody(timemap, 1)) {
        const at = place(n.tick);
        if (at === null) continue;
        const dur = (Math.min(at + n.endTick - n.tick, end) - at) / TONE_PPQ;
        if (dur > 0) notes.push({ start: at / TONE_PPQ, dur, midi: n.midi, id: n.id });
    }
    // Everything else in those bars: the accompaniment.
    const melodyIds = new Set(notes.map(n => n.id));
    const backing: RhythmNote[] = [];
    for (const o of timemap.onsets) {
        const at = place(o.tick);
        if (at === null) continue;
        for (const n of o.notes) {
            if (n.id && melodyIds.has(n.id)) continue;
            const dur = (Math.min(at + n.endTick - o.tick, end) - at) / TONE_PPQ;
            if (dur > 0) backing.push({ start: at / TONE_PPQ, dur, midi: n.midi, id: n.id });
        }
    }
    return {
        notes,
        backing,
        beatsPerBar: barTicks / TONE_PPQ,
        bars: kept.length,
        length: end / TONE_PPQ,
        bpm: timemap.tempo?.initial?.bpm ?? 96,
        barLines: kept.map(b => b.at / TONE_PPQ),
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

/** A tune from the English folk collection of the saxophone library. */
export const folkSong = (file: string, title: string) => ({ songKey: `saxo/english_folk/${file}.mei`, title, instrument: 'saxo' as const });

/**
 * English folk tunes for the Slingshot: the ones whose quickest notes can
 * still be held one by one (a sixteenth at 100 is the quickest).
 */
export const FOLK_SONGS = [
    folkSong('1770_God Save the King. BC.02', 'God Save the King'),
    folkSong('1875_Pop Goes the Weasel  WES.044', 'Pop Goes the Weasel'),
    folkSong('1795_Ham Frolick. VWMLa.166', 'Ham Frolick'),
    folkSong("1825_Aire de l'Opera Francoise JBut.485", "Aire de l'Opéra françoise"),
    folkSong('1834_Auld Lang Syne. BF12.25', 'Auld Lang Syne'),
];

/**
 * The beat of a metre, as it is counted, in quarter notes (see
 * RhythmLevel.pulse). Compound metres (6/8, 9/8, 12/8) count dotted
 * quarters when those go at 50 a minute or more, and eighths — "in six" —
 * when slower; other eighth metres count eighths. The rest count quarters,
 * as the lessons do.
 */
export function pulseOf(meter: { count: number; unit: number }, bpm: number): number {
    if (meter.unit !== 8) return 1;
    if (meter.count % 3 === 0 && meter.count > 3 && bpm / 1.5 >= 50) return 1.5;
    return 0.5;
}

/** "♩ = 96", or in 6/8 "♪ = 120", "♩. = 72": the counted beat and its tempo, from quarters a minute. */
export function tempoMark(bpm: number, pulse = 1): string {
    const note = pulse === 0.5 ? '♪' : pulse === 1.5 ? '♩.' : '♩';
    return `${note} = ${Math.round(bpm / pulse)}`;
}

/** A beat of a level, as it is counted. */
export interface CountedBeat {
    /** Quarter notes from the level's start (the first may be before it: see countingOf). */
    start: number;
    /** Quarter notes: the pulse, or less at the end of a short bar. */
    length: number;
    /** Where it is in its bar, 0 for the downbeat. */
    inBar: number;
    /** The written bar it begins in, from 1. */
    bar: number;
}

/** How a level is counted: its beats, laid on its bar lines. */
export interface Counting {
    /** The beat, in quarter notes. */
    pulse: number;
    /** Beats in a full bar. */
    beatsPerBar: number;
    /**
     * Every beat, bar by bar from each bar line. A pickup is counted back
     * from the bar line after it, so an eighth before a bar of 2/4 is the
     * second half of a beat that begins before the level does.
     */
    beats: CountedBeat[];
    /** Beats to count in before the first: a bar, less the pickup's beats; a bar more when that is under three. */
    countIn: number;
    /** Where the k-th beat is in its bar — counting on before the first (the count-in, k < 0) and after the last. */
    inBar(k: number): number;
    bars: number;
}

export function countingOf(level: Pick<RhythmLevel, 'beatsPerBar' | 'length' | 'pulse' | 'barLines'>): Counting {
    const eps = 1e-6;
    const pulse = level.pulse ?? 1;
    const barQ = level.beatsPerBar > 0 ? level.beatsPerBar : level.length;
    const beatsPerBar = Math.max(1, Math.round(barQ / pulse));
    const written = level.barLines ?? Array.from({ length: Math.max(1, Math.ceil(level.length / barQ - eps)) }, (_, b) => b * barQ);
    const endOf = (lines: number[], b: number) => (b + 1 < lines.length ? lines[b + 1] : level.length);
    // A strain that ends on a short bar and a next one whose pickup makes it up (a bar and a half of
    // 2/4, then an eighth): counted as one bar, as a conductor beats through the double bar.
    const lines = written.filter((from, b) => !(b >= 2 && from - written[b - 1] < barQ - eps && endOf(written, b) - from < barQ - eps
        && endOf(written, b) - written[b - 1] <= barQ + eps));
    /** The written bar a point is in, from 1. */
    const barAt = (pos: number) => Math.max(1, written.filter(t => t <= pos + eps).length);
    const beats: CountedBeat[] = [];
    let pickupBeats = 0;
    lines.forEach((from, b) => {
        const to = endOf(lines, b);
        if (to <= from + eps) return;
        const n = Math.ceil((to - from) / pulse - eps);
        if (b === 0 && lines.length > 1 && to - from < barQ - eps) {
            // A pickup: its beats end on the bar line, as the bar's last ones.
            pickupBeats = n;
            for (let k = n; k >= 1; k--) beats.push({ start: to - k * pulse, length: pulse, inBar: Math.max(0, beatsPerBar - k), bar: 1 });
            return;
        }
        for (let k = 0; k < n; k++) {
            const start = from + k * pulse;
            beats.push({ start, length: Math.min(pulse, to - start), inBar: k, bar: barAt(start) });
        }
    });
    let countIn = beatsPerBar - pickupBeats;
    while (countIn < 3) countIn += beatsPerBar;
    const wrap = (i: number) => ((i % beatsPerBar) + beatsPerBar) % beatsPerBar;
    const inBar = (k: number) => {
        if (beats.length === 0) return wrap(k);
        if (k < 0) return wrap(beats[0].inBar + k);
        if (k >= beats.length) return wrap(beats[beats.length - 1].inBar + k - beats.length + 1);
        return beats[k].inBar;
    };
    return { pulse, beatsPerBar, beats, countIn, inBar, bars: written.filter(t => t < level.length - eps).length || 1 };
}

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

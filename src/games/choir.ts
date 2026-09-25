import { PRESS, RELEASE, grade, noteGrade, summarize, type Grade, type NoteResult, type Summary, type Windows } from './judge';
import { countingOf, folkSong, rhythmLesson, tune, type CountedBeat, type RhythmLevel, type RhythmNote } from './rhythm';

/**
 * The Conductor — conduct the choir, a beat at a time. Every pitch of the
 * tune has its singer, standing low to high like the keys of a piano. Each
 * hold of the button is one beat (in 6/8 an eighth, or a dotted quarter
 * when the tune is quick: RhythmLevel.pulse), whatever the notes: while you hold, the
 * song moves on at the piece's tempo and whoever has a note in that beat
 * sings it — two eighths, two singers; a half note, the same singer over
 * two holds. A ring on the singer fills as the beat goes by: let go as it
 * closes and press straight away for the next. The song follows you: let go
 * early and the beat is cut short (the singer is left surprised); hold on
 * and the song waits on that beat while the singer, reddening, holds the
 * note. A piano plays along. Pure, for the node checks; the game is
 * components/games/ConductorGame.tsx.
 */

// ------------------------------------------------------------- chords

const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "Am" → the pitch classes of its triad, root first; "G7" adds the seventh. */
export function chordTones(symbol: string): number[] {
    const m = /^([A-G])([#b]?)(m?)(7?)$/.exec(symbol.trim());
    if (!m) throw new Error(`Unknown chord "${symbol}"`);
    const root = (ROOTS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    const tones = [root, root + (m[3] ? 3 : 4), root + 7];
    if (m[4]) tones.push(root + 10);
    return tones.map(t => t % 12);
}

/**
 * A lesson's piano: "C | Am | F G | C" — a chord a bar, or several sharing
 * it evenly. Each is the root low (octave 2) and the chord above it, close,
 * in octave 3: under a tune around C4.
 */
export function chordBacking(chords: string, beatsPerBar: number): RhythmNote[] {
    const out: RhythmNote[] = [];
    chords.split('|').forEach((bar, b) => {
        const symbols = bar.trim().split(/\s+/).filter(Boolean);
        const each = beatsPerBar / symbols.length;
        symbols.forEach((symbol, k) => {
            const tones = chordTones(symbol);
            const start = b * beatsPerBar + k * each;
            out.push({ start, dur: each, midi: 36 + tones[0] });
            for (const pc of tones) out.push({ start, dur: each, midi: 48 + pc });
        });
    });
    return out;
}

// ------------------------------------------------------------- lessons

function choirLesson(
    id: string, title: string, detail: string, bpm: number, meter: { count: number; unit: number },
    bars: string, melody: string, chords: string,
): RhythmLevel {
    const level = rhythmLesson(id, title, detail, bpm, meter, bars, tune(melody));
    const backing = chordBacking(chords, level.beatsPerBar);
    const barsOfChords = chords.split('|').length;
    if (barsOfChords * level.beatsPerBar !== level.length) {
        throw new Error(`${id}: ${barsOfChords} bars of chords for ${level.length / level.beatsPerBar} bars of tune`);
    }
    return { ...level, backing };
}

/** The same ladder as the Slingshot's lessons, each rhythm given a tune. */
export const CHOIR_LESSONS: RhythmLevel[] = [
    choirLesson('first-voices', 'First voices', 'One hold, one beat. A half note is two holds; keep beating through the rests.', 80, { count: 4, unit: 4 },
        'h hr | h hr | h hr | h hr | h hr | h hr | h hr | h hr',
        'C4 | E4 | G4 | E4 | C4 | E4 | G4 | C4',
        'C | Am | C | Am | F | C | G | C'),
    choirLesson('one-beat', 'One beat each', 'Quarter notes: every hold is a note.', 84, { count: 4, unit: 4 },
        'q qr q qr | q qr q qr | q q q qr | q q q qr | q qr q qr | q q q qr | q q q q | h hr',
        'C4 E4 | G4 E4 | C4 D4 E4 | G4 F4 E4 | D4 B3 | C4 D4 E4 | F4 E4 D4 B3 | C4',
        'C | C | C | C | G | C | G7 | C'),
    choirLesson('basses', 'The basses', 'Whole notes, down low: four holds on one note, and the singer never stops.', 88, { count: 4, unit: 4 },
        'w | h hr | w | h h | w | h hr | h h | w',
        'C4 | G3 | A3 | F3 G3 | C4 | E4 | D4 B3 | C4',
        'C | G | Am | F G | C | C | G | C'),
    choirLesson('waltz', 'Choir waltz', 'Three beats to the bar, and a high C.', 96, { count: 3, unit: 4 },
        'h. | h q | h. | q q qr | h. | h q | q q q | h.',
        'C4 | E4 G4 | C5 | B4 A4 | G4 | F4 D4 | E4 D4 B3 | C4',
        'C | C | C | G | C | Dm | G | C'),
    choirLesson('runs', 'Running notes', 'Eighth notes: two singers in one beat. The hold is still one beat.', 76, { count: 4, unit: 4 },
        'e e q e e q | e e e e q qr | e e q e e q | e e e e h',
        'C4 D4 E4 E4 F4 G4 | G4 F4 E4 D4 C4 | C4 D4 E4 E4 F4 G4 | A4 G4 F4 E4 C4',
        'C | G C | C | F C'),
    choirLesson('dotted', 'The dot', 'A dotted quarter carries on into the next beat, and the note changes mid-hold.', 80, { count: 4, unit: 4 },
        'q. e h | q. e q qr | q. e q. e | h hr | q. e h | q. e q qr | q. e q. e | w',
        'G3 C4 E4 | D4 C4 D4 | E4 D4 C4 B3 | C4 | G3 C4 E4 | D4 C4 D4 | E4 F4 G4 B3 | C4',
        'C | G | C G | C | C | G | C G | C'),
];

// ------------------------------------------------------------- songs

/** Folk songs from the piano library: the choir sings the tune, the piano plays its left hand. */
export const CHOIR_SONGS: Array<{ songKey: string; title: string; instrument: 'piano' | 'saxo' }> = [
    { songKey: 'piano/first_two_hand_exercises/015_Deutsches_Volkslied_-_Hänschen_klein.mei', title: 'Hänschen klein', instrument: 'piano' },
    { songKey: 'piano/first_two_hand_exercises/018_Deutsches_Volkslied_-_Summ_summ_summ.mei', title: 'Summ, summ, summ', instrument: 'piano' },
    { songKey: 'piano/first_two_hand_exercises/017_Deutsches_Volkslied_-_Kuckuck_kuckuck.mei', title: 'Kuckuck, Kuckuck', instrument: 'piano' },
    { songKey: 'piano/first_two_hand_exercises/022_Deutsches_Volkslied_-_Hänsel_und_Gretel.mei', title: 'Hänsel und Gretel', instrument: 'piano' },
    { songKey: 'piano/first_two_hand_exercises/023_Deutsches_Volkslied_-_Schlaf_Kindchen_schlaf.mei', title: 'Schlaf, Kindchen, schlaf', instrument: 'piano' },
    { songKey: 'piano/first_two_hand_exercises/014_Skandinavisches_Volkslied_-_Gubben_Noak.mei', title: 'Gubben Noak', instrument: 'piano' },
];

/**
 * English folk tunes, sung a cappella: a single line, so the choir alone.
 * The choir sings the quick notes itself — a hold is still one beat — so
 * the fast tunes the Slingshot leaves out are here.
 */
export const CHOIR_FOLK_SONGS = [
    folkSong('1770_God Save the King. BC.02', 'God Save the King'),
    folkSong('1834_Auld Lang Syne. BF12.25', 'Auld Lang Syne'),
    folkSong('1953_Drunken Sailor,The. FTB.148', 'The Drunken Sailor'),
    folkSong('1875_Pop Goes the Weasel  WES.044', 'Pop Goes the Weasel'),
    folkSong('1875_Yankee Doodle WES.057', 'Yankee Doodle'),
    folkSong('1875_Camptown Races WES.046', 'Camptown Races'),
    folkSong('1795_Ham Frolick. VWMLa.166', 'Ham Frolick'),
    folkSong('1810_British Grenadiers. RH.171', 'The British Grenadiers'),
    folkSong('1820_Ronda. ST.06', 'Ronda'),
    folkSong("1825_Aire de l'Opera Francoise JBut.485", "Aire de l'Opéra françoise"),
];

// ------------------------------------------------------------- the choir

export interface Singer {
    /** The pitch this singer sings, as the choir sings it (choirShift applied). */
    midi: number;
    /** "C", "F♯" — written on the robe. */
    name: string;
    /** 0 for the lowest voice, 1 for the highest: its colour, low warm to high bright. */
    height: number;
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function noteName(midi: number): string {
    return NAMES[((midi % 12) + 12) % 12];
}

/**
 * Octaves to move a tune by so a choir sings it comfortably — its middle
 * between A2 and E5. Most tunes are left alone.
 */
export function choirShift(notes: RhythmNote[]): number {
    const pitches = notes.map(n => n.midi).filter((m): m is number => m !== undefined).sort((a, b) => a - b);
    if (pitches.length === 0) return 0;
    let mid = pitches[Math.floor(pitches.length / 2)];
    let shift = 0;
    while (mid > 76) { mid -= 12; shift -= 12; }
    while (mid < 45) { mid += 12; shift += 12; }
    return shift;
}

/** One singer per pitch of the tune, lowest first. */
export function singersOf(notes: RhythmNote[], shift = 0): Singer[] {
    const pitches = [...new Set(notes.map(n => (n.midi ?? 60) + shift))].sort((a, b) => a - b);
    return pitches.map((midi, k) => ({ midi, name: noteName(midi), height: pitches.length > 1 ? k / (pitches.length - 1) : 0.5 }));
}

// ------------------------------------------------------------- conducting, a beat at a time

/** A beat of the level (as countingOf lays them on its bar lines), and what the tune does in it. */
export interface ChoirBeat extends CountedBeat {
    /** Tune notes that begin in this beat, in order. */
    starts: number[];
    /** The tune note already sounding as the beat begins (begun in an earlier beat), or null. */
    held: number | null;
}

/** Every beat of a level, the rests included: a conductor beats through them too. */
export function choirBeats(level: RhythmLevel): ChoirBeat[] {
    const eps = 1e-6;
    return countingOf(level).beats.map(beat => {
        const end = beat.start + beat.length;
        const starts: number[] = [];
        let held: number | null = null;
        level.notes.forEach((n, i) => {
            if (n.start >= beat.start - eps && n.start < end - eps) starts.push(i);
            else if (n.start < beat.start - eps && n.start + n.dur > beat.start + eps) held = i;
        });
        return { ...beat, starts, held };
    });
}

/** The tune note sounding at a point of the song (beats), or null in a rest. */
export function noteAt(level: RhythmLevel, pos: number): number | null {
    let found: number | null = null;
    level.notes.forEach((n, i) => { if (n.start <= pos + 1e-6 && n.start + n.dur > pos + 1e-6) found = i; });
    return found;
}

/** How long a beat is held: judged as a let-go is — the length of it, against the ring. */
export const HOLD: Windows = RELEASE;
/**
 * The let-go that is just right comes a finger's lift before the ring
 * closes, so the next press can land as it does: the hold is judged against
 * that, and letting go right on the ring is as good.
 */
export const LIFT = 0.05;

/**
 * One beat, conducted. `entry` is the press against where the beat falls
 * (± seconds): for the first, the downbeat the count-in leads to; after
 * that, one beat after the last press — so a pause before a beat is simply a
 * late entry. `hold` is how long the beat was held, less its length (− let
 * go early, + held on). Null when there was none.
 */
export function beatResult(entry: number | null, hold: number | null): NoteResult {
    return {
        press: grade(entry, PRESS),
        release: grade(hold === null ? null : hold + LIFT, HOLD),
        pressError: entry,
        releaseError: hold,
    };
}

export interface ConductorSummary extends Summary {
    /** How long the beats were typically held (the median), less a beat and a lift (− early). */
    holdBias: number | null;
    /** How the beats typically came in (the median) against where they fell (+ late: a drag). */
    entryBias: number | null;
    /** Seconds the song ran over (+) or under (−) its written length, as you conducted it. */
    stretch: number;
    /** Beats missed, by what happened: held past the ring, let go early, come in late, come in early. */
    incidents: { heldOn: number; cut: number; lateIn: number; rushed: number };
}

export function summarizeConductor(results: NoteResult[]): ConductorSummary {
    const s = summarize(results);
    // Habits are the median: one pause or one long hold is an incident, not a tendency.
    const median = (xs: number[]) => {
        if (!xs.length) return null;
        const o = [...xs].sort((a, b) => a - b), m = o.length >> 1;
        return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
    };
    const holds = results.map(r => r.releaseError).filter((x): x is number => x !== null).map(h => h + LIFT);
    const entries = results.slice(1).map(r => r.pressError).filter((x): x is number => x !== null);
    // First press to last let-go, against the written beats: every later entry moves the song, and so does how the last beat ends.
    const last = results[results.length - 1]?.releaseError ?? 0;
    const incidents = { heldOn: 0, cut: 0, lateIn: 0, rushed: 0 };
    results.forEach((r, k) => {
        if (r.release === 'miss' && r.releaseError !== null) incidents[r.releaseError + LIFT > 0 ? 'heldOn' : 'cut']++;
        if (k === 0 || r.press !== 'miss' || r.pressError === null) return;
        if (r.pressError < 0) { incidents.rushed++; return; }
        // Late: the choir waited only if the pause did it — after a beat held on, it was still singing.
        const lift = r.pressError - (results[k - 1].releaseError ?? 0);
        if (lift > PRESS.ok) incidents.lateIn++;
    });
    return {
        ...s,
        holdBias: median(holds),
        entryBias: median(entries),
        stretch: entries.reduce((a, b) => a + b, 0) + last,
        incidents,
    };
}

/** One sentence on how the song was conducted, when there is something to say. */
export function conductorTip(s: ConductorSummary): string | null {
    const ms = (x: number) => `${Math.round(Math.abs(x) * 1000)} ms`;
    if (s.holdBias !== null && s.holdBias < -0.07) return `You let go before the ring closes — about ${ms(s.holdBias)} early each beat, and the choir is cut short. Hold until it closes.`;
    if (s.holdBias !== null && s.holdBias > 0.07) return `You hold past the ring — about ${ms(s.holdBias)} each time, and the singers run short of breath. Let go as it closes.`;
    if (s.entryBias !== null && s.entryBias > 0.05) return `Each beat comes in about ${ms(s.entryBias)} late and the song drags. Press again as the ring closes — the lift should be quick.`;
    if (s.entryBias !== null && s.entryBias < -0.05) return `You rush: each beat comes in about ${ms(s.entryBias)} early and the song hurries. Wait for the ring to close.`;
    // No habit, but things happened: say what, and what to do about the commonest.
    const { heldOn, cut, lateIn, rushed } = s.incidents;
    const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
    const said: Array<[number, string, string]> = [
        [heldOn, `a singer ran out of breath ${times(heldOn)}`, 'Let go as the ring closes.'],
        [cut, `the choir was cut off ${times(cut)}`, 'Hold until the ring closes.'],
        [lateIn, `the choir waited for you ${times(lateIn)}`, 'Press again as soon as it closes.'],
        [rushed, `a beat came in early ${times(rushed)}`, 'Wait for the ring to close.'],
    ];
    const happened = said.filter(([n]) => n > 0);
    if (happened.length) {
        const list = happened.map(([, what]) => what);
        const sentence = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
        const advice = [...happened].sort((a, b) => b[0] - a[0])[0][2];
        return `${sentence[0].toUpperCase()}${sentence.slice(1)}. ${advice}`;
    }
    if (s.accuracy >= 0.9) return 'The choir never waited and never ran out of breath. Try the next one at full speed.';
    return null;
}

/** Each tune note, graded by the beats it sounds in (the worst of them), for the notation. */
export function noteGradesFromBeats(level: RhythmLevel, beats: ChoirBeat[], results: NoteResult[]): Array<Grade | null> {
    const order: Grade[] = ['miss', 'ok', 'good', 'perfect'];
    return level.notes.map(n => {
        let worst: Grade | null = null;
        beats.forEach((b, k) => {
            const r = results[k];
            if (!r || n.start >= b.start + b.length - 1e-6 || n.start + n.dur <= b.start + 1e-6) return;
            const g = noteGrade(r);
            if (worst === null || order.indexOf(g) < order.indexOf(worst)) worst = g;
        });
        return worst;
    });
}

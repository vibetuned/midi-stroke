import { noteGrade, summarize, type NoteResult, type Summary } from './judge';
import { lessonMei, parseBars, tune, type RhythmNote } from './rhythm';
import { extractMelody } from '../utils/earTraining';
import { barBoundaries } from '../utils/loopRange';
import { TONE_PPQ, type TimemapData } from '../utils/timemap';

/**
 * Rhythm echo — a canon, relayed. A star sings a line; you are the second
 * voice, a bar or two behind. Every note the star sends flies to a satellite
 * halfway to Earth, arriving just as your voice should sing it: hold as it
 * arrives and let go as it ends, and the satellite beams it down — your
 * note sounds for as long as you hold, so relayed right, the two voices are
 * the canon. Judged press and release (judge.ts), as the Slingshot is.
 *
 * What reaches Earth is the message along the bottom: a green tremolo for a
 * note that got through, a quarter rest for one let go too soon (it never
 * arrived), a tofu box for one held too long (garbled). The star's last
 * notes, the free ending no voice answers, fly as empty circles: they need
 * no relay. Pure, for the node checks; the game is components/games/EchoGame.tsx.
 *
 * Times are in beats from the level's first downbeat; the game counts a bar
 * in before it.
 */

export interface EchoLevel {
    id: string;
    title: string;
    detail: string;
    bpm: number;
    beatsPerBar: number;
    /** The star's voice. */
    calls: RhythmNote[];
    /** Yours: the notes to relay, each with the pitch it sounds at. */
    answers: RhythmNote[];
    /** Bars your voice runs behind the star's. */
    distance: number;
    /** Bars from the first downbeat to the end of the last voice. */
    bars: number;
    /** The notation for the results: the piece, or the lesson written out. */
    notation: { mei: string; measureRange?: string; bars: number };
    songKey?: string;
    instrument?: 'piano' | 'saxo';
    /** How much of your voice imitates the star's, 0–1: 1 for a strict canon. */
    imitation?: number;
}

// ------------------------------------------------------------- building

/** A line as a canon with itself: the star sings it `octave` octaves up, you sing it `distance` bars behind. */
export function canonFromLine(notes: RhythmNote[], beatsPerBar: number, bars: number, distance: number, octave = 1): Pick<EchoLevel, 'calls' | 'answers' | 'distance' | 'bars'> {
    const shift = distance * beatsPerBar;
    return {
        calls: notes.map(n => ({ ...n, midi: n.midi === undefined ? undefined : n.midi + 12 * octave })),
        answers: notes.map(n => ({ ...n, start: n.start + shift })),
        distance,
        bars: bars + distance,
    };
}

/**
 * A two-voice piece as a canon: the voice that starts first is the star's,
 * the other is yours — whatever the staves. Null when both start together
 * (not a canon) or a voice is missing. `imitation` is how many of your
 * onsets the star sang the same distance before: 1 for a strict canon.
 */
export function canonFromTimemap(timemap: TimemapData): (Pick<EchoLevel, 'calls' | 'answers' | 'distance' | 'beatsPerBar' | 'bpm' | 'imitation' | 'bars'>) | null {
    const bounds = barBoundaries(timemap);
    const bars = bounds.length - 1;
    if (bars < 2) return null;
    const start = bounds[0];
    const barTicks = bounds[2] - bounds[1];
    const upper = extractMelody(timemap, 1).filter(n => n.tick >= start), lower = extractMelody(timemap, 2).filter(n => n.tick >= start);
    if (upper.length < 2 || lower.length < 2) return null;
    const [lead, follow] = upper[0].tick <= lower[0].tick ? [upper, lower] : [lower, upper];
    const distance = Math.round((follow[0].tick - lead[0].tick) / barTicks);
    if (distance < 1) return null;
    const beatsPerBar = barTicks / TONE_PPQ;
    const toNote = (n: { tick: number; endTick: number; midi: number; id?: string }): RhythmNote => ({
        start: (n.tick - start) / TONE_PPQ, dur: (n.endTick - n.tick) / TONE_PPQ, midi: n.midi, id: n.id,
    });
    const calls = lead.map(toNote), answers = follow.map(toNote);
    const shift = distance * beatsPerBar;
    const callStarts = new Set(calls.map(n => Math.round((n.start + shift) * 48)));
    const imitation = answers.filter(n => callStarts.has(Math.round(n.start * 48))).length / answers.length;
    return { calls, answers, distance, beatsPerBar, bars, imitation, bpm: timemap.tempo?.initial?.bpm ?? 96 };
}

/** A signal on its way from the star to the satellite, in beats. */
export interface Packet {
    /** When the star sends it. */
    emit: number;
    /** When its head reaches the satellite: when the note should be relayed. */
    arrive: number;
    dur: number;
    /** The answer it is, or null for one of the star's last notes, which need no relay. */
    answer: number | null;
}

/**
 * Every signal of a level. Each answer is a packet, sent a canon's distance
 * before it is due, so it reaches the satellite on time. Any of the star's
 * notes that no answer imitates — the free ending — flies too, hollow.
 */
export function packetsOf(level: EchoLevel): Packet[] {
    const shift = level.distance * level.beatsPerBar;
    const out: Packet[] = level.answers.map((a, k) => ({ emit: a.start - shift, arrive: a.start, dur: a.dur, answer: k }));
    const answered = new Set(level.answers.map(a => Math.round(a.start * 48)));
    for (const c of level.calls) {
        if (!answered.has(Math.round((c.start + shift) * 48))) out.push({ emit: c.start, arrive: c.start + shift, dur: c.dur, answer: null });
    }
    return out.sort((a, b) => a.emit - b.emit);
}

// ------------------------------------------------------------- lessons

function canonLesson(
    id: string, title: string, detail: string, bpm: number, meter: { count: number; unit: number },
    rhythm: string, melody: string, distance: number,
): EchoLevel {
    const beatsPerBar = meter.count * (4 / meter.unit);
    const pitches = tune(melody);
    const { notes } = parseBars(rhythm, beatsPerBar, pitches);
    const bars = rhythm.split('|').length;
    return {
        id, title, detail, bpm, beatsPerBar,
        ...canonFromLine(notes, beatsPerBar, bars, distance),
        notation: { mei: lessonMei(rhythm, meter, pitches), bars },
    };
}

/**
 * The ladder, all canons: a bar behind first, one idea each, then a round
 * everyone knows, then two bars behind. The tunes keep to C, E and G, so
 * the two voices agree however they overlap; the star sings an octave up.
 */
export const CANON_LESSONS: EchoLevel[] = [
    canonLesson('first-relay', 'First relay', 'Half notes and wholes, a bar behind the star. Hold each one as it comes through.', 72, { count: 4, unit: 4 },
        'h h | h h | w | h h | h h | w',
        'C4 E4 | G4 E4 | C4 | E4 G4 | C5 G4 | C4', 1),
    canonLesson('one-beat', 'One beat each', 'Quarter notes: short messages, one a beat.', 80, { count: 4, unit: 4 },
        'q q q q | q q h | q q q q | h h | q q q q | q q h',
        'C4 E4 G4 E4 | C4 G4 E4 | G4 E4 C4 E4 | G4 C5 | C5 G4 E4 G4 | E4 G4 C4', 1),
    canonLesson('silence', 'Radio silence', 'Rests: nothing to send. Let the satellite rest too.', 80, { count: 4, unit: 4 },
        'q qr q qr | h hr | qr q qr q | h h | q q hr | w',
        'C4 E4 | G4 | E4 G4 | C5 G4 | E4 G4 | C4', 1),
    canonLesson('long', 'Long messages', 'Whole notes and dotted halves: hold them all the way through.', 88, { count: 4, unit: 4 },
        'w | h. q | h h | w | h. q | w',
        'C4 | E4 G4 | C5 G4 | E4 | G4 E4 | C4', 1),
    canonLesson('frere-jacques', 'Frère Jacques', 'A round everyone knows. Come in two bars after the star.', 96, { count: 4, unit: 4 },
        'q q q q | q q q q | q q h | q q h | e e e e q q | e e e e q q | q q h | q q h',
        'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4 | E4 F4 G4 | G4 A4 G4 F4 E4 C4 | G4 A4 G4 F4 E4 C4 | C4 G3 C4 | C4 G3 C4', 2),
    canonLesson('chatter', 'Chatter', 'Eighth notes: quick messages, two to a beat.', 76, { count: 4, unit: 4 },
        'e e q e e q | q e e h | e e e e q q | h h | q q e e q | w',
        'C4 E4 G4 E4 G4 C5 | G4 E4 C4 E4 | G4 E4 C4 E4 G4 C5 | G4 C4 | C4 E4 G4 E4 C4 | C4', 1),
    canonLesson('dotted', 'Long, short', 'Dotted rhythms: a long note, then a quick one.', 80, { count: 4, unit: 4 },
        'q. e h | q. e q q | h q. e | w | q. e q. e | w',
        'C4 E4 G4 | E4 C4 E4 G4 | C5 G4 E4 | C4 | E4 G4 E4 G4 | C4', 1),
    canonLesson('waltz', 'Canon in three', 'A waltz, one bar behind.', 88, { count: 3, unit: 4 },
        'h q | q q q | h. | h q | q q q | h.',
        'C4 E4 | G4 E4 C4 | G4 | C5 G4 | E4 G4 E4 | C4', 1),
    canonLesson('two-behind', 'Two bars behind', 'Keep a whole bar in mind while you send the one before it.', 84, { count: 4, unit: 4 },
        'q q h | h q q | w | q q q q | h h | w | q q h | w',
        'C4 E4 G4 | E4 C4 E4 | G4 | C5 G4 E4 G4 | C5 G4 | E4 | G4 E4 C4 | C4', 2),
];

// ------------------------------------------------------------- canons in the library

/** Where the library's canons live: Konrad Max Kunz, 200 short canons, Op. 14. */
export const KUNZ_PATH = 'piano/kunz_op14';

/** The canons in a catalog (the piano library's files.json), in order: "007-canon.mei" → "Kunz · Canon 7". */
export function canonsFrom(catalog: Array<{ path: string; name: string }>): Array<{ songKey: string; title: string; instrument: 'piano' }> {
    return catalog
        .filter(f => f.path === KUNZ_PATH && /\.mei$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map(f => {
            const n = /^0*(\d+)/.exec(f.name)?.[1];
            return { songKey: `${f.path}/${f.name}`, title: n ? `Kunz · Canon ${n}` : f.name.replace(/\.mei$/i, '').replace(/[_-]+/g, ' '), instrument: 'piano' as const };
        });
}

// ------------------------------------------------------------- what reaches Earth

/** A relayed note, as Earth gets it. */
export type Message = 'received' | 'lost' | 'garbled';

/**
 * Received when the note was Perfect or Good. Otherwise it is lost if it
 * never started or was held short (it never arrived), garbled if it was
 * held long.
 */
export function messageOf(r: NoteResult): Message {
    const g = noteGrade(r);
    if (g === 'perfect' || g === 'good') return 'received';
    if (r.pressError === null) return 'lost';
    if (r.releaseError === null) return 'garbled';          // held on until the game let go for you
    return r.releaseError - r.pressError < 0 ? 'lost' : 'garbled';
}

export interface EchoSummary extends Summary {
    received: number;
    lost: number;
    garbled: number;
}

export function summarizeEcho(results: NoteResult[]): EchoSummary {
    const out = { received: 0, lost: 0, garbled: 0 };
    for (const r of results) out[messageOf(r)]++;
    return { ...summarize(results), ...out };
}

/** One sentence on the relay, when there is something to say. */
export function echoTip(s: EchoSummary): string | null {
    const ms = (x: number) => `${Math.round(Math.abs(x) * 1000)} ms`;
    if (s.releaseBias !== null && s.releaseBias < -0.06) return `You let go about ${ms(s.releaseBias)} early, and messages don't reach Earth. Hold until each note has passed the satellite.`;
    if (s.releaseBias !== null && s.releaseBias > 0.06) return `You hold on about ${ms(s.releaseBias)} too long, and messages come out garbled. Let go as each note's tail passes the satellite.`;
    if (s.pressBias !== null && s.pressBias < -0.04) return `You start sending about ${ms(s.pressBias)} early. Wait for each note to reach the satellite.`;
    if (s.pressBias !== null && s.pressBias > 0.04) return `You start sending about ${ms(s.pressBias)} late. Be ready as each note arrives.`;
    const total = s.received + s.lost + s.garbled;
    if (total > 0 && s.received === total) return 'Every message got through: you sang the second voice of the canon.';
    if (s.lost >= s.garbled && s.lost > 0) return `${s.lost} ${s.lost === 1 ? 'message was' : 'messages were'} lost on the way. Listen to the star a bar ahead, so you are ready for each note.`;
    if (s.garbled > 0) return `${s.garbled} ${s.garbled === 1 ? 'message came' : 'messages came'} out garbled: held past the end of the note.`;
    return null;
}

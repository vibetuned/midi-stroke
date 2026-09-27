/**
 * The Groove MIDI Dataset (Magenta, CC BY 4.0) as drum scores: a performance
 * recorded on an electronic kit, read from its MIDI file, put on a grid and
 * written out as the app's drum notation.
 *
 * The drummers played to a click at the stated tempo, so the file's beats are
 * the click's — only the playing on them is human: a drummer sitting a little
 * ahead of the click, a sixteenth pushed a hair late, a swung eighth somewhere
 * between straight and a triplet, a flam's grace note 30 ms ahead of the
 * stroke. The drummer's own beat is read first, from the hits around each
 * beat line, and the rest against it. Then each beat gets the simplest grid that
 * holds its hits (quarters, eighths, sixteenths or thirty-seconds; triplets or
 * sextuplets), and a groove keeps its feel from beat to beat: changing between
 * straight and triplet grids costs, so a swung groove stays swung through a
 * beat that could be read either way, and a straight one only turns to
 * triplets where the playing plainly does. The same grids the Weimar solos are
 * written on (scripts/build-jazz-scores.py).
 *
 * Pure: bytes in, MEI out, so the checks run it in node
 * (scripts/check-groove.mjs). The files and their index are in public/groove/.
 */

// ------------------------------------------------------------------ the file

export interface MidiHit {
    /** Ticks from the start of the file. */
    tick: number;
    note: number;
    vel: number;
}

export interface MidiPerformance {
    /** Ticks per quarter note. */
    tpq: number;
    /** Quarter notes per minute: the file's first tempo. */
    bpm: number;
    meter: { count: number; unit: number };
    /** Every note-on, in time order. */
    hits: MidiHit[];
}

/** A Standard MIDI File's note-ons, first tempo and first time signature. */
export function readMidi(data: Uint8Array): MidiPerformance {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const tag = (at: number) => String.fromCharCode(data[at], data[at + 1], data[at + 2], data[at + 3]);
    if (tag(0) !== 'MThd') throw new Error('Not a MIDI file');
    const tracks = view.getUint16(10);
    const division = view.getUint16(12);
    if (division & 0x8000) throw new Error('SMPTE time is not supported');
    let at = 8 + view.getUint32(4);

    let bpm: number | null = null;
    let meter: { count: number; unit: number } | null = null;
    const hits: MidiHit[] = [];

    for (let t = 0; t < tracks && at + 8 <= data.length; t++) {
        const length = view.getUint32(at + 4);
        const isTrack = tag(at) === 'MTrk';
        let p = at + 8;
        const end = Math.min(data.length, p + length);
        at = end;
        if (!isTrack) continue;
        const varLen = () => {
            let v = 0;
            for (let k = 0; k < 4; k++) {
                const b = data[p++];
                v = (v << 7) | (b & 0x7f);
                if (!(b & 0x80)) break;
            }
            return v;
        };
        let tick = 0;
        let status = 0;
        while (p < end) {
            tick += varLen();
            let byte = data[p];
            if (byte & 0x80) { status = byte; p++; } else byte = status;   // running status
            const kind = status & 0xf0;
            if (status === 0xff) {
                const type = data[p++];
                const len = varLen();
                if (type === 0x51 && bpm === null && len === 3) {
                    bpm = 60_000_000 / ((data[p] << 16) | (data[p + 1] << 8) | data[p + 2]);
                } else if (type === 0x58 && meter === null && len >= 2) {
                    meter = { count: data[p], unit: 2 ** data[p + 1] };
                }
                p += len;
                status = 0;
            } else if (status === 0xf0 || status === 0xf7) {
                p += varLen();
                status = 0;
            } else if (kind === 0xc0 || kind === 0xd0) {
                p += 1;
            } else if (kind >= 0x80) {
                const note = data[p], vel = data[p + 1];
                p += 2;
                if (kind === 0x90 && vel > 0) hits.push({ tick, note, vel });
            } else {
                break;   // not an event: a corrupt track
            }
        }
    }
    hits.sort((a, b) => a.tick - b.tick || a.note - b.note);
    return { tpq: division, bpm: bpm ?? 120, meter: meter ?? { count: 4, unit: 4 }, hits };
}

// ------------------------------------------------------------------- the kit

export type GrooveVoice =
    | 'kick' | 'pedal' | 'snare' | 'rim' | 'hatClosed' | 'hatOpen'
    | 'ride' | 'crash' | 'tomHigh' | 'tomMid' | 'tomLow';

/**
 * The Roland TD-11's notes (the kit the dataset was recorded on), General
 * MIDI where it agrees: head and rim of each pad, bow and edge of each hat and
 * cymbal, fold onto the voices the app notates.
 */
export const GROOVE_NOTE_VOICE: Readonly<Record<number, GrooveVoice>> = {
    35: 'kick', 36: 'kick',
    38: 'snare', 40: 'snare',          // head, rim shot
    37: 'rim',                         // cross-stick
    42: 'hatClosed', 22: 'hatClosed',  // bow, edge
    46: 'hatOpen', 26: 'hatOpen',
    44: 'pedal',
    51: 'ride', 59: 'ride', 53: 'ride',   // bow, edge, bell
    49: 'crash', 55: 'crash', 57: 'crash', 52: 'crash',
    48: 'tomHigh', 50: 'tomHigh',
    45: 'tomMid', 47: 'tomMid',
    43: 'tomLow', 58: 'tomLow', 41: 'tomLow',
};

interface Notated { pname: string; oct: number; head?: string; layer: 1 | 2 }

/**
 * Where each voice is written: the app's positions (utils/drumPads.ts), plus
 * the two a drummer's chart has that its pattern libraries never needed — the
 * ride on the top line and the hi-hat foot below the staff. Hands stem up,
 * feet stem down.
 */
export const GROOVE_NOTATION: Readonly<Record<GrooveVoice, Notated>> = {
    crash: { pname: 'a', oct: 5, head: 'x', layer: 1 },
    hatOpen: { pname: 'g', oct: 5, head: '+', layer: 1 },
    hatClosed: { pname: 'g', oct: 5, head: 'x', layer: 1 },
    ride: { pname: 'f', oct: 5, head: 'x', layer: 1 },
    tomHigh: { pname: 'e', oct: 5, layer: 1 },
    tomMid: { pname: 'd', oct: 5, layer: 1 },
    snare: { pname: 'c', oct: 5, layer: 1 },
    rim: { pname: 'c', oct: 5, head: 'slash', layer: 1 },
    tomLow: { pname: 'a', oct: 4, layer: 1 },
    kick: { pname: 'f', oct: 4, layer: 2 },
    pedal: { pname: 'd', oct: 4, head: 'x', layer: 2 },
};

/** Top of the staff to the bottom, for chords. */
const VOICE_ORDER: readonly GrooveVoice[] = [
    'crash', 'hatOpen', 'hatClosed', 'ride', 'tomHigh', 'tomMid', 'snare', 'rim', 'tomLow', 'kick', 'pedal',
];

// ------------------------------------------------------------------ the grid

/** Straight or triplet grids, or whichever the playing says (the default). */
export type GrooveFeel = 'auto' | 'straight' | 'triplets';

type Family = 'B' | 'T';

/** A hit on the grid: `step` of `grid` equal parts of unit `unit`. */
export interface PlacedHit {
    unit: number;
    step: number;
    grid: number;
    voice: GrooveVoice;
    vel: number;
}

export interface QuantizedGroove {
    bpm: number;
    meter: { count: number; unit: number };
    /** Each unit's grid (a unit is the meter's beat note: a quarter in 4/4, an eighth in 6/8). */
    grids: number[];
    /** Whether each unit's grid is triplet-based (a unit on 1 counts as the feel around it). */
    families: Family[];
    hits: PlacedHit[];
    stats: {
        /** Note-ons read, those on no voice the app notates, and those too soft to hear. */
        notes: number;
        unmapped: number;
        quiet: number;
        /** Hits merged into another on the same point: flams and double triggers. */
        merged: number;
        /** Distinct strokes that met on one point, which a finer grid would have kept apart; and of those, the ones both loud. */
        lost: number;
        lostLoud: number;
        /** Where the drummer sat against the click (negative: ahead), in milliseconds. */
        offsetMs: number;
        /** How far the hits moved from there onto the grid, in milliseconds. */
        meanShiftMs: number;
        maxShiftMs: number;
    };
}

const GRIDS: Record<Family, readonly number[]> = { B: [1, 2, 4, 8], T: [1, 3, 6] };
/** What a grid costs to read, in the same units as a hit's squared deviation. */
const COMPLEXITY: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 2.5, 6: 7, 8: 10 };
/** Human timing: the spread of a hit around where it is meant, in seconds. */
const SIGMA_SEC = 0.018;
/** Changing between straight and triplet grids. */
const SWITCH_COST = 6;
/** Two strokes of one voice pulled onto one point. */
const LOST_COST = 14;
/** Softer than this, a stroke is not heard: the beater resting on the head, the stick brushing the hat. */
const QUIET_VEL = 10;
/** From this loud, a stroke has its full say in its beat's grid. */
const FULL_SAY_VEL = 64;
/** Closer than this, two strokes of one voice are one: a flam, a double trigger. */
const FLAM_SEC = 0.04;
/** Hits this close to a beat (in units) tell where the drummer's beat is. */
const BEAT_WINDOW = 0.12;
/** How far from a beat (in units) a hi-hat foot's hit still tells its lead. */
const FOOT_WINDOW = 0.2;
/** How many units either side the drummer's beat is read from. */
const OFFSET_REACH = 4;
/** No grid finer than this, whatever the tempo: nobody plays 32nds at 240. */
const MIN_STEP_SEC = 0.045;

interface Onset { t: number; voice: GrooveVoice; vel: number }

/** Put a performance on the grid. */
export function quantize(perf: MidiPerformance, feel: GrooveFeel = 'auto'): QuantizedGroove {
    const { tpq, bpm, meter } = perf;
    // The unit is the meter's beat note; a quarter's worth of ticks per quarter.
    const unitTicks = tpq * 4 / meter.unit;
    const unitSec = 60 / bpm * (4 / meter.unit);
    const sigma = SIGMA_SEC / unitSec;                // in units
    const flam = FLAM_SEC / unitSec;

    let unmapped = 0, quiet = 0;
    const raw: Onset[] = [];
    for (const h of perf.hits) {
        const voice = GROOVE_NOTE_VOICE[h.note];
        if (!voice) { unmapped++; continue; }
        if (h.vel < QUIET_VEL) { quiet++; continue; }
        raw.push({ t: h.tick / unitTicks, voice, vel: h.vel });
    }

    // Where the drummer sits against the click. Everyone is a little ahead or
    // behind it, and it moves — by 40 ms over a take, typically — so each unit
    // is read against the hits on the beats around it, not against the click.
    const nearBeat = raw.map(o => ({ u: Math.round(o.t), d: o.t - Math.round(o.t) })).filter(x => Math.abs(x.d) < BEAT_WINDOW);
    const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
    const overall = median(nearBeat.map(x => x.d));
    const beatDevs = new Map<number, number[]>();
    for (const x of nearBeat) (beatDevs.get(x.u) ?? beatDevs.set(x.u, []).get(x.u)!).push(x.d);
    const lastUnit0 = raw.length ? Math.floor(raw[raw.length - 1].t) + 1 : 0;
    const offsets: number[] = [];
    for (let u = 0; u <= lastUnit0; u++) {
        const around: number[] = [];
        for (let v = u - OFFSET_REACH; v <= u + OFFSET_REACH; v++) around.push(...(beatDevs.get(v) ?? []));
        offsets.push(around.length >= 3 ? median(around) : overall);
    }
    const offsetAt = (t: number) => offsets[Math.max(0, Math.min(offsets.length - 1, Math.round(t)))] ?? 0;
    const hands = raw.map(o => ({ ...o, t: o.t - offsetAt(o.t) }));
    // The hi-hat foot keeps its own time — often a good 50 ms ahead of the
    // sticks — so it is moved by its own lead on the beats it plays. (Not the
    // kick: that one plays with the hands, and moving it only pulls it off them.)
    const devs = hands.filter(o => o.voice === 'pedal').map(o => o.t - Math.round(o.t)).filter(d => Math.abs(d) < FOOT_WINDOW);
    const footLead = devs.length >= 8 ? Math.max(-FOOT_WINDOW, Math.min(FOOT_WINDOW, median(devs))) : 0;
    const onsets: Onset[] = hands
        .map(o => ({ ...o, t: Math.max(0, o.t - (o.voice === 'pedal' ? footLead : 0)) }))
        .sort((a, b) => a.t - b.t);
    const unitCount = onsets.length ? Math.floor(onsets[onsets.length - 1].t) + 1 : 0;
    const byUnit: Onset[][] = Array.from({ length: unitCount }, () => []);
    for (const o of onsets) byUnit[Math.floor(o.t)].push(o);

    const families: Family[] = feel === 'straight' ? ['B'] : feel === 'triplets' ? ['T'] : ['B', 'T'];
    const states = families.flatMap(f => GRIDS[f].filter(g => g === 1 || unitSec / g >= MIN_STEP_SEC).map(g => ({ f, g })));

    /** A unit's cost on a grid: how far its hits move, how hard it reads, and what it loses. */
    const cost = (unit: number, g: number): number => {
        const list = byUnit[unit];
        if (list.length === 0) return 0;
        let c = COMPLEXITY[g];
        const seen = new Map<string, number>();
        for (const o of list) {
            const f = o.t - unit;
            const k = Math.round(f * g);
            const d = (f - k / g) / sigma;
            // A ghost stroke is placed as carefully as any, but it has less
            // say in the grid: a brush of the snare between two sixteenths
            // does not make a beat of thirty-seconds.
            const weight = Math.min(1, Math.max(0.25, o.vel / FULL_SAY_VEL));
            c += weight * d * d;
            const key = `${o.voice}@${k}`;
            const prev = seen.get(key);
            if (prev !== undefined && o.t - prev > flam) c += weight * LOST_COST;
            seen.set(key, o.t);
        }
        return c;
    };

    // Viterbi over the units: each unit's grid, a change of family paid for.
    const n = states.length;
    const back: Int8Array[] = [];
    let score = states.map(s => cost(0, s.g));
    for (let u = 1; u < unitCount; u++) {
        const here = states.map(s => cost(u, s.g));
        const from = new Int8Array(n);
        const next = new Array<number>(n);
        for (let j = 0; j < n; j++) {
            let best = Infinity, arg = 0;
            for (let i = 0; i < n; i++) {
                const v = score[i] + (states[i].f === states[j].f ? 0 : SWITCH_COST);
                if (v < best) { best = v; arg = i; }
            }
            next[j] = best + here[j];
            from[j] = arg;
        }
        back.push(from);
        score = next;
    }
    const path = new Array<number>(unitCount);
    if (unitCount) {
        path[unitCount - 1] = score.indexOf(Math.min(...score));
        for (let u = unitCount - 1; u > 0; u--) path[u - 1] = back[u - 1][path[u]];
    }

    // Snap. A hit at the end of its unit's grid is on the next unit's first step.
    const grids = path.map(i => states[i].g);
    const fams = path.map(i => states[i].f);
    const hits: PlacedHit[] = [];
    const at = new Map<string, { hit: PlacedHit; t: number }>();
    let merged = 0, lost = 0, lostLoud = 0, shift = 0, maxShift = 0;
    for (let u = 0; u < unitCount; u++) {
        const g = grids[u];
        for (const o of byUnit[u]) {
            let k = Math.round((o.t - u) * g);
            const d = Math.abs(o.t - u - k / g) * unitSec * 1000;
            shift += d;
            maxShift = Math.max(maxShift, d);
            let unit = u;
            if (k === g) { unit = u + 1; k = 0; }
            // One point per voice: a second stroke there is a flam's grace note, or one the grid could not keep apart.
            const key = `${o.voice}@${unit}:${k}`;
            const prev = at.get(key);
            if (prev) {
                if (o.t - prev.t <= flam) merged++;
                else { lost++; if (Math.min(o.vel, prev.hit.vel) >= FULL_SAY_VEL) lostLoud++; }
                prev.hit.vel = Math.max(prev.hit.vel, o.vel);
                continue;
            }
            const hit: PlacedHit = { unit, step: k, grid: k === 0 ? 1 : g, voice: o.voice, vel: o.vel };
            at.set(key, { hit, t: o.t });
            hits.push(hit);
        }
    }
    const lastUnit = hits.reduce((m, h) => Math.max(m, h.unit), -1);
    while (grids.length <= lastUnit) { grids.push(1); fams.push(fams[fams.length - 1] ?? 'B'); }
    hits.sort((a, b) => a.unit - b.unit || a.step / a.grid - b.step / b.grid);

    return {
        bpm, meter, grids, families: fams, hits,
        stats: {
            notes: perf.hits.length, unmapped, quiet, merged, lost, lostLoud,
            offsetMs: overall * unitSec * 1000,
            meanShiftMs: onsets.length ? shift / onsets.length : 0, maxShiftMs: maxShift,
        },
    };
}

// ----------------------------------------------------------------- the score

export interface GrooveScoreOptions {
    title?: string;
    /** First and last bar to write, from 1; the whole performance by default. */
    fromBar?: number;
    toBar?: number;
    /** Ghost notes in brackets, accents marked: the playing's dynamics on the page. */
    dynamics?: boolean;
}

/** How many bars a performance has, once its empty opening bars are left out. */
export function grooveBars(q: QuantizedGroove): { first: number; count: number } {
    const perBar = q.meter.count;
    if (q.hits.length === 0) return { first: 0, count: 0 };
    const first = Math.floor(q.hits[0].unit / perBar);
    const last = Math.floor(q.hits[q.hits.length - 1].unit / perBar);
    return { first, count: last - first + 1 };
}

/** Durations as written: halvings of the unit's note, and dots. */
const STEP_VALUES: Record<number, [number, number]> = { 1: [0, 0], 2: [1, 0], 3: [1, 1], 4: [2, 0], 6: [2, 1], 7: [2, 2], 8: [3, 0] };

/** `steps` of a grid whose step is written as `stepDur` (16 for sixteenths): the note values that add up to it, longest first. */
function splitSteps(steps: number, stepDur: number): Array<{ dur: number; dots: number; steps: number }> {
    const out: Array<{ dur: number; dots: number; steps: number }> = [];
    let left = steps;
    while (left > 0) {
        const take = [8, 7, 6, 4, 3, 2, 1].find(s => s <= left && STEP_VALUES[s] && stepDur / 2 ** STEP_VALUES[s][0] >= 1)!;
        const [halvings, dots] = STEP_VALUES[take];
        out.push({ dur: stepDur / 2 ** halvings, dots, steps: take });
        left -= take;
    }
    return out;
}

/** The lengths, in units, that whole-unit notes and rests merge into from each unit of a bar. */
function mergeSpans(meter: { count: number; unit: number }): number[][] {
    const { count, unit } = meter;
    const spans: number[][] = Array.from({ length: count }, () => []);
    if (unit === 4) {
        if (count === 4) { spans[0] = [4, 3, 2]; spans[2] = [2]; }
        else if (count === 3) { spans[0] = [3, 2]; spans[1] = [2]; }
        else if (count === 2) { spans[0] = [2]; }
        else if (count === 5) { spans[0] = [3, 2]; spans[3] = [2]; }
    } else if (unit === 8 && count % 3 === 0) {
        for (let u = 0; u < count; u += 3) spans[u] = [3];
        if (count === 6) spans[0] = [6, 3];
        if (count === 12) { spans[0] = [12, 6, 3]; spans[6] = [6, 3]; }
    }
    return spans;
}

/** Written durations of whole units, as [dur, dots]. */
function unitsValue(units: number, meterUnit: number): [number, number] | null {
    const q = units * 4 / meterUnit;          // in quarters
    const table: Record<string, [number, number]> = {
        '0.5': [8, 0], '0.75': [8, 1], '1': [4, 0], '1.5': [4, 1], '2': [2, 0], '3': [2, 1], '4': [1, 0], '6': [1, 1],
    };
    return table[String(q)] ?? null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Write a quantised performance as the app's drum notation. */
export function grooveMei(q: QuantizedGroove, opts: GrooveScoreOptions = {}): string {
    const { meter } = q;
    const perBar = meter.count;
    const { first, count } = grooveBars(q);
    const fromBar = Math.max(1, opts.fromBar ?? 1);
    const toBar = Math.min(count, opts.toBar ?? count);
    const dynamics = opts.dynamics ?? true;
    const spans = mergeSpans(meter);
    // A step is written as the unit halved: eighths for 2 and 3, sixteenths for 4 and 6, thirty-seconds for 8 (in 4/4).
    const stepBase = (g: number) => g >= 8 ? 8 : g >= 4 ? 4 : g >= 2 ? 2 : 1;
    const writtenStep = (g: number) => meter.unit * stepBase(g);
    const unitDur = meter.unit;

    // Each voice's usual level, so a ghost note or an accent is soft or loud for that drum.
    const levels = new Map<GrooveVoice, number>();
    {
        const byVoice = new Map<GrooveVoice, number[]>();
        for (const h of q.hits) (byVoice.get(h.voice) ?? byVoice.set(h.voice, []).get(h.voice)!).push(h.vel);
        for (const [v, list] of byVoice) { list.sort((a, b) => a - b); levels.set(v, list[list.length >> 1]); }
    }
    const ghost = (h: PlacedHit) => dynamics && (h.voice === 'snare' || h.voice === 'tomHigh' || h.voice === 'tomMid' || h.voice === 'tomLow')
        && h.vel < Math.min(50, 0.55 * (levels.get(h.voice) ?? 100));
    const accent = (h: PlacedHit) => dynamics && h.voice !== 'kick' && h.voice !== 'pedal'
        && h.vel >= 110 && h.vel >= 1.3 * (levels.get(h.voice) ?? 127);

    const noteXml = (h: PlacedHit, inChord: boolean, dur: string, stem: string) => {
        const n = GROOVE_NOTATION[h.voice];
        const attrs = [`pname="${n.pname}"`, `oct="${n.oct}"`];
        if (n.head) attrs.push(`head.shape="${n.head}"`);
        if (ghost(h)) attrs.push('head.mod="paren"');
        attrs.push(`vel="${h.vel}"`);
        const artic = accent(h) ? '<artic artic="acc" place="above"/>' : '';
        const lead = inChord ? '' : `${dur} ${stem} `;
        return artic ? `<note ${lead}${attrs.join(' ')}>${artic}</note>` : `<note ${lead}${attrs.join(' ')}/>`;
    };
    const eventXml = (group: PlacedHit[], dur: number, dots: number, layer: 1 | 2) => {
        const d = `dur="${dur}"${dots ? ` dots="${dots}"` : ''}`;
        const stem = `stem.dir="${layer === 1 ? 'up' : 'down'}"`;
        const sorted = [...group].sort((a, b) => VOICE_ORDER.indexOf(a.voice) - VOICE_ORDER.indexOf(b.voice));
        if (sorted.length === 1) return noteXml(sorted[0], false, d, stem);
        return `<chord ${d} ${stem}>${sorted.map(h => noteXml(h, true, d, stem)).join('')}</chord>`;
    };
    // A gap inside a beat is a rest, in either voice: it is what the beat's
    // beam is counted by. A beat with nothing for the feet is blank.
    const restXml = (dur: number, dots: number) => `<rest dur="${dur}"${dots ? ` dots="${dots}"` : ''}/>`;
    const gapXml = (dur: number, dots: number, layer: 1 | 2) =>
        layer === 1 ? restXml(dur, dots) : `<space dur="${dur}"${dots ? ` dots="${dots}"` : ''}/>`;

    // The bar's hits, by layer and unit.
    const byBar = new Map<number, PlacedHit[]>();
    for (const h of q.hits) {
        const bar = Math.floor(h.unit / perBar) - first + 1;
        if (bar < fromBar || bar > toBar) continue;
        (byBar.get(bar) ?? byBar.set(bar, []).get(bar)!).push(h);
    }

    /**
     * One layer of one bar. `tuplets` has the units whose hands are in a
     * tuplet, filled in by the hands' layer: the feet's tuplet under one says
     * nothing new, so its number is not written again.
     */
    const layerXml = (hits: PlacedHit[], barStartUnit: number, layer: 1 | 2, tuplets: Map<number, number>): string => {
        const units: PlacedHit[][] = Array.from({ length: perBar }, () => []);
        for (const h of hits) if (GROOVE_NOTATION[h.voice].layer === layer) units[h.unit - barStartUnit].push(h);
        if (units.every(u => u.length === 0)) {
            return layer === 1 ? '<mRest/>' : '<mSpace/>';
        }
        // Units holding only a downbeat, or nothing, can merge with the empty units after them.
        const plain = (u: number) => units[u].every(h => h.step === 0);
        const out: string[] = [];
        let u = 0;
        while (u < perBar) {
            if (plain(u)) {
                const span = spans[u].find(s => u + s <= perBar && units.slice(u + 1, u + s).every(x => x.length === 0) && unitsValue(s, meter.unit));
                const len = span ?? 1;
                const [dur, dots] = unitsValue(len, meter.unit) ?? [unitDur, 0];
                out.push(units[u].length ? eventXml(units[u], dur, dots, layer) : gapXml(dur, dots, layer));
                u += len;
                continue;
            }
            // A unit with hits off its downbeat: its own grid, the layer's simplest that holds them.
            const g0 = q.grids[barStartUnit + u] ?? 1;
            const fam: Family = q.families[barStartUnit + u] === 'T' || g0 % 3 === 0 ? 'T' : 'B';
            const pos = units[u].map(h => h.step / h.grid);
            const g = GRIDS[fam].find(c => pos.every(p => Math.abs(p * c - Math.round(p * c)) < 1e-6)) ?? g0;
            const at = new Map<number, PlacedHit[]>();
            for (const h of units[u]) {
                const k = Math.round(h.step / h.grid * g);
                (at.get(k) ?? at.set(k, []).get(k)!).push(h);
            }
            const steps = [...at.keys()].sort((a, b) => a - b);
            const parts: string[] = [];
            const stepDur = writtenStep(g);
            if (steps[0] > 0) for (const v of splitSteps(steps[0], stepDur)) parts.push(restXml(v.dur, v.dots));
            steps.forEach((k, i) => {
                const len = (steps[i + 1] ?? g) - k;
                const values = splitSteps(len, stepDur);
                parts.push(eventXml(at.get(k)!, values[0].dur, values[0].dots, layer));
                for (const v of values.slice(1)) parts.push(restXml(v.dur, v.dots));
            });
            const beamed = parts.length > 1 ? `<beam>${parts.join('')}</beam>` : parts.join('');
            if (g % 3 === 0) {
                const shown = layer === 1 || tuplets.get(u) !== g;
                if (layer === 1) tuplets.set(u, g);
                out.push(`<tuplet num="${g}" numbase="${g === 3 ? 2 : 4}" num.visible="${shown}" bracket.visible="false">${beamed}</tuplet>`);
            } else {
                out.push(beamed);
            }
            u += 1;
        }
        return out.join('');
    };

    const measures: string[] = [];
    for (let bar = fromBar; bar <= toBar; bar++) {
        const barStartUnit = (first + bar - 1) * perBar;
        const hits = byBar.get(bar) ?? [];
        const tempo = bar === fromBar
            ? `<tempo tstamp="1" place="above" mm="${Math.round(q.bpm)}" mm.unit="4">♩ = ${Math.round(q.bpm)}</tempo>`
            : '';
        const tuplets = new Map<number, number>();
        const hands = layerXml(hits, barStartUnit, 1, tuplets);
        const feet = layerXml(hits, barStartUnit, 2, tuplets);
        measures.push(
            `<measure n="${bar}"><staff n="1">`
            + `<layer n="1">${hands}</layer>`
            + `<layer n="2">${feet}</layer>`
            + `</staff>${tempo}</measure>`,
        );
    }

    const title = esc(opts.title ?? 'Groove');
    return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
<meiHead><fileDesc><titleStmt><title>${title}</title></titleStmt><pubStmt><availability><licence>CC BY 4.0 — Groove MIDI Dataset, Magenta (Google), quantised and notated by Midi Stroke</licence></availability></pubStmt></fileDesc></meiHead>
<music><body><mdiv><score>
<scoreDef midi.bpm="${Math.round(q.bpm * 100) / 100}"><staffGrp><staffDef n="1" lines="5" clef.shape="perc"><meterSig count="${meter.count}" unit="${meter.unit}"/></staffDef></staffGrp></scoreDef>
<section>
${measures.join('\n')}
</section>
</score></mdiv></body></music>
</mei>
`;
}

// --------------------------------------------------------------- the library

/** A take as the app asks for it: `groove:drummer1.session1.1-auto`, or a part of it, `…-auto-b33-64`. */
export interface GrooveSpec {
    /** drummer.session.take, as the dataset numbers them. */
    id: string;
    feel: GrooveFeel;
    fromBar?: number;
    toBar?: number;
}

const GROOVE_URL = /^groove:([a-z0-9_]+\.[a-z0-9_]+\.\d+)-(auto|straight|triplets)(?:-b(\d+)-(\d+))?$/;

export function parseGrooveUrl(url: string): GrooveSpec | null {
    const m = GROOVE_URL.exec(url);
    if (!m) return null;
    const spec: GrooveSpec = { id: m[1], feel: m[2] as GrooveFeel };
    if (m[3]) { spec.fromBar = Number(m[3]); spec.toBar = Number(m[4]); }
    return spec;
}

export function buildGrooveUrl(spec: GrooveSpec): string {
    const part = spec.fromBar && spec.toBar ? `-b${spec.fromBar}-${spec.toBar}` : '';
    return `groove:${spec.id}-${spec.feel}${part}`;
}

/** One take of the index (public/groove/index.json). */
export interface GrooveTake {
    id: string;
    drummer: number;
    /** "funk", "jazz/swing", "latin/brazilian-samba"… */
    style: string;
    bpm: number;
    type: 'beat' | 'fill';
    meter: string;
    seconds: number;
    bars: number;
    /** The share of its busy beats on triplet grids. */
    swing: number;
    file: string;
}

let indexPromise: Promise<GrooveTake[]> | null = null;
let indexLoaded: GrooveTake[] | null = null;

/** The takes, fetched once. */
export function loadGrooveIndex(): Promise<GrooveTake[]> {
    indexPromise ??= fetch(`${import.meta.env.BASE_URL}groove/index.json`)
        .then(r => { if (!r.ok) throw new Error('Failed to load the groove index'); return r.json(); })
        .then((data: { fields: string[]; takes: unknown[][] }) => {
            indexLoaded = data.takes.map(row =>
                Object.fromEntries(data.fields.map((f, i) => [f, f === 'drummer' ? Number(row[i]) : row[i]])) as unknown as GrooveTake);
            return indexLoaded;
        })
        .catch(e => { indexPromise = null; throw e; });
    return indexPromise;
}

const STYLE_WORDS: Record<string, string> = {
    hiphop: 'Hip-hop', neworleans: 'New Orleans', afrocuban: 'Afro-Cuban', middleeastern: 'Middle Eastern',
    purdieshuffle: 'Purdie shuffle', mediumfast: 'medium fast', secondline: 'second line', chacha: 'cha-cha',
    sambareggae: 'samba-reggae', ijexa: 'ijexá', baiao: 'baião', bembe: 'bembé', bossa: 'bossa nova',
    halftime: 'half-time', brazilian: 'Brazilian', venezuelan: 'Venezuelan', dominican: 'Dominican',
};

/** "Funk", "Jazz (swing)", "Latin (Brazilian samba)", "Funk (Purdie shuffle)". */
export function grooveStyleName(style: string): string {
    const [family, kind] = style.split('/');
    const word = (w: string) => STYLE_WORDS[w] ?? w;
    const head = STYLE_WORDS[family] ?? family.charAt(0).toUpperCase() + family.slice(1);
    if (!kind || /^groove\d+$/.test(kind)) return head;
    return `${head} (${kind.split('-').map(word).join(' ')})`;
}

/** "Funk beat · 80 bpm · drummer 1", with its bars when it is a part. */
export function describeGroove(take: GrooveTake, spec?: GrooveSpec): string {
    const part = spec?.fromBar ? ` · bars ${spec.fromBar}–${spec.toBar}` : '';
    return `${grooveStyleName(take.style)} ${take.type} · ${take.bpm} bpm · drummer ${take.drummer}${part}`;
}

/** The song navigator's name for a groove URL — from the index once it is in (it is, by the time a groove plays). */
export function describeGrooveUrl(url: string): string | null {
    const spec = parseGrooveUrl(url);
    if (!spec) return null;
    const take = indexLoaded?.find(t => t.id === spec.id);
    return take ? `Groove · ${describeGroove(take, spec)}` : `Groove · ${spec.id}`;
}

const midiCache = new Map<string, Promise<MidiPerformance>>();

/** A take's performance, fetched once. */
export function loadGroovePerformance(take: GrooveTake): Promise<MidiPerformance> {
    let p = midiCache.get(take.id);
    if (!p) {
        p = fetch(`${import.meta.env.BASE_URL}groove/midi/${take.file}`)
            .then(r => { if (!r.ok) throw new Error(`Failed to load ${take.file}`); return r.arrayBuffer(); })
            .then(b => readMidi(new Uint8Array(b)));
        p.catch(() => midiCache.delete(take.id));
        midiCache.set(take.id, p);
    }
    return p;
}

/** The score for a groove URL. */
export async function grooveMeiForUrl(url: string): Promise<string> {
    const spec = parseGrooveUrl(url);
    if (!spec) throw new Error(`Not a groove: ${url}`);
    const take = (await loadGrooveIndex()).find(t => t.id === spec.id);
    if (!take) throw new Error(`No such groove: ${spec.id}`);
    const q = quantize(await loadGroovePerformance(take), spec.feel);
    return grooveMei(q, { title: describeGroove(take, spec), fromBar: spec.fromBar, toBar: spec.toBar });
}

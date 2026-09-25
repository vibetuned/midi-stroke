import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import * as Tone from 'tone';
import { useMidiNotes } from '../../hooks/useMidi';
import { heardAt, heardNow, scheduleNow } from '../../games/clock';
import { getLatency } from '../../games/latency';
import { PRESS, noteGrade, type Grade, type NoteResult } from '../../games/judge';
import { countingOf, tempoMark, type RhythmLevel, type RhythmNote } from '../../games/rhythm';
import { HOLD, LIFT, beatResult, choirBeats, choirShift, noteAt, singersOf, type Singer } from '../../games/choir';
import { GRADE_HEX, mix, voiceColor } from './ink';
import { SOUNDS, preload, sampler } from './sounds';

/**
 * The Conductor. The choir stands low to high, one singer for every pitch
 * of the tune, and you conduct it a beat at a time: each hold of the button
 * (space, a touch, any MIDI key) is one beat. While you hold, the song moves
 * on at the piece's tempo — whoever has a note in that beat sings it, and
 * the piano plays its part — and a ring fills round the singer as the beat
 * goes by. Let go as it closes and press straight away for the next beat.
 *
 * The song follows you. Let go early and the beat is cut short: the singer
 * stops, surprised, and the rest of the beat is skipped. Hold on and the
 * song waits on that beat while the singer holds the note, reddening — a
 * whole extra beat and they are out of breath. Pause before the next press
 * and the choir stops to wait for you. Each beat is judged on how long it
 * was held and how quickly you came back in (games/choir.ts).
 */

const ACCENT = 0x22d3ee;
const LEAD_SECONDS = 0.4;
/** A note carried into the next beat keeps sounding through a lift this long; then the choir stops to wait. */
const MAX_LIFT = 0.35;
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a07a];
const HAIR = [0x2c1b10, 0x6b3e26, 0xd9a441, 0x1c1c1c, 0xa33b20, 0x9ca3af, 0x4a2c1a];

/** The conductor's beat patterns — where the baton lands on each beat (x, y down). */
function beatPattern(beats: number): Array<[number, number]> {
    if (beats === 4) return [[0, 1], [-1, 0.55], [1, 0.6], [0.15, -0.9]];
    if (beats === 3) return [[0, 1], [1, 0.55], [0.15, -0.9]];
    if (beats === 2) return [[0, 1], [0.15, -0.9]];
    // In six: down, two to the left, across, two to the right, up.
    if (beats === 6) return [[0, 1], [-0.55, 0.75], [-1, 0.55], [0.7, 0.6], [1.15, 0.55], [0.15, -0.9]];
    return Array.from({ length: Math.max(1, Math.round(beats)) }, (_, k) => (k % 2 === 0 ? [0, 1] : [0.15, -0.9]) as [number, number]);
}

type Mood = 'happy' | 'cut' | 'breathless' | 'sad';

interface Play {
    /** The count-in has begun. */
    started: boolean;
    finished: boolean;
    /** Audio-context time the count-in leads to: when the first beat should come in. */
    downbeat: number;
    /** The beat being held, or the next one to hold. */
    k: number;
    holding: boolean;
    /** What is holding it: a key, a MIDI note, the pointer. */
    holder: string | number | null;
    /** Heard times of this beat's press and the last let-go. */
    pressAt: number;
    releaseAt: number;
    /** This beat's entry: see beatResult. */
    entry: number | null;
    results: NoteResult[];
    combo: number;
    /** Where the song is, in beats. */
    pos: number;
    /** Press times of the last few beats, for the tempo you are conducting at. */
    presses: number[];
    endedAt: number | null;
}

/** A choir: whatever sings notes on and off. */
type Choir = { triggerAttack: (note: number, time: number, velocity?: number) => unknown; triggerRelease: (note: number, time: number) => unknown };

/**
 * Without its samples, the choir's voice: harmonics through the formants of
 * "aah", a body below them, a hall around.
 */
function createChoir(): { voice: Tone.PolySynth; nodes: Tone.ToneAudioNode[] } {
    const hall = new Tone.Freeverb({ roomSize: 0.8, dampening: 3200 });
    hall.wet.value = 0.3;
    hall.toDestination();
    const out = new Tone.Gain(1.6).connect(hall);
    const nodes: Tone.ToneAudioNode[] = [hall, out];
    const vibrato = new Tone.Vibrato({ frequency: 5.3, depth: 0.07 });
    nodes.push(vibrato);
    for (const [frequency, Q, level] of [[800, 5, 1], [1150, 7, 0.6], [2900, 9, 0.25]]) {
        const filter = new Tone.Filter({ type: 'bandpass', frequency, Q });
        const gain = new Tone.Gain(level);
        vibrato.connect(filter);
        filter.connect(gain);
        gain.connect(out);
        nodes.push(filter, gain);
    }
    const body = new Tone.Filter({ type: 'lowpass', frequency: 650, Q: 0.4 });
    const bodyGain = new Tone.Gain(0.35);
    vibrato.connect(body);
    body.connect(bodyGain);
    bodyGain.connect(out);
    nodes.push(body, bodyGain);
    const voice = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
        envelope: { attack: 0.06, decay: 0.25, sustain: 0.85, release: 0.28 },
        volume: -6,
    }).connect(vibrato);
    nodes.push(voice);
    return { voice, nodes };
}

export const ConductorGame: React.FC<{
    level: RhythmLevel;
    tempoScale: number;
    onFinish: (results: NoteResult[]) => void;
    onQuit: () => void;
}> = ({ level, tempoScale, onFinish, onQuit }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    /** Names and grades are DOM over the canvas: Pixi text churn (a label per
     *  grade, made and dropped all game long) upset its texture pool on teardown. */
    const namesRef = useRef<HTMLDivElement>(null);
    const popLayerRef = useRef<HTMLDivElement>(null);
    const bpm = level.bpm * tempoScale;
    /** A quarter note, which the level's positions count; and the beat, which you conduct (an eighth or a dotted quarter in 6/8). */
    const quarterSec = 60 / bpm;
    const meter = useMemo(() => countingOf(level), [level]);
    const { pulse } = meter;
    const beatSec = quarterSec * pulse;
    const beats = useMemo(() => choirBeats(level), [level]);
    const shift = useMemo(() => choirShift(level.notes), [level]);
    const singers = useMemo(() => singersOf(level.notes, shift), [level, shift]);
    const singerOf = useMemo(() => {
        const at = new Map(singers.map((s, k) => [s.midi, k]));
        return level.notes.map(n => at.get((n.midi ?? 60) + shift) ?? 0);
    }, [level, singers, shift]);
    const play = useRef<Play>({
        started: false, finished: false, downbeat: 0, k: 0, holding: false, holder: null, pressAt: 0, releaseAt: 0,
        entry: null, results: [], combo: 0, pos: 0, presses: [], endedAt: null,
    });
    const [hud, setHud] = useState({ started: false, countIn: 0, combo: 0, done: 0, yourBpm: 0 });
    const audio = useRef<{ choir: Choir; piano: Tone.PolySynth; tick: Tone.Synth; nodes: Tone.ToneAudioNode[] } | null>(null);
    // The Spellsinger is fetched while the intro is up.
    useEffect(() => preload(SOUNDS.choir), []);
    /** What is sounding, by note ("m3" for the tune, "b12" for the piano), at what frequency. */
    const sounding = useRef(new Map<string, number>());
    /** Grades and remarks waiting for the frame loop to show them over a singer. */
    const popups = useRef<Array<{ text: string; color: number; k: number }>>([]);
    const moods = useRef<Map<number, { mood: Mood; until: number }>>(new Map());
    const onFinishRef = useRef(onFinish);
    useEffect(() => { onFinishRef.current = onFinish; });

    const latency = getLatency();
    const backing = level.backing ?? [];
    const noteOf = (key: string): RhythmNote => (key[0] === 'm' ? level.notes : backing)[+key.slice(1)];
    const feel = (k: number, mood: Mood) => moods.current.set(k, { mood, until: performance.now() + 900 });

    // ------------------------------------------------ sound, following the song's position
    const attack = (key: string) => {
        const a = audio.current;
        if (!a || sounding.current.has(key)) return;
        const melody = key[0] === 'm';
        const f = Tone.Frequency((noteOf(key).midi ?? 60) + (melody ? shift : 0), 'midi').toFrequency();
        sounding.current.set(key, f);
        if (melody) a.choir.triggerAttack(f, Tone.now());
        else a.piano.triggerAttack(f, Tone.now(), 0.55);
    };
    const letGo = (key: string) => {
        const a = audio.current, f = sounding.current.get(key);
        if (f === undefined) return;
        sounding.current.delete(key);
        (key[0] === 'm' ? a?.choir : a?.piano)?.triggerRelease(f, Tone.now());
    };
    const eachNote = (fn: (n: RhythmNote, key: string) => void) => {
        level.notes.forEach((n, i) => fn(n, `m${i}`));
        backing.forEach((n, i) => fn(n, `b${i}`));
    };
    /** Everything that sounds at `pos`: what begins there, and — after a pause — what should still be sounding. */
    const soundAt = (pos: number) => eachNote((n, key) => { if (n.start <= pos + 1e-6 && n.start + n.dur > pos + 1e-6) attack(key); });
    /** The song moves on from `from` to `to` within the beat ending at `end`. */
    const move = (from: number, to: number, end: number) => eachNote((n, key) => {
        if (n.start > from + 1e-6 && n.start <= to + 1e-6 && n.start < end - 1e-6) attack(key);
        // A note ending inside the beat stops as the song passes; one ending with it, at the let-go.
        if (sounding.current.has(key) && n.start + n.dur <= to + 1e-6 && n.start + n.dur < end - 1e-6) letGo(key);
    });
    /** The beat ending at `end` is over: whatever ended with it stops; what carries on, carries on. */
    const endBeat = (end: number) => {
        for (const key of [...sounding.current.keys()]) {
            const n = noteOf(key);
            if (n.start + n.dur <= end + 1e-6) letGo(key);
        }
    };
    const silenceAll = () => { for (const key of [...sounding.current.keys()]) letGo(key); };

    // ------------------------------------------------ the game
    /** Who the ring is on at a point of the song: whoever sings there, or — in a rest — whoever sings next. */
    const cueSinger = (pos: number): number => {
        const now = noteAt(level, pos);
        if (now !== null) return singerOf[now];
        const next = level.notes.findIndex(n => n.start >= pos - 1e-6);
        return singerOf[next >= 0 ? next : level.notes.length - 1] ?? 0;
    };

    const record = (k: number, r: NoteResult, why: string | null) => {
        const p = play.current;
        p.results[k] = r;
        const g = noteGrade(r);
        p.combo = g === 'miss' ? 0 : p.combo + 1;
        // A word only when a beat was not perfect: one every beat is noise; the run counter says the rest.
        if (why || g !== 'perfect') popups.current.push({ text: why ?? LABEL[g], color: GRADE_HEX[g], k: cueSinger(beats[k].start + beats[k].length / 2) });
        const recent = p.presses.slice(-5);
        const yourBpm = recent.length >= 2 ? Math.round(60 / ((recent[recent.length - 1] - recent[0]) / (recent.length - 1))) : 0;
        setHud(h => ({ ...h, combo: p.combo, done: k + 1, yourBpm }));
    };

    // Starting takes a moment (the audio, the samples): a second press meanwhile must not start twice.
    const starting = useRef(false);
    const start = async () => {
        const p = play.current;
        if (p.started || starting.current) return;
        starting.current = true;
        await Tone.start();
        const click = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: -21 }).toDestination();
        const accent = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 }, volume: -16 }).toDestination();
        // A soft tick as the ring closes: the beat is up.
        const tick = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }, volume: -24 }).toDestination();
        // The choir sings with The Spellsinger's voice, in a hall.
        let voice: Choir, nodes: Tone.ToneAudioNode[];
        const spell = await sampler(SOUNDS.choir, { release: 0.3, volume: -2 });
        if (spell) {
            const hall = new Tone.Freeverb({ roomSize: 0.75, dampening: 3400 });
            hall.wet.value = 0.18;
            hall.toDestination();
            spell.connect(hall);
            voice = spell;
            nodes = [hall, spell];
        } else {
            ({ voice, nodes } = createChoir());
        }
        const piano = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 3, modulationIndex: 1.4,
            envelope: { attack: 0.004, decay: 1.3, sustain: 0.25, release: 0.6 },
            modulationEnvelope: { attack: 0.004, decay: 0.4, sustain: 0.1, release: 0.5 },
            volume: -15,
        }).toDestination();
        audio.current = { choir: voice, piano, tick, nodes: [...nodes, click, accent, tick, piano] };
        // A bar counted in at the piece's tempo (up to the pickup, if it has one); the first beat comes in on the next one.
        const t0 = scheduleNow() + LEAD_SECONDS;
        for (let k = 0; k < meter.countIn; k++) {
            const down = meter.inBar(k - meter.countIn) === 0;
            (down ? accent : click).triggerAttackRelease(down ? 'C7' : 'G6', 0.02, t0 + k * beatSec);
        }
        p.downbeat = t0 + meter.countIn * beatSec;
        p.started = true;
        setHud(h => ({ ...h, started: true }));
    };

    const press = (heard: number, holder: string | number) => {
        const p = play.current;
        if (!p.started) { void start(); return; }
        if (p.finished || p.k >= beats.length) return;
        // A second key while holding: the next beat, with no lift at all.
        if (p.holding) release(heard, p.holder);
        if (p.k >= beats.length) return;
        // Where this beat falls: the downbeat the count-in leads to, then a beat after the last press.
        let entry: number;
        if (p.k === 0) {
            entry = heard - latency - p.downbeat;
            if (entry < -PRESS.ok) {
                popups.current.push({ text: 'Wait for one', color: 0x9a9aa8, k: cueSinger(0) });
                return;
            }
        } else {
            entry = heard - (p.presses[p.presses.length - 1] + beats[p.k - 1].length * quarterSec);
        }
        p.holding = true;
        p.holder = holder;
        p.pressAt = heard;
        p.entry = entry;
        p.presses.push(heard);
        p.pos = beats[p.k].start;
        soundAt(p.pos);
        // The ring closes a beat from now: tick then.
        audio.current?.tick.triggerAttackRelease('E6', 0.03, Tone.now() + beats[p.k].length * quarterSec);
    };

    function release(heard: number, holder: string | number | null) {
        const p = play.current;
        if (!p.holding || holder !== p.holder) return;
        const k = p.k, b = beats[k];
        const hold = (heard - p.pressAt) - b.length * quarterSec;
        const r = beatResult(p.entry, hold);
        const early = hold + LIFT < -HOLD.good, late = hold + LIFT > HOLD.good;
        const entry = p.entry ?? 0;
        record(k, r, r.release === 'miss' ? (early ? 'Cut short' : 'Held too long')
            : r.press === 'miss' ? (entry > 0 ? 'Late in' : 'Rushed') : null);
        const singer = cueSinger(Math.min(p.pos, b.start + b.length - 1e-3));
        if (early) feel(singer, 'cut');
        else if (late) feel(singer, 'breathless');
        p.holding = false;
        p.holder = null;
        p.releaseAt = heard;
        p.pos = b.start + b.length;
        endBeat(p.pos);
        p.k++;
        if (p.k >= beats.length) p.endedAt = heard;
    }

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onQuit(); return; }
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.repeat) press(heardAt(e.timeStamp), e.key);
        };
        const up = (e: KeyboardEvent) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            release(heardAt(e.timeStamp), e.key);
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    });
    // Every MIDI key is a beat; a new key before the last is let go is the next beat, with no lift.
    useMidiNotes({
        onNoteOn: hit => press(heardAt(hit.timestamp), hit.note),
        onNoteOff: note => release(heardNow(), note),
    });

    // The scene.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        let destroyed = false;
        const app = new PIXI.Application();
        const setup = async () => {
            await app.init({ resizeTo: host, antialias: true, background: '#0a0812', resolution: window.devicePixelRatio || 1, autoDensity: true });
            if (destroyed) { app.destroy(true); return; }
            host.appendChild(app.canvas);

            const backdrop = new PIXI.Graphics();
            const counter = new PIXI.Graphics();
            const halos = new PIXI.Graphics();
            const choir = new PIXI.Container();
            const ring = new PIXI.Graphics();
            const sparks = new PIXI.Graphics();
            const maestro = new PIXI.Graphics();
            app.stage.addChild(backdrop, counter, halos, choir, ring, sparks, maestro);

            // Each singer: a robe, a folder — drawn once — and a face, redrawn as it sings.
            const figures = singers.map((s: Singer, k: number) => {
                const c = new PIXI.Container();
                const color = voiceColor(s.height);
                const skin = SKIN[(k * 5 + 1) % SKIN.length], hair = HAIR[(k * 3 + 2) % HAIR.length];
                const body = new PIXI.Graphics();
                body.poly([-15, 16, 15, 16, 25, 96, -25, 96]).fill({ color });
                body.poly([-15, 16, 15, 16, 25, 96, -25, 96]).fill({ color: 0x000000, alpha: 0.25 });
                body.poly([-15, 16, 15, 16, 20, 50, -20, 50]).fill({ color, alpha: 0.9 });
                body.poly([-8, 16, 8, 16, 0, 28]).fill({ color: 0xffffff, alpha: 0.9 });
                body.roundRect(-14, 44, 28, 19, 2).fill({ color: 0x15151c });
                body.moveTo(-11, 47).lineTo(11, 47).stroke({ width: 1, color: 0xffffff, alpha: 0.15 });
                body.circle(-14, 55, 3.6).fill({ color: skin });
                body.circle(14, 55, 3.6).fill({ color: skin });
                const face = new PIXI.Graphics();
                c.addChild(body, face);
                choir.addChild(c);
                return { c, face, color, skin, hair, style: k % 4 };
            });

            // The layout follows the window.
            let W = 0, H = 0, headY = 0, x0 = 0, laneW = 0, sc = 1;
            const laneX = (k: number) => x0 + laneW * (k + 0.5);
            const relayout = () => {
                W = app.screen.width; H = app.screen.height;
                x0 = W * 0.08;
                laneW = (W * 0.84) / Math.max(1, singers.length);
                sc = Math.max(0.6, Math.min(1.7, laneW / 70, H / 520));
                headY = Math.round(H * 0.34);
                figures.forEach((f, k) => { f.c.position.set(laneX(k), headY); f.c.scale.set(sc); });
                // Each name on its singer's robe.
                [...(namesRef.current?.children ?? [])].forEach((el, k) => {
                    const e = el as HTMLElement;
                    e.style.left = `${laneX(k)}px`;
                    e.style.top = `${headY + 80 * sc}px`;
                    e.style.fontSize = `${Math.round(13 * sc)}px`;
                });
                backdrop.clear();
                // A glow on the stage, and the risers.
                backdrop.ellipse(W / 2, headY + 60 * sc, W * 0.5, 150 * sc).fill({ color: 0x2a2140, alpha: 0.35 });
                backdrop.rect(0, headY + 100 * sc, W, H).fill({ color: 0x151221 });
                backdrop.moveTo(0, headY + 100 * sc).lineTo(W, headY + 100 * sc).stroke({ width: 2, color: 0xffffff, alpha: 0.06 });
            };

            // Face: eyes and mouth tell what the singer is doing; `red` how far past the beat they are holding.
            const drawFace = (k: number, state: 'idle' | 'ready' | 'singing' | Mood, open: number, red: number) => {
                const f = figures[k];
                const g = f.face;
                g.clear();
                g.circle(0, 0, 15).fill({ color: red > 0 ? mix(f.skin, 0xe23b3b, Math.min(0.75, red)) : f.skin });
                const cap: number[] = [];
                for (let a = 0; a <= 12; a++) {
                    const ang = Math.PI + (a / 12) * Math.PI;
                    cap.push(Math.cos(ang) * 15.8, Math.sin(ang) * 15.8 + 1);
                }
                cap.push(12, -3, -12, -3);
                g.poly(cap).fill({ color: f.hair });
                if (f.style === 1) g.circle(0, -17, 6).fill({ color: f.hair });
                if (f.style === 2) { g.roundRect(-18, -4, 6, 22, 3).fill({ color: f.hair }); g.roundRect(12, -4, 6, 22, 3).fill({ color: f.hair }); }
                if (f.style === 3) for (let a = 0; a < 5; a++) g.circle(-12 + a * 6, -13 - (a % 2) * 3, 5).fill({ color: f.hair });
                const ink = 0x2a1a14;
                if ((state === 'singing' && red < 0.35) || state === 'happy') {
                    // Eyes closed, happy.
                    for (const sx of [-5.5, 5.5]) g.moveTo(sx - 3, 0).lineTo(sx, -2.4).lineTo(sx + 3, 0).stroke({ width: 1.6, color: ink });
                    g.circle(-9, 5, 3).fill({ color: 0xff7a8a, alpha: 0.35 });
                    g.circle(9, 5, 3).fill({ color: 0xff7a8a, alpha: 0.35 });
                } else if (state === 'cut' || state === 'breathless' || state === 'singing') {
                    // Wide eyes: surprised, or straining.
                    for (const sx of [-5.5, 5.5]) g.circle(sx, -1, 2.6).fill({ color: 0xffffff }).circle(sx, -1, 1.4).fill({ color: ink });
                } else {
                    for (const sx of [-5.5, 5.5]) g.circle(sx, -1, 1.8).fill({ color: ink });
                    if (state === 'sad') for (const sx of [-5.5, 5.5]) g.moveTo(sx - 3, -6 + (sx < 0 ? 1.5 : 0)).lineTo(sx + 3, -6 + (sx < 0 ? 0 : 1.5)).stroke({ width: 1.3, color: ink });
                }
                if (state === 'singing') g.ellipse(0, 7.5, 3.6 + open, 2.6 + 3.2 * open).fill({ color: 0x5b1a24 });
                else if (state === 'ready') g.circle(0, 8, 1.9 + open).fill({ color: 0x5b1a24 });
                else if (state === 'cut') g.circle(0, 8.5, 3).stroke({ width: 1.6, color: 0x5b1a24 });
                else if (state === 'breathless') g.ellipse(0, 8, 5, 4).fill({ color: 0x5b1a24 });
                else if (state === 'sad') g.moveTo(-4, 9.5).lineTo(0, 7.5).lineTo(4, 9.5).stroke({ width: 1.6, color: ink });
                else if (state === 'happy') g.moveTo(-4, 7).lineTo(0, 10).lineTo(4, 7).stroke({ width: 1.8, color: ink });
                else g.moveTo(-3.5, 8).lineTo(3.5, 8).stroke({ width: 1.6, color: ink });
            };
            const lastFace: string[] = singers.map(() => '');

            // Every stroke is its own path (Pixi v8 joins an arc onto the path's last point).
            const arc = (g: PIXI.Graphics, cx: number, cy: number, r: number, from: number, to: number, style: PIXI.StrokeInput) => {
                const steps = Math.max(2, Math.ceil(Math.abs(to - from) / (Math.PI / 40)));
                g.moveTo(cx + r * Math.cos(from), cy + r * Math.sin(from));
                for (let s = 1; s <= steps; s++) {
                    const a = from + (to - from) * (s / steps);
                    g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
                }
                g.stroke(style);
            };

            const floating: Array<{ x: number; y: number; born: number; k: number }> = [];
            let lastSpark = 0;
            let lastCountIn = 0;
            let landedAt = -1;
            let landedBeat = -1;
            const pattern = beatPattern(meter.beatsPerBar);
            /** Where the baton lands for the k-th beat (count-in beats are negative). */
            const landing = (k: number) => pattern[meter.inBar(k) % pattern.length];

            app.ticker.add(() => {
                if (app.screen.width !== W || app.screen.height !== H) relayout();
                const p = play.current;
                const heard = heardNow();
                const wall = performance.now();
                const target = p.k < beats.length ? beats[p.k].length * quarterSec : beatSec;

                // The song moves on while a beat is held, at the piece's tempo — up to the end of the beat.
                let progress = 0, over = 0;
                if (p.holding) {
                    const b = beats[p.k];
                    const held = heard - p.pressAt;
                    progress = Math.min(1, Math.max(0, held / target));
                    over = Math.max(0, held - target);
                    const pos = b.start + progress * b.length;
                    if (pos > p.pos) { move(p.pos, pos, b.start + b.length); p.pos = pos; }
                    // A whole beat too long: out of breath, and the beat ends for them.
                    if (over > Math.max(beatSec, 0.6)) {
                        const singer = cueSinger(b.start + b.length - 1e-3);
                        popups.current.push({ text: 'Out of breath!', color: 0xf87171, k: singer });
                        release(heard, p.holder);
                        feel(singer, 'breathless');
                    }
                } else if (p.started && sounding.current.size > 0 && p.k > 0 && heard - p.releaseAt > MAX_LIFT) {
                    // Nobody is conducting: the choir stops and waits.
                    silenceAll();
                }
                if (p.holding && landedBeat !== p.k) { landedBeat = p.k; landedAt = wall; }

                // The end: the last beat let go, a moment for the last note to ring.
                if (p.endedAt !== null && !p.finished && heard - p.endedAt > 0.9) {
                    p.finished = true;
                    silenceAll();
                    onFinishRef.current(p.results);
                }

                // The count-in, big, before the first beat comes in.
                const countT = heard - p.downbeat;          // < 0 during the count-in
                const counting = p.started && p.k === 0 && !p.holding && countT < 0;
                const left = counting ? Math.ceil(-countT / beatSec) : 0;
                if (left !== lastCountIn) { lastCountIn = left; setHud(h => ({ ...h, countIn: left })); }

                // The bar's beats, over the choir: done, and the one being held filling.
                counter.clear();
                const bpb = meter.beatsPerBar;
                const inBar = meter.inBar(Math.min(p.k, beats.length - 1));
                const barLeft = W / 2 - ((bpb - 1) / 2) * 34;
                const cyC = Math.max(58, headY - 110 * sc);
                for (let i = 0; i < bpb; i++) {
                    const done = i < inBar || (p.holding && i === inBar && progress >= 1);
                    const cxC = barLeft + i * 34, r = i === 0 ? 9 : 7;
                    counter.circle(cxC, cyC, r).fill({ color: 0xffffff, alpha: done ? 0.85 : 0.14 });
                    if (p.holding && i === inBar && progress < 1) arc(counter, cxC, cyC, r + 4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2, { width: 3, color: ACCENT, alpha: 0.95 });
                }

                // Who the ring is on: whoever sings now, or — in a rest, or between beats — whoever sings next.
                const cuePos = p.holding ? p.pos : p.k < beats.length ? beats[p.k].start : level.length;
                const cueK = cueSinger(Math.min(cuePos, level.length - 1e-3));
                const singingNow = new Set<number>();
                for (const key of sounding.current.keys()) if (key[0] === 'm') singingNow.add(singerOf[+key.slice(1)]);

                // The choir.
                halos.clear();
                figures.forEach((f, k) => {
                    const mood = moods.current.get(k);
                    const feeling = mood && mood.until > wall ? mood.mood : null;
                    let state: 'idle' | 'ready' | 'singing' | Mood = feeling ?? 'idle';
                    let open = 0, red = 0;
                    if (singingNow.has(k)) {
                        state = 'singing';
                        open = 0.55 + 0.45 * Math.sin(wall / 70 + k);
                        red = p.holding ? Math.min(1, over / Math.max(beatSec, 0.6)) : 0;
                    } else if (k === cueK && !feeling && (!p.holding || progress > 0.6)) {
                        state = 'ready';
                        open = p.holding ? (progress - 0.6) * 2.5 : 0.6 + 0.4 * Math.sin(wall / 200);
                    }
                    const key = `${state}:${open.toFixed(1)}:${red.toFixed(2)}`;
                    if (key !== lastFace[k]) { lastFace[k] = key; drawFace(k, state, open, red); }
                    const hx = laneX(k);
                    f.c.position.set(hx, headY + (state === 'singing' ? -2.5 * sc * Math.sin(wall / 160) : 0));
                    f.c.scale.set(sc * (state === 'singing' ? 1.06 : 1));
                    if (state === 'singing') halos.circle(hx, headY, 30 * sc).fill({ color: red > 0 ? mix(f.color, 0xe23b3b, red) : f.color, alpha: 0.22 + 0.1 * Math.sin(wall / 120) });
                });

                // The ring: it fills as the beat goes by — let go as it closes. Past it, it turns red.
                ring.clear();
                if (p.started && p.k < beats.length) {
                    const cx = laneX(cueK), cy = headY + 40 * sc, R = 64 * sc;
                    const color = figures[cueK]?.color ?? ACCENT;
                    const rest = p.holding && noteAt(level, p.pos) === null;
                    ring.circle(cx, cy, R).stroke({ width: 3, color: 0xffffff, alpha: 0.1 });
                    for (let q = 0; q < 4; q++) {
                        const a = -Math.PI / 2 + q * Math.PI / 2;
                        ring.moveTo(cx + (R - 6) * Math.cos(a), cy + (R - 6) * Math.sin(a)).lineTo(cx + (R + 6) * Math.cos(a), cy + (R + 6) * Math.sin(a))
                            .stroke({ width: q === 0 ? 3 : 1.5, color: 0xffffff, alpha: q === 0 ? 0.7 : 0.3 });
                    }
                    // Held: as far as the beat has gone. Counting in: round once a beat, at the piece's tempo.
                    const fill = p.holding ? progress : counting ? ((countT / beatSec) % 1 + 1) % 1 : 0;
                    if (fill > 0) {
                        arc(ring, cx, cy, R, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2, { width: 16, color, alpha: rest ? 0.08 : 0.18, cap: 'round' });
                        arc(ring, cx, cy, R, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2, { width: 6, color: rest ? 0xffffff : color, alpha: rest ? 0.5 : 0.95, cap: 'round' });
                    }
                    if (p.holding && progress >= 1) {
                        // Closed: a flash, then red the longer it is held.
                        const r = Math.min(1, over / Math.max(beatSec, 0.6));
                        const flash = Math.max(0, 1 - over / 0.15);
                        ring.circle(cx, cy, R).stroke({ width: 6 + 6 * r, color: mix(0xffffff, 0xf23b3b, Math.min(1, r * 2)), alpha: 0.6 + 0.4 * flash });
                    } else if (!p.holding && !counting) {
                        // Waiting for the beat to be struck.
                        const pulse = 0.5 + 0.5 * Math.sin(wall / 140);
                        ring.circle(cx, cy, R + 4).stroke({ width: 2, color, alpha: 0.25 + 0.4 * pulse });
                    }
                }

                // Little notes float up from whoever sings.
                if (singingNow.size > 0 && wall - lastSpark > 230) {
                    lastSpark = wall;
                    for (const k of singingNow) floating.push({ x: laneX(k) + (Math.random() - 0.5) * 20 * sc, y: headY - 18 * sc, born: wall, k });
                }
                sparks.clear();
                for (let j = floating.length - 1; j >= 0; j--) {
                    const q = floating[j];
                    const age = (wall - q.born) / 1300;
                    if (age >= 1) { floating.splice(j, 1); continue; }
                    const x = q.x + Math.sin(age * 6 + q.born) * 8 * sc, y = q.y - age * 90 * sc;
                    const c = voiceColor(singers[q.k].height), a = (1 - age) * 0.9;
                    sparks.ellipse(x, y, 4 * sc, 3 * sc).fill({ color: c, alpha: a });
                    sparks.moveTo(x + 3.6 * sc, y).lineTo(x + 3.6 * sc, y - 12 * sc).stroke({ width: 1.5 * sc, color: c, alpha: a });
                }

                // The conductor, from behind. The baton moves with your beats: it lands as you
                // press, travels to the next beat of the pattern while you hold, and waits there.
                maestro.clear();
                const ms = Math.max(0.6, Math.min(1.2, H / 700));
                const cx = W / 2, base = H;
                const sR = { x: cx + 44 * ms, y: base - 50 * ms }, sL = { x: cx - 44 * ms, y: base - 50 * ms };
                let from = landing(p.k), to = from, ph = 0, bounce = 0, poised = 0;
                if (counting) {
                    // The count-in: the baton beats the piece's tempo by itself.
                    const bt = countT / beatSec;
                    const kb = Math.floor(bt);
                    from = landing(kb); to = landing(kb + 1); ph = bt - kb; bounce = 0.55;
                } else if (p.holding) {
                    from = landing(p.k); to = landing(p.k + 1); ph = progress; bounce = 0.55;
                } else {
                    // Poised over the next beat, ready to strike it.
                    poised = 0.25;
                }
                const e = ph * ph * (3 - 2 * ph);
                const px = from[0] + (to[0] - from[0]) * e, py = from[1] + (to[1] - from[1]) * e - bounce * Math.sin(Math.PI * ph) - poised;
                const hand = { x: cx + 105 * ms + px * 40 * ms, y: base - 140 * ms + py * 36 * ms };
                const dirX = hand.x - sR.x, dirY = hand.y - sR.y, len = Math.hypot(dirX, dirY) || 1;
                maestro.moveTo(sR.x, sR.y).lineTo(hand.x, hand.y).stroke({ width: 13 * ms, color: 0x1f2433, cap: 'round' });
                maestro.moveTo(hand.x, hand.y).lineTo(hand.x + (dirX / len) * 46 * ms - 10 * ms, hand.y + (dirY / len) * 46 * ms - 14 * ms)
                    .stroke({ width: 2.6 * ms, color: 0xf5f5f5, cap: 'round' });
                maestro.circle(hand.x, hand.y, 6.5 * ms).fill({ color: 0xe8c39e });
                // The beat, struck: a flash where the baton lands.
                const sinceLand = (wall - landedAt) / 1000;
                if (p.holding && sinceLand >= 0 && sinceLand < 0.25) {
                    maestro.circle(hand.x, hand.y, (8 + 26 * sinceLand / 0.25) * ms).stroke({ width: 2, color: 0xffffff, alpha: 0.7 * (1 - sinceLand / 0.25) });
                }
                // The left hand reaches out to whoever sings.
                let lh = { x: cx - 100 * ms, y: base - 100 * ms };
                const toward = singingNow.size > 0 ? [...singingNow][0] : -1;
                if (toward >= 0) {
                    const tgt = { x: laneX(toward), y: headY + 24 * sc };
                    const dx = tgt.x - sL.x, dy = tgt.y - sL.y, d = Math.hypot(dx, dy) || 1, reach = Math.min(d * 0.45, 125 * ms);
                    lh = { x: sL.x + (dx / d) * reach, y: sL.y + (dy / d) * reach };
                    const c = figures[toward].color;
                    maestro.moveTo(lh.x, lh.y).lineTo(tgt.x, tgt.y).stroke({ width: 9, color: c, alpha: 0.1 });
                    maestro.moveTo(lh.x, lh.y).lineTo(tgt.x, tgt.y).stroke({ width: 2, color: c, alpha: 0.4 });
                }
                maestro.moveTo(sL.x, sL.y).lineTo(lh.x, lh.y).stroke({ width: 13 * ms, color: 0x1f2433, cap: 'round' });
                maestro.circle(lh.x, lh.y, (toward >= 0 ? 8.5 : 6.5) * ms).fill({ color: 0xe8c39e });
                maestro.roundRect(cx - 60 * ms, base - 62 * ms, 120 * ms, 90 * ms, 30 * ms).fill({ color: 0x1f2433 });
                maestro.poly([cx - 9 * ms, base - 62 * ms, cx + 9 * ms, base - 62 * ms, cx, base - 44 * ms]).fill({ color: 0xf5f5f5, alpha: 0.9 });
                maestro.circle(cx, base - 82 * ms, 21 * ms).fill({ color: 0x3a2a1e });

                // Grades over the singers: a DOM label each, which rises and fades on its own.
                const layer = popLayerRef.current;
                for (const pp of popups.current.splice(0)) {
                    if (!layer) continue;
                    const el = document.createElement('div');
                    el.textContent = pp.text;
                    el.className = 'conductor-pop';
                    el.style.left = `${laneX(pp.k)}px`;
                    el.style.top = `${headY - 52 * sc}px`;
                    el.style.color = `#${pp.color.toString(16).padStart(6, '0')}`;
                    el.addEventListener('animationend', () => el.remove());
                    layer.appendChild(el);
                }
            });
        };
        void setup();
        return () => {
            destroyed = true;
            if (app.renderer) app.destroy(true, { children: true });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [level]);

    // Sound off when leaving.
    useEffect(() => () => {
        const a = audio.current;
        audio.current = null;
        a?.nodes.forEach(node => node.dispose());
    }, []);

    const bar = beats[Math.min(hud.done, beats.length - 1)].bar;
    return (
        <div
            style={{ position: 'relative', flex: 1, minHeight: 0, touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => { e.preventDefault(); press(heardAt(e.timeStamp), 'pointer'); }}
            onPointerUp={e => release(heardAt(e.timeStamp), 'pointer')}
            onPointerCancel={e => release(heardAt(e.timeStamp), 'pointer')}
        >
            <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
            <style>{POP_CSS}</style>
            <div ref={namesRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {singers.map(s => <div key={s.midi} style={nameStyle}>{s.name}</div>)}
            </div>
            <div ref={popLayerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />
            <div style={hudStyle}>
                <span style={{ fontWeight: 700 }}>{level.title}</span>
                <span style={{ color: '#9a9aa8' }}>
                    {tempoMark(bpm, pulse)}{hud.yourBpm > 0 ? ` · yours ${hud.yourBpm}` : ''} · bar {bar}/{meter.bars}
                </span>
                {hud.combo > 1 && <span style={{ color: '#4ade80', fontWeight: 700 }}>×{hud.combo}</span>}
                <span style={{ flex: 1 }} />
                <button onClick={e => { e.stopPropagation(); onQuit(); }} onPointerDown={e => e.stopPropagation()} style={quitStyle}>✕ Quit</button>
            </div>
            {!hud.started && (
                <div style={{ ...centerStyle, justifyContent: 'flex-end', paddingBottom: '26vh' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>Conduct the choir, a beat at a time</div>
                    <div style={{ color: '#b0b0bc', maxWidth: 540, lineHeight: 1.5 }}>
                        Hold <b>space</b> (or touch, or any MIDI key) for one beat: the ring fills as it goes by, and whoever has a
                        note sings it. Let go as the ring closes and press again straight away. Let go early and the singer is cut
                        off; hold on and they run out of breath. The song follows you.
                    </div>
                    <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Press to start — a bar is counted in, then come in on the next beat</div>
                </div>
            )}
            {hud.started && hud.countIn > 0 && <div style={{ ...centerStyle, justifyContent: 'flex-end', paddingBottom: '22vh', fontSize: '4.5rem', fontWeight: 800 }}>{hud.countIn}</div>}
        </div>
    );
};

const LABEL: Record<Grade, string> = { perfect: 'Perfect', good: 'Good', ok: 'OK', miss: 'Miss' };
const POP_CSS = `
.conductor-pop { position: absolute; transform: translate(-50%, -50%); font: 700 19px system-ui, sans-serif; white-space: nowrap;
  animation: conductor-pop 0.75s ease-out forwards; }
@keyframes conductor-pop { from { opacity: 1; transform: translate(-50%, -50%); } to { opacity: 0; transform: translate(-50%, calc(-50% - 30px)); } }`;
const nameStyle: React.CSSProperties = {
    position: 'absolute', left: -100, top: -100, transform: 'translate(-50%, -50%)',
    color: 'white', opacity: 0.85, fontWeight: 700, fontFamily: 'system-ui, sans-serif',
};
const hudStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', gap: '1rem', alignItems: 'center',
    padding: '0.8rem 1.2rem', fontSize: '0.95rem', background: 'linear-gradient(#0a0812dd, transparent)', pointerEvents: 'none',
};
const quitStyle: React.CSSProperties = {
    pointerEvents: 'auto', padding: '0.35rem 0.8rem', borderRadius: '8px', background: 'transparent',
    color: 'white', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
};
const centerStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.8rem', textAlign: 'center', padding: '1rem', pointerEvents: 'none',
};

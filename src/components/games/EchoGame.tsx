import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import * as Tone from 'tone';
import { useMidiNotes } from '../../hooks/useMidi';
import { heardAt, heardNow, scheduleNow } from '../../games/clock';
import { getLatency } from '../../games/latency';
import { PRESS, RELEASE, grade, type NoteResult } from '../../games/judge';
import { citiesOf, outcomeOf, packetsOf, type EchoLevel, type Outcome, type Packet } from '../../games/echo';
import { mix, voiceColor } from './ink';
import { SOUNDS, heldSampler, heldSynth, octavesInto, preload, sampler, type HeldVoice, type SampleSet } from './sounds';

/**
 * Rhythm echo — a musical Missile Command, with a good ending. The star
 * sings a canon; every note it sings falls as a bolt of plasma on the city
 * of its pitch, and crosses the horizon the satellite watches just as your
 * voice — the canon's second, a bar or two behind — should sing it. Hold
 * (space, a touch, any MIDI key) as it crosses and let go as its tail does:
 * the city's turret fires, and your note sounds for as long as you hold.
 * Let go too soon, or never fire, and the rest of the bolt falls on the
 * city — flames rise from it; hold on too long and the turret overheats —
 * flames rise from the turret. A countdown runs to the shield dome, charged
 * as your part ends: then the star's last notes, which no voice answers,
 * fall hollow and burst harmlessly on it, the fires go out and the city
 * lights come on. Judged press and release, on the audio clock as heard
 * less the calibrated delay (games/clock.ts, games/latency.ts).
 */

const CALL = 0x22d3ee;        // the star, and its song
const PLASMA = 0xe879f9;      // a bolt on its way down
const HOT = 0xfb923c;         // plasma past the horizon, falling on a city
const LINE = 0x67e8f9;        // the horizon, and the dome
const LEAD_SECONDS = 0.4;
const RING_LIFE = 1.1;
/** After the last bolt: the fires go out, the lights come on, fireworks over the dome. */
const ENDING = 3.4;
/** The countdown to the dome is called out for the last bolts. */
const COUNTDOWN = 5;

type Pt = { x: number; y: number };
// The world, in scene units (about 1000 × 720, the origin in the middle).
const STAR: Pt = { x: 0, y: -300 };
const HORIZON_Y = 90;
const GROUND_Y = 305;
const SAT: Pt = { x: -455, y: HORIZON_Y };
const DOME = { cx: 0, cy: GROUND_Y + 4, rx: 480, ry: 168 };
const CITY_SPAN = { from: -375, to: 440 };

/** How an answer is being defended. */
interface Shot {
    pressError: number | null;
    releaseError: number | null;
    outcome: Outcome | null;
}

interface Play {
    started: boolean;
    finished: boolean;
    /** Audio-context time of the first downbeat, after the bar counted in. */
    downbeat: number;
    /** The next answer to defend. */
    i: number;
    holding: boolean;
    shots: Shot[];
    results: NoteResult[];
    combo: number;
    /** View time the dome went up, and the ending began. */
    domeAt: number | null;
    endingAt: number | null;
}

interface City {
    x: number;
    color: number;
    name: string;
    turret: Pt;
    /** Where its bolts cross the horizon — where the turret fires. */
    aim: Pt;
    buildings: Array<{ x: number; w: number; h: number; windows: Array<[number, number]> }>;
}

/** A packet's flight: from the star, straight down to its city, at a speed that brings its head to the horizon on time. */
interface Bolt { pk: Packet; city: number | null; dir: Pt; v: number; sH: number; sDome: number; L: number; color: number }

interface Particle { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; color: number; kind: 'flame' | 'smoke' | 'spark' }

/** A sound for what happens in the sky: a boom, a hiss, the dome's chord, a ping. */
interface Effects { boom: () => void; hiss: () => void; charged: () => void; ping: (midi: number) => void }

/** The meteoroid strike, from the Groove's kit: a plasma bolt hitting a city. */
const IMPACT: SampleSet = { 43: SOUNDS.kit.tomLow ?? 'groove/tom-low.mp3' };

export const EchoGame: React.FC<{
    level: EchoLevel;
    tempoScale: number;
    onFinish: (results: NoteResult[]) => void;
    onQuit: () => void;
}> = ({ level: baseLevel, tempoScale, onFinish, onQuit }) => {
    const level = useMemo(() => ({ ...baseLevel, bpm: baseLevel.bpm * tempoScale }), [baseLevel, tempoScale]);
    const beat = 60 / level.bpm;
    const barSec = level.beatsPerBar * beat;
    const total = level.bars * barSec;
    const n = level.answers.length;
    const packets = useMemo(() => packetsOf(level), [level]);
    const latency = getLatency();

    // The cities, low voices on the left: three buildings each, the turret on the tallest.
    const cities = useMemo<City[]>(() => {
        const list = citiesOf(level);
        const count = Math.max(1, list.length);
        const span = CITY_SPAN.to - CITY_SPAN.from;
        const w = Math.min(72, (span / count) * 0.78);
        let seed = 11;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        return list.map((c, k) => {
            const x = CITY_SPAN.from + span * (k + 0.5) / count;
            const hs = [24 + rnd() * 14, 44 + rnd() * 16, 18 + rnd() * 14];
            const ws = [w * 0.31, w * 0.38, w * 0.31];
            let bx = x - w / 2;
            const buildings = hs.map((h, j) => {
                const b = { x: bx + 1, w: ws[j] - 2, h, windows: [] as Array<[number, number]> };
                for (let wy = GROUND_Y - h + 6; wy < GROUND_Y - 6; wy += 8) {
                    for (let wx = b.x + 3; wx < b.x + b.w - 4; wx += 6) if (rnd() > 0.35) b.windows.push([wx, wy]);
                }
                bx += ws[j];
                return b;
            });
            const center = buildings[1];
            const turret = { x: center.x + center.w / 2, y: GROUND_Y - hs[1] - 8 };
            const f = (HORIZON_Y - STAR.y) / (turret.y - STAR.y);
            return { x, color: voiceColor(c.height), name: c.name, turret, aim: { x: STAR.x + (turret.x - STAR.x) * f, y: HORIZON_Y }, buildings };
        });
    }, [level]);

    const bolts = useMemo<Bolt[]>(() => {
        const travel = level.distance * barSec;
        const pitches = citiesOf(level).map(c => c.midi);
        const lo = Math.min(...pitches), hi = Math.max(...pitches);
        /** Where a hollow bolt falls: its pitch, brought into the cities' range, between them. */
        const fallX = (midi: number) => {
            let m = midi;
            while (m > hi + 6) m -= 12;
            while (m < lo - 6) m += 12;
            const f = hi > lo ? Math.max(0, Math.min(1, (m - lo) / (hi - lo))) : 0.5;
            const first = cities[0]?.x ?? 0, last = cities[cities.length - 1]?.x ?? 0;
            return first + (last - first) * f;
        };
        return packets.map(pk => {
            const a = pk.answer !== null ? level.answers[pk.answer] : null;
            const city = a ? Math.max(0, pitches.indexOf(a.midi ?? 60)) : null;
            const target = city !== null ? cities[city].turret : { x: fallX(pk.midi ?? 72), y: GROUND_Y - 30 };
            const dx = target.x - STAR.x, dy = target.y - STAR.y, L = Math.hypot(dx, dy);
            const dir = { x: dx / L, y: dy / L };
            const sH = (HORIZON_Y - STAR.y) / dir.y;
            // Where it meets the dome on its way down (the dome's upper half: an ellipse).
            const ox = STAR.x - DOME.cx, oy = STAR.y - DOME.cy;
            const qa = (dir.x / DOME.rx) ** 2 + (dir.y / DOME.ry) ** 2;
            const qb = 2 * ((ox * dir.x) / DOME.rx ** 2 + (oy * dir.y) / DOME.ry ** 2);
            const qc = (ox / DOME.rx) ** 2 + (oy / DOME.ry) ** 2 - 1;
            const disc = qb * qb - 4 * qa * qc;
            const sDome = disc > 0 ? (-qb - Math.sqrt(disc)) / (2 * qa) : L;
            return { pk, city, dir, v: sH / travel, sH, sDome: Math.min(L, sDome), L, color: city !== null ? cities[city].color : 0xffffff };
        });
    }, [packets, cities, level, barSec]);
    const boltOf = useMemo(() => {
        const out: number[] = [];
        bolts.forEach((b, i) => { if (b.pk.answer !== null) out[b.pk.answer] = i; });
        return out;
    }, [bolts]);
    /** When the last bolt is done: burst on the dome, or come down on its city. */
    const lastBolt = useMemo(() => Math.max(total, ...bolts.map(b => b.pk.emit * beat + (b.pk.answer === null ? b.sDome : b.L) / b.v + b.pk.dur * beat)), [bolts, beat, total]);

    const hostRef = useRef<HTMLDivElement>(null);
    const namesRef = useRef<HTMLDivElement>(null);
    const horizonLabelRef = useRef<HTMLDivElement>(null);
    const popLayerRef = useRef<HTMLDivElement>(null);
    const play = useRef<Play>({
        started: false, finished: false, downbeat: 0, i: 0, holding: false,
        shots: baseLevel.answers.map(() => ({ pressError: null, releaseError: null, outcome: null })),
        results: [], combo: 0, domeAt: null, endingAt: null,
    });
    const audio = useRef<{ nodes: Tone.ToneAudioNode[]; earth: HeldVoice; fx: Effects } | null>(null);
    // Space Voices and the meteoroid are fetched while the intro is up.
    useEffect(() => preload(SOUNDS.star, SOUNDS.earth, IMPACT), []);
    // Each voice sounds in the octave its samples sing best in — the whistle round G♯3, the hums round C3–G3 —
    // whole octaves, so the canon's harmony is kept (the notes you see are as written).
    const starShift = useMemo(() => octavesInto(level.calls.map(m => m.midi ?? 72), 52, 66), [level]);
    const earthShift = useMemo(() => octavesInto(level.answers.map(m => m.midi ?? 60), 45, 60), [level]);
    /** What the scene should show: a turret fired, a bolt settled, a word. */
    const events = useRef<Array<{ kind: 'fire' | Outcome; k: number }>>([]);
    const pops = useRef<Array<{ text: string; k: number }>>([]);
    const [started, setStarted] = useState(false);
    const [countIn, setCountIn] = useState(0);
    const [hud, setHud] = useState({ bar: 0, combo: 0, intercepted: 0, left: baseLevel.answers.length });
    const [announce, setAnnounce] = useState<{ text: string; key: number } | null>(null);
    const onFinishRef = useRef(onFinish);
    useEffect(() => { onFinishRef.current = onFinish; });

    const songTime = (heard: number) => heard - play.current.downbeat - latency;
    const viewTime = () => heardNow() - play.current.downbeat;
    const startOf = (i: number) => level.answers[i].start * beat;
    const endOf = (i: number) => (level.answers[i].start + level.answers[i].dur) * beat;

    const record = (k: number, r: NoteResult) => {
        const p = play.current;
        p.results[k] = r;
        const o = outcomeOf(r);
        p.shots[k].outcome = o;
        p.combo = o === 'intercepted' ? p.combo + 1 : 0;
        events.current.push({ kind: o, k });
        setHud(h => ({ ...h, combo: p.combo, intercepted: h.intercepted + (o === 'intercepted' ? 1 : 0), left: n - (k + 1) }));
    };

    /** The part of an answer's bolt its turret destroys, in seconds behind the head, or null while it has not fired. */
    const spanOf = (k: number, d: number, now: number): [number, number] | null => {
        const p = play.current, sh = p.shots[k];
        if (sh.outcome === 'intercepted' || sh.outcome === 'turret') return [0, d];
        if (sh.pressError === null) return null;
        // Fired on time (Good or better): the head is caught, whatever the few milliseconds say.
        const g = grade(sh.pressError, PRESS);
        const from = g === 'perfect' || g === 'good' ? 0 : Math.max(0, sh.pressError);
        const to = p.holding && p.i === k ? now - startOf(k) : sh.releaseError === null ? d : d + sh.releaseError;
        return [from, Math.min(d, to)];
    };

    // Starting takes a moment (the audio, the samples): a second press meanwhile must not start twice.
    const starting = useRef(false);
    const start = async () => {
        const p = play.current;
        if (p.started || starting.current) return;
        starting.current = true;
        await Tone.start();
        const space = new Tone.Freeverb({ roomSize: 0.85, dampening: 2600 });
        space.wet.value = 0.35;
        space.toDestination();
        const click = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: -27 }).toDestination();
        const accent = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 }, volume: -21 }).toDestination();
        // The star: Space Voices' whistle, far away (without the samples, a bright FM tone).
        const star: Tone.Sampler | Tone.PolySynth = (await sampler(SOUNDS.star, { release: 0.25, volume: -6 })) ?? new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 2, modulationIndex: 3.2,
            envelope: { attack: 0.004, decay: 0.2, sustain: 0.55, release: 0.25 },
            modulationEnvelope: { attack: 0.004, decay: 0.3, sustain: 0.3, release: 0.3 },
            volume: -13,
        });
        star.connect(space);
        // The turrets sing with Earth's voice: the hums, close — yours (without them, a warm triangle).
        const near = new Tone.Freeverb({ roomSize: 0.5, dampening: 3000 });
        near.wet.value = 0.12;
        near.toDestination();
        const earth = await heldSampler([{ set: SOUNDS.earth, volume: -3, release: 0.18 }], near)
            ?? heldSynth(new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.12, sustain: 0.65, release: 0.16 }, volume: -7 }).toDestination());
        // What happens in the sky, kept under the music.
        const meteor = await sampler(IMPACT, { release: 0.4, volume: -12 });
        const thud = meteor ?? new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 5, envelope: { attack: 0.001, decay: 0.5, sustain: 0 }, volume: -16 });
        thud.toDestination();
        const hissFilter = new Tone.Filter({ type: 'highpass', frequency: 1800 }).toDestination();
        const hiss = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.02, decay: 0.6, sustain: 0 }, volume: -24 }).connect(hissFilter);
        const chord = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.25, decay: 0.4, sustain: 0.5, release: 1.6 }, volume: -17 }).connect(space);
        const bell = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 3.01, modulationIndex: 6,
            envelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.4 },
            modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 },
            volume: -27,
        }).connect(space);
        const fx: Effects = {
            boom: () => thud.triggerAttackRelease(Tone.Frequency(36, 'midi').toFrequency(), 0.6, Tone.now()),
            hiss: () => hiss.triggerAttackRelease(0.5, Tone.now()),
            charged: () => ['C5', 'E5', 'G5', 'C6'].forEach((note, k) => chord.triggerAttackRelease(note, 1.2, Tone.now() + k * 0.09)),
            ping: midi => bell.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), 0.3, Tone.now()),
        };
        audio.current = { nodes: [space, near, click, accent, star, thud, hiss, hissFilter, chord, bell], earth, fx };
        const t0 = scheduleNow() + LEAD_SECONDS;
        p.downbeat = t0 + barSec;
        // A bar counted in, then the beat, softly, to the end of the music.
        const beats = Math.round((level.bars + 1) * level.beatsPerBar);
        for (let k = 0; k <= beats; k++) {
            const down = k % level.beatsPerBar === 0;
            (down ? accent : click).triggerAttackRelease(down ? 'C7' : 'G6', 0.02, t0 + k * beat);
        }
        for (const m of level.calls) {
            star.triggerAttackRelease(Tone.Frequency((m.midi ?? 72) + starShift, 'midi').toFrequency(), Math.max(0.06, m.dur * beat * 0.95), p.downbeat + m.start * beat);
        }
        p.started = true;
        setStarted(true);
    };

    const press = (heard: number) => {
        const p = play.current;
        if (!p.started) { void start(); return; }
        if (p.finished || p.holding || p.i >= n) return;
        const err = songTime(heard) - startOf(p.i);
        if (err < -PRESS.ok) { pops.current.push({ text: 'Too early', k: p.i }); return; }
        p.holding = true;
        p.shots[p.i].pressError = err;
        events.current.push({ kind: 'fire', k: p.i });
        audio.current?.earth.attack(Tone.Frequency((level.answers[p.i].midi ?? 60) + earthShift, 'midi').toFrequency(), Tone.now());
    };

    const release = (heard: number) => {
        const p = play.current;
        if (!p.holding) return;
        const err = songTime(heard) - endOf(p.i);
        const sh = p.shots[p.i];
        p.holding = false;
        sh.releaseError = err;
        audio.current?.earth.release(Tone.now());
        record(p.i, { press: grade(sh.pressError, PRESS), release: grade(err, RELEASE), pressError: sh.pressError, releaseError: err });
        p.i++;
    };

    // Input: space (and Enter), a touch or click, MIDI — the first key down fires, the last one up stops.
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onQuit(); return; }
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.repeat) press(heardAt(e.timeStamp));
        };
        const up = (e: KeyboardEvent) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            release(heardAt(e.timeStamp));
        };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    });
    const heldKeys = useRef(new Set<number>());
    useMidiNotes({
        onNoteOn: hit => {
            heldKeys.current.add(hit.note);
            if (heldKeys.current.size === 1) press(heardAt(hit.timestamp));
        },
        onNoteOff: note => {
            heldKeys.current.delete(note);
            if (heldKeys.current.size === 0) release(heardNow());
        },
    });

    // The scene.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        let destroyed = false;
        const app = new PIXI.Application();
        const setup = async () => {
            await app.init({ resizeTo: host, antialias: true, background: '#05060c', resolution: window.devicePixelRatio || 1, autoDensity: true });
            if (destroyed) { app.destroy(true); return; }
            host.appendChild(app.canvas);

            // The sky.
            const sky = new PIXI.Graphics();
            let seed = 23;
            const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
            for (let s = 0; s < 520; s++) sky.circle(rnd() * 1500 - 750, rnd() * 900 - 470, rnd() * 1.3 + 0.3).fill({ color: 0xffffff, alpha: 0.12 + rnd() * 0.4 });

            // The ground and the cities, drawn once; their lights, fires and turrets' glow each frame.
            const land = new PIXI.Graphics();
            land.rect(-800, GROUND_Y, 1600, 400).fill({ color: 0x0b0d16 });
            land.rect(-800, GROUND_Y - 2, 1600, 3).fill({ color: 0x1e293b });
            for (const c of cities) {
                land.ellipse(c.x, GROUND_Y + 2, 46, 8).fill({ color: c.color, alpha: 0.22 });
                for (const b of c.buildings) {
                    land.rect(b.x, GROUND_Y - b.h, b.w, b.h).fill({ color: mix(0x141827, c.color, 0.18) });
                    land.rect(b.x, GROUND_Y - b.h, b.w, 2).fill({ color: c.color, alpha: 0.5 });
                    for (const [wx, wy] of b.windows) land.rect(wx, wy, 2.5, 3).fill({ color: 0xfde68a, alpha: 0.55 });
                }
                // The turret: a dome on the roof, its barrel on the point of the horizon it guards.
                const t = c.turret;
                const dx = c.aim.x - t.x, dy = c.aim.y - t.y, len = Math.hypot(dx, dy);
                land.moveTo(t.x, t.y).lineTo(t.x + (dx / len) * 15, t.y + (dy / len) * 15).stroke({ width: 3.5, color: 0xcbd5e1, cap: 'round' });
                const cap: number[] = [];
                for (let a = 0; a <= 12; a++) cap.push(t.x + 8 * Math.cos(Math.PI + (a / 12) * Math.PI), t.y + 8 + 8 * Math.sin(Math.PI + (a / 12) * Math.PI));
                land.poly(cap).fill({ color: 0x94a3b8 });
            }
            const lights = new PIXI.Graphics();

            // The horizon the satellite watches, and the satellite at its end.
            const horizon = new PIXI.Graphics();
            for (let x = SAT.x + 40; x < 760; x += 14) horizon.moveTo(x, HORIZON_Y).lineTo(x + 7, HORIZON_Y).stroke({ width: 1.5, color: LINE, alpha: 0.35 });
            const satellite = new PIXI.Graphics();
            for (const side of [-1, 1]) {
                const y0 = side < 0 ? -58 : 16;
                satellite.rect(-8, y0, 16, 42).fill({ color: 0x1d4ed8 });
                for (let c = 1; c < 4; c++) satellite.moveTo(-8, y0 + c * 10.5).lineTo(8, y0 + c * 10.5).stroke({ width: 1, color: 0x93c5fd, alpha: 0.5 });
                satellite.moveTo(0, side * 13).lineTo(0, side * 16).stroke({ width: 2, color: 0x9ca3af });
            }
            satellite.roundRect(-13, -13, 26, 26, 4).fill({ color: 0xd1d5db });
            satellite.roundRect(-13, -13, 26, 26, 4).stroke({ width: 1.5, color: 0x6b7280 });
            satellite.ellipse(19, 0, 5, 11).fill({ color: 0xe5e7eb });
            satellite.moveTo(13, 0).lineTo(16, 0).stroke({ width: 2, color: 0x9ca3af });
            satellite.position.set(SAT.x, SAT.y);

            const scene = new PIXI.Container();
            const ringLayer = new PIXI.Graphics();
            const star = new PIXI.Graphics();
            const watch = new PIXI.Graphics();
            const flights = new PIXI.Graphics();
            const beams = new PIXI.Graphics();
            const dome = new PIXI.Graphics();
            const fire = new PIXI.Graphics();
            const bursts = new PIXI.Graphics();
            const dots = new PIXI.Graphics();
            scene.addChild(sky, ringLayer, star, horizon, watch, flights, land, lights, dome, beams, fire, bursts, satellite, dots);
            app.stage.addChild(scene);

            const callStarts = level.calls.map(m => m.start * beat);
            const rings: number[] = [];
            let flash = 0;
            let lastCall = -1;
            let lastBar = -1;
            let lastCount = 0;
            let lastFrame = performance.now();
            let lastFirework = 0;
            // Per bolt: has it reached its city, burst on the dome, faded at the horizon?
            const fx = bolts.map(() => ({ impacted: false, splashed: false, faded: false }));
            // Per city: its fires (one more for every hit), and its turret's.
            const cityFire = cities.map(() => 0), turretFire = cities.map(() => 0);
            const particles: Particle[] = [];
            const booms: Array<{ x: number; y: number; born: number; color: number; r: number }> = [];
            let W = 0, H = 0, sc = 1, ox = 0, oy = 0;
            const toScreen = (q: Pt) => ({ x: ox + q.x * sc, y: oy + q.y * sc });

            const relayout = () => {
                W = app.screen.width; H = app.screen.height;
                sc = Math.min(W / 1000, H / 720);
                ox = W / 2; oy = H / 2 + 20;
                scene.position.set(ox, oy);
                scene.scale.set(sc);
                [...(namesRef.current?.children ?? [])].forEach((el, k) => {
                    const e = el as HTMLElement, q = toScreen({ x: cities[k].x, y: GROUND_Y + 17 });
                    e.style.left = `${q.x}px`;
                    e.style.top = `${q.y}px`;
                    e.style.fontSize = `${Math.round(Math.max(10, 13 * sc))}px`;
                });
                const label = horizonLabelRef.current;
                if (label) {
                    const q = toScreen({ x: SAT.x + 40, y: HORIZON_Y - 12 });
                    label.style.left = `${q.x}px`;
                    label.style.top = `${q.y}px`;
                }
            };
            const spray = (x: number, y: number, count: number, color: number, speed: number, life = 0.7) => {
                for (let j = 0; j < count; j++) {
                    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
                    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), age: 0, size: 1.6 + Math.random() * 1.6, color, kind: 'spark' });
                }
            };

            app.ticker.add(() => {
                if (app.screen.width !== W || app.screen.height !== H) relayout();
                const p = play.current;
                const t = p.started ? viewTime() : -barSec;
                const now = p.started ? songTime(heardNow()) : -Infinity;
                const wall = performance.now();
                const dt = Math.min(0.05, (wall - lastFrame) / 1000);
                lastFrame = wall;
                const domeUp = p.domeAt !== null;

                // A bolt never fired on, or held on past its end.
                if (p.started && !p.finished && p.i < n) {
                    const sh = p.shots[p.i];
                    if (!p.holding && now > startOf(p.i) + PRESS.ok) {
                        record(p.i, { press: 'miss', release: 'miss', pressError: null, releaseError: null });
                        p.i++;
                    } else if (p.holding && now > endOf(p.i) + RELEASE.ok) {
                        p.holding = false;
                        audio.current?.earth.release(Tone.now());
                        record(p.i, { press: grade(sh.pressError, PRESS), release: 'miss', pressError: sh.pressError, releaseError: null });
                        p.i++;
                    }
                }
                // Your part done: the dome is charged. The last bolt down: the ending, then the results.
                if (p.started && p.i >= n && p.domeAt === null) {
                    p.domeAt = t;
                    audio.current?.fx.charged();
                    setAnnounce({ text: '🛡 Shield dome charged', key: wall });
                }
                if (p.domeAt !== null && p.endingAt === null && t > lastBolt + 0.3) {
                    p.endingAt = t;
                    setAnnounce({ text: 'The dome holds: the cities are safe', key: wall });
                }
                if (p.endingAt !== null && !p.finished && t - p.endingAt > ENDING) {
                    p.finished = true;
                    onFinishRef.current(p.results);
                }

                // What just happened: a turret fired, a bolt was stopped, a turret overheated.
                for (const e of events.current.splice(0)) {
                    const bo = bolts[boltOf[e.k]], c = bo && bo.city !== null ? cities[bo.city] : null;
                    if (!c) continue;
                    if (e.kind === 'fire') booms.push({ x: c.aim.x, y: c.aim.y, born: wall, color: 0xffffff, r: 26 });
                    if (e.kind === 'intercepted') { booms.push({ x: c.aim.x, y: c.aim.y, born: wall, color: 0x86efac, r: 34 }); spray(c.aim.x, c.aim.y, 14, 0xbbf7d0, 120); }
                    if (e.kind === 'turret') { turretFire[bo.city!] = Math.min(3, turretFire[bo.city!] + 1); audio.current?.fx.hiss(); }
                }

                const bar = Math.max(0, Math.min(level.bars - 1, Math.floor(t / barSec)));
                if (bar !== lastBar && t >= 0) { lastBar = bar; setHud(h => ({ ...h, bar })); }
                const left = p.started && t < 0 ? Math.ceil(-t / beat) : 0;
                if (left !== lastCount) { lastCount = left; setCountIn(left); }

                // The star sings: a flash and a ring on every note.
                while (p.started && lastCall + 1 < callStarts.length && t >= callStarts[lastCall + 1]) {
                    lastCall++;
                    flash = 1;
                    rings.push(callStarts[lastCall]);
                }
                flash *= 0.9;
                ringLayer.clear();
                while (rings.length && t - rings[0] > RING_LIFE) rings.shift();
                for (const born of rings) {
                    const age = (t - born) / RING_LIFE;
                    ringLayer.circle(STAR.x, STAR.y, 40 + age * 180).stroke({ width: 2 + 4 * (1 - age), color: CALL, alpha: (1 - age) * 0.45 });
                }
                star.clear();
                star.circle(STAR.x, STAR.y, 90).fill({ color: CALL, alpha: 0.05 + 0.08 * flash });
                star.circle(STAR.x, STAR.y, 52).fill({ color: CALL, alpha: 0.12 + 0.25 * flash });
                star.circle(STAR.x, STAR.y, 27 + 6 * flash).fill({ color: 0xe6fbff, alpha: 0.9 });

                // The bolts. Each point of one is a moment of its note (u seconds behind the head);
                // it travels from the star along its line, and what the turret destroyed at the
                // horizon is gone. Past the horizon, plasma burns hot; it ends at its city, or the dome.
                flights.clear();
                const next = p.i < n ? p.i : -1;
                const P = (bo: Bolt, s: number) => ({ x: STAR.x + bo.dir.x * s, y: STAR.y + bo.dir.y * s });
                for (let b = 0; b < bolts.length; b++) {
                    const bo = bolts[b], pk = bo.pk;
                    const tau = t - pk.emit * beat;
                    if (tau < 0) break;
                    const d = pk.dur * beat;
                    const hollow = pk.answer === null;
                    // A hollow bolt that met the horizon before the dome was up faded there, and stays gone.
                    if (hollow && !domeUp && !fx[b].faded && tau > bo.sH / bo.v) {
                        fx[b].faded = true;
                        const q = P(bo, bo.sH);
                        booms.push({ x: q.x, y: q.y, born: wall, color: 0xffffff, r: 16 });
                    }
                    const sMax = hollow ? (domeUp && !fx[b].faded ? bo.sDome : bo.sH) : domeUp ? bo.sDome : bo.L;
                    const a0 = Math.max(0, tau - sMax / bo.v), a1 = Math.min(d, tau);
                    const span = hollow ? null : spanOf(pk.answer!, d, now);
                    const uH = tau - bo.sH / bo.v;
                    /** Is the moment `u` of the bolt still there — not destroyed at the horizon? */
                    const leaks = (upTo: number) => upTo > 0 && (!span || span[0] > 1e-3 || upTo > span[1] + 1e-3);
                    // Down on the city, or on the dome: once, and it shows.
                    if (!hollow && !domeUp && !fx[b].impacted && leaks(Math.min(d, tau - bo.L / bo.v))) {
                        fx[b].impacted = true;
                        if (bo.city !== null) {
                            cityFire[bo.city] = Math.min(3, cityFire[bo.city] + 1);
                            const c = cities[bo.city];
                            booms.push({ x: c.turret.x, y: c.turret.y + 20, born: wall, color: HOT, r: 48 });
                            spray(c.turret.x, c.turret.y + 20, 22, 0xfdba74, 170);
                        }
                        audio.current?.fx.boom();
                    }
                    if (domeUp && !fx[b].splashed && !fx[b].faded && leaks(Math.min(d, tau - bo.sDome / bo.v))) {
                        fx[b].splashed = true;
                        const q = P(bo, bo.sDome);
                        booms.push({ x: q.x, y: q.y, born: wall, color: LINE, r: 30 });
                        spray(q.x, q.y, 16, hollow ? 0xffffff : 0xa5f3fc, 110);
                        audio.current?.fx.ping((pk.midi ?? 72) + starShift + 12);
                    }
                    if (a1 <= a0) continue;
                    const pieces: Array<[number, number]> = [];
                    const r0 = span ? span[0] : 0, r1 = span ? Math.min(span[1], uH) : -1;
                    if (span && r1 > r0) {
                        if (r0 > a0) pieces.push([a0, Math.min(a1, r0)]);
                        if (r1 < a1) pieces.push([Math.max(a0, r1), a1]);
                    } else pieces.push([a0, a1]);
                    const isNext = pk.answer === next;
                    const settled = !hollow && pk.answer! < p.i;
                    const plasma = hollow ? 0xffffff : mix(PLASMA, bo.color, 0.45);
                    const width = hollow ? 2 : isNext ? 6 : 4.5;
                    const alpha = hollow ? 0.35 : settled ? 0.55 : isNext ? 0.95 : 0.7;
                    const stroke = (ua: number, ub: number, color: number) => {
                        if (ub - ua < 1e-4) return;
                        const qa = P(bo, bo.v * (tau - ua)), qb = P(bo, bo.v * (tau - ub));
                        flights.moveTo(qb.x, qb.y).lineTo(qa.x, qa.y).stroke({ width: width * 2.6, color, alpha: alpha * 0.18, cap: 'round' });
                        flights.moveTo(qb.x, qb.y).lineTo(qa.x, qa.y).stroke({ width, color, alpha, cap: 'round' });
                    };
                    for (const [ua, ub] of pieces) {
                        // Moments before uH are past the horizon: falling, hot.
                        const cut = Math.max(ua, Math.min(ub, uH));
                        stroke(ua, cut, hollow ? 0xffffff : HOT);
                        stroke(cut, ub, plasma);
                    }
                    if (pieces.length && pieces[0][0] === 0 && a0 === 0 && a1 > 0) {
                        const q = P(bo, bo.v * tau);
                        const past = tau > bo.sH / bo.v;
                        if (hollow) {
                            flights.circle(q.x, q.y, 7).stroke({ width: 2, color: 0xffffff, alpha: 0.75 });
                        } else {
                            flights.circle(q.x, q.y, isNext ? 13 : 10).fill({ color: past ? HOT : plasma, alpha: 0.25 });
                            flights.circle(q.x, q.y, isNext ? 6.5 : 5).fill({ color: 0xfff7ff, alpha: 0.95 });
                        }
                    }
                }

                // The satellite watches the horizon: a sweep along it, and — for the next bolt — a
                // sight that closes on where it will cross, locked as it does.
                watch.clear();
                const sweep = ((wall / 1800) % 1) * 1200;
                watch.moveTo(SAT.x + 40 + sweep, HORIZON_Y).lineTo(SAT.x + 40 + sweep + 60, HORIZON_Y).stroke({ width: 2.5, color: LINE, alpha: 0.5 });
                let locked = false;
                if (p.started && next >= 0 && !p.holding && !domeUp) {
                    const bo = bolts[boltOf[next]], c = bo.city !== null ? cities[bo.city] : null;
                    const ahead = level.answers[next].start * beat - t;
                    if (c && ahead < 1.5 * beat) {
                        locked = ahead <= 0;
                        const f = Math.max(0, Math.min(1, ahead / (1.5 * beat)));
                        const r = locked ? 14 + 3 * Math.sin(wall / 70) : 14 + 34 * f;
                        const col = locked ? 0xffffff : c.color;
                        watch.moveTo(SAT.x + 24, HORIZON_Y).lineTo(c.aim.x - r, HORIZON_Y).stroke({ width: 1.2, color: col, alpha: 0.25 + 0.4 * (1 - f) });
                        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                            const cx = c.aim.x + sx * r, cy = HORIZON_Y + sy * r;
                            watch.moveTo(cx - sx * 8, cy).lineTo(cx, cy).lineTo(cx, cy - sy * 8).stroke({ width: 2.2, color: col, alpha: 0.9 });
                        }
                    }
                }
                // Its lamp: steady, then blinking as a bolt is on the line.
                watch.circle(SAT.x + 19, SAT.y - 14, 3).fill({ color: locked && Math.sin(wall / 60) > 0 ? 0xffffff : 0xf87171, alpha: 0.95 });

                // Turrets firing: a beam from the turret to its point on the horizon, the plasma
                // burning away there; held past the tail, the turret reddens with the heat.
                beams.clear();
                if (p.holding && p.i < n) {
                    const k = p.i, bo = bolts[boltOf[k]];
                    if (bo && bo.city !== null) {
                        const c = cities[bo.city];
                        const heat = Math.max(0, now - endOf(k)) / RELEASE.ok;
                        const col = mix(c.color, 0xff3b3b, Math.min(1, heat * 1.3));
                        const flick = 0.75 + 0.25 * Math.sin(wall / 25);
                        beams.moveTo(c.turret.x, c.turret.y).lineTo(c.aim.x, c.aim.y).stroke({ width: 13, color: col, alpha: 0.14 * flick });
                        beams.moveTo(c.turret.x, c.turret.y).lineTo(c.aim.x, c.aim.y).stroke({ width: 3, color: mix(col, 0xffffff, 0.4), alpha: 0.95 * flick });
                        beams.circle(c.turret.x, c.turret.y + 3, 12 + 6 * Math.min(1, heat)).fill({ color: col, alpha: 0.25 + 0.3 * Math.min(1, heat) });
                        const burning = (t - bo.pk.emit * beat) - bo.sH / bo.v;
                        if (burning >= 0 && burning <= bo.pk.dur * beat && Math.random() < 0.7) spray(c.aim.x, c.aim.y, 2, mix(c.color, 0xffffff, 0.5), 90, 0.4);
                        beams.circle(c.aim.x, c.aim.y, 7 + 2 * flick).fill({ color: 0xffffff, alpha: 0.8 });
                    }
                }

                // The dome: it rises when charged and shimmers over the cities.
                dome.clear();
                if (p.domeAt !== null) {
                    const rise = Math.min(1, (t - p.domeAt) / 0.9);
                    const ry = DOME.ry * (1 - (1 - rise) ** 3);
                    const arc: number[] = [];
                    for (let a = 0; a <= 48; a++) {
                        const ang = Math.PI + (a / 48) * Math.PI;
                        arc.push(DOME.cx + DOME.rx * Math.cos(ang), DOME.cy + ry * Math.sin(ang));
                    }
                    const shimmer = 0.5 + 0.5 * Math.sin(wall / 300);
                    dome.poly(arc).fill({ color: LINE, alpha: 0.05 + 0.04 * shimmer });
                    for (const f of [1, 0.72, 0.44]) {
                        dome.moveTo(DOME.cx - DOME.rx, DOME.cy);
                        for (let a = 1; a <= 48; a++) {
                            const ang = Math.PI + (a / 48) * Math.PI;
                            dome.lineTo(DOME.cx + DOME.rx * Math.cos(ang), DOME.cy + ry * f * Math.sin(ang));
                        }
                        dome.stroke({ width: f === 1 ? 2.5 : 1, color: LINE, alpha: (f === 1 ? 0.55 : 0.16) * (0.7 + 0.3 * shimmer) });
                    }
                }

                // Fires: flames and smoke from every city hit and every turret overheated — until the
                // ending puts them out and turns the lights on.
                const out = p.endingAt !== null ? Math.max(0, 1 - (t - p.endingAt) / 1.4) : 1;
                cities.forEach((c, k) => {
                    const emit = (x: number, y: number, amount: number, spread: number) => {
                        const rate = amount * out * 60 * dt;
                        const count = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
                        for (let j = 0; j < count; j++) {
                            particles.push({ x: x + (Math.random() - 0.5) * spread, y, vx: (Math.random() - 0.5) * 14, vy: -30 - Math.random() * 40, life: 0.6 + Math.random() * 0.5, age: 0, size: 3 + Math.random() * 3 * amount, color: 0xfde047, kind: 'flame' });
                            if (Math.random() < 0.25) particles.push({ x: x + (Math.random() - 0.5) * spread, y: y - 10, vx: (Math.random() - 0.5) * 10, vy: -22 - Math.random() * 16, life: 1.6, age: 0, size: 4 + Math.random() * 4, color: 0x475569, kind: 'smoke' });
                        }
                    };
                    if (cityFire[k] > 0) emit(c.x, GROUND_Y - 14, cityFire[k], 50);
                    if (turretFire[k] > 0) emit(c.turret.x, c.turret.y, turretFire[k] * 0.8, 10);
                });
                // The ending: lights on in every window, fireworks over the dome.
                lights.clear();
                if (p.endingAt !== null) {
                    const on = Math.min(1, (t - p.endingAt) / 1.2);
                    for (const c of cities) {
                        for (const b of c.buildings) for (const [wx, wy] of b.windows) lights.rect(wx - 0.5, wy - 0.5, 3.5, 4).fill({ color: 0xfff3c4, alpha: on * (0.6 + 0.4 * Math.sin(wall / 400 + wx)) });
                        lights.ellipse(c.x, GROUND_Y - 20, 60, 34).fill({ color: c.color, alpha: 0.08 * on });
                    }
                    if (t - p.endingAt > 0.4 && wall - lastFirework > 320 && cities.length) {
                        lastFirework = wall;
                        const c = cities[Math.floor(Math.random() * cities.length)];
                        const q = { x: c.x + (Math.random() - 0.5) * 60, y: HORIZON_Y - 40 - Math.random() * 120 };
                        spray(q.x, q.y, 30, Math.random() < 0.5 ? c.color : 0xffffff, 150, 1.1);
                        audio.current?.fx.ping(72 + [0, 4, 7, 12, 16][Math.floor(Math.random() * 5)]);
                    }
                }
                fire.clear();
                for (let j = particles.length - 1; j >= 0; j--) {
                    const q = particles[j];
                    q.age += dt;
                    if (q.age >= q.life) { particles.splice(j, 1); continue; }
                    q.x += q.vx * dt;
                    q.y += q.vy * dt;
                    const f = q.age / q.life;
                    if (q.kind === 'spark') {
                        q.vy += 120 * dt;
                        fire.circle(q.x, q.y, q.size * (1 - f * 0.5)).fill({ color: q.color, alpha: 1 - f });
                    } else if (q.kind === 'flame') {
                        fire.circle(q.x, q.y, q.size * (1 - f)).fill({ color: f < 0.35 ? 0xfde047 : f < 0.7 ? 0xf97316 : 0xdc2626, alpha: 0.85 * (1 - f) });
                    } else {
                        fire.circle(q.x, q.y, q.size * (1 + f * 1.5)).fill({ color: q.color, alpha: 0.22 * (1 - f) });
                    }
                }
                // Blasts: Missile Command's expanding rings.
                bursts.clear();
                for (let j = booms.length - 1; j >= 0; j--) {
                    const bm = booms[j], age = (wall - bm.born) / 450;
                    if (age >= 1) { booms.splice(j, 1); continue; }
                    bursts.circle(bm.x, bm.y, bm.r * (0.3 + 0.7 * age)).fill({ color: bm.color, alpha: 0.18 * (1 - age) });
                    bursts.circle(bm.x, bm.y, bm.r * (0.3 + 0.7 * age)).stroke({ width: 2.5, color: bm.color, alpha: 0.8 * (1 - age) });
                }

                // The bar's beats, by the satellite.
                dots.clear();
                const inBar = t >= 0 ? Math.floor((t - bar * barSec) / beat) : -1;
                for (let k = 0; k < level.beatsPerBar; k++) {
                    dots.circle(SAT.x - 12 + k * 15, SAT.y + 78, k === 0 ? 5 : 4).fill({ color: 0xffffff, alpha: p.started && t >= 0 && t < total && k <= inBar ? 0.85 : 0.14 });
                }

                // Words by the sight (DOM, not Pixi text), which rise and fade on their own.
                const layer = popLayerRef.current;
                for (const pop of pops.current.splice(0)) {
                    const bo = bolts[boltOf[pop.k]], c = bo && bo.city !== null ? cities[bo.city] : null;
                    if (!layer || !c) continue;
                    const q = toScreen({ x: c.aim.x + 24, y: HORIZON_Y - 26 });
                    const el = document.createElement('div');
                    el.textContent = pop.text;
                    el.className = 'echo-pop';
                    el.style.left = `${q.x}px`;
                    el.style.top = `${q.y}px`;
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

    useEffect(() => () => {
        audio.current?.nodes.forEach(node => node.dispose());
        audio.current?.earth.dispose();
        audio.current = null;
    }, []);

    const behind = level.distance === 1 ? 'a bar' : `${level.distance} bars`;
    return (
        <div
            style={{ position: 'relative', flex: 1, minHeight: 0, touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => { e.preventDefault(); press(heardAt(e.timeStamp)); }}
            onPointerUp={e => release(heardAt(e.timeStamp))}
            onPointerCancel={e => release(heardAt(e.timeStamp))}
        >
            <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
            <style>{POP_CSS}</style>
            <div ref={namesRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {cities.map(c => <div key={c.name + c.x} style={{ ...nameStyle, color: `#${c.color.toString(16).padStart(6, '0')}` }}>{c.name}</div>)}
            </div>
            <div ref={horizonLabelRef} style={horizonLabelStyle}>Negative event horizon</div>
            <div ref={popLayerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />
            <div style={hudStyle}>
                <span style={{ fontWeight: 700 }}>{level.title}</span>
                <span style={{ color: '#9a9aa8' }}>
                    ♩ = {Math.round(level.bpm)} · {behind} behind · bar {Math.min(hud.bar + 1, level.bars)}/{level.bars}
                </span>
                <span style={{ color: '#86efac' }}>✦ {hud.intercepted}/{n} intercepted</span>
                {hud.combo > 1 && <span style={{ color: '#4ade80', fontWeight: 700 }}>×{hud.combo}</span>}
                <span style={{ flex: 1 }} />
                <button onClick={e => { e.stopPropagation(); onQuit(); }} onPointerDown={e => e.stopPropagation()} style={quitStyle}>✕ Quit</button>
            </div>
            {started && hud.left > 0 && (
                <div style={domeStyle}>
                    <span>🛡 Shield dome</span>
                    <span style={{ width: 90, height: 6, borderRadius: 3, background: 'rgba(103,232,249,0.15)', overflow: 'hidden', display: 'inline-block' }}>
                        <span style={{ display: 'block', height: '100%', width: `${(1 - hud.left / Math.max(1, n)) * 100}%`, background: '#67e8f9' }} />
                    </span>
                    <span>{hud.left} to go</span>
                </div>
            )}
            {started && hud.left > 0 && hud.left <= COUNTDOWN && (
                <div key={hud.left} className="echo-count" style={countStyle}>{hud.left}</div>
            )}
            {announce && <div key={announce.key} className="echo-announce" style={announceStyle}>{announce.text}</div>}

            {!started && (
                <div style={{ ...centerStyle, justifyContent: 'flex-start', paddingTop: '11vh' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>Defend the cities</div>
                    <div style={{ color: '#b0b0bc', maxWidth: 560, lineHeight: 1.5 }}>
                        The star sings a canon, and its notes fall as plasma, each on the city of its pitch. A bolt crosses the horizon the
                        satellite watches just as your voice — {behind} behind — should sing it: hold <b>space</b> (or touch, or any MIDI key)
                        as it crosses and let go as its tail does, and the city's turret fires with your note. Let go too soon and the plasma falls
                        on the city; hold on too long and the turret overheats. When the countdown ends the shield dome is up, and the hollow bolts
                        — the star's last words — burst harmlessly on it.
                    </div>
                    <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Press to start — one bar counts you in</div>
                </div>
            )}
            {started && countIn > 0 && <div style={{ ...centerStyle, fontSize: '4.5rem', fontWeight: 800, paddingBottom: '10rem' }}>{countIn}</div>}
        </div>
    );
};

const POP_CSS = `
.echo-pop { position: absolute; transform: translate(0, -50%); font: 700 18px system-ui, sans-serif; color: #9a9aa8; white-space: nowrap;
  animation: echo-pop 0.8s ease-out forwards; }
@keyframes echo-pop { from { opacity: 1; transform: translate(0, -50%); } to { opacity: 0; transform: translate(0, calc(-50% - 26px)); } }
.echo-count { animation: echo-count 0.9s ease-out forwards; }
@keyframes echo-count { from { opacity: 0.95; transform: translate(-50%, 0) scale(1.25); } to { opacity: 0.35; transform: translate(-50%, 0) scale(1); } }
.echo-announce { animation: echo-announce 2.6s ease-out forwards; }
@keyframes echo-announce { 0% { opacity: 0; transform: translate(-50%, 8px); } 12% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; } }`;
const nameStyle: React.CSSProperties = {
    position: 'absolute', left: -100, top: -100, transform: 'translate(-50%, -50%)',
    fontWeight: 700, fontFamily: 'system-ui, sans-serif', opacity: 0.9,
};
const horizonLabelStyle: React.CSSProperties = {
    position: 'absolute', left: -500, top: -100, transform: 'translate(0, -100%)', pointerEvents: 'none',
    font: '600 10px system-ui, sans-serif', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#67e8f9', opacity: 0.6, whiteSpace: 'nowrap',
};
const hudStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', gap: '1rem', alignItems: 'center',
    padding: '0.8rem 1.2rem', fontSize: '0.95rem', background: 'linear-gradient(#05060cdd, transparent)', pointerEvents: 'none',
};
const domeStyle: React.CSSProperties = {
    position: 'absolute', top: '3.4rem', right: '1.2rem', display: 'flex', gap: '0.6rem', alignItems: 'center',
    fontSize: '0.85rem', color: '#a5f3fc', pointerEvents: 'none',
};
const countStyle: React.CSSProperties = {
    position: 'absolute', top: '4.6rem', right: '2.4rem', transform: 'translate(-50%, 0)', fontSize: '2.6rem', fontWeight: 800,
    color: '#67e8f9', pointerEvents: 'none',
};
const announceStyle: React.CSSProperties = {
    position: 'absolute', top: '22%', left: '50%', transform: 'translate(-50%, 0)', fontSize: '2rem', fontWeight: 800,
    color: '#e0fbff', textShadow: '0 0 24px rgba(103,232,249,0.6)', pointerEvents: 'none', whiteSpace: 'nowrap',
};
const quitStyle: React.CSSProperties = {
    pointerEvents: 'auto', padding: '0.35rem 0.8rem', borderRadius: '8px', background: 'transparent',
    color: 'white', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
};
const centerStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.8rem', textAlign: 'center', padding: '1rem', pointerEvents: 'none',
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import * as Tone from 'tone';
import { useMidiNotes } from '../../hooks/useMidi';
import { heardAt, heardNow, scheduleNow } from '../../games/clock';
import { getLatency } from '../../games/latency';
import { PRESS, RELEASE, grade, type NoteResult } from '../../games/judge';
import { messageOf, packetsOf, type EchoLevel, type Message } from '../../games/echo';
import { MessageStrip } from './MessageStrip';
import { SOUNDS, heldSampler, heldSynth, octavesInto, preload, sampler, type HeldVoice } from './sounds';

/**
 * Rhythm echo — relay the canon. The star sings its line; every note it
 * sends flies down to a satellite halfway to Earth and reaches it just as
 * your voice — the canon's second, a bar or two behind — should sing it.
 * Hold (space, a touch, any MIDI key) as it arrives and let go as it ends:
 * the satellite beams it down for as long as you hold, and your note
 * sounds. The strip along the bottom is the message Earth gets (see
 * MessageStrip). The star's last notes, which your voice does not answer,
 * fly as empty circles: let them pass. Judged press and release, on the
 * audio clock as heard less the calibrated delay (games/clock.ts,
 * games/latency.ts).
 */

const CALL = 0x22d3ee;
const EARTH = 0x4ade80;
const LEAD_SECONDS = 0.4;
const RING_LIFE = 1.1;

interface Play {
    started: boolean;
    finished: boolean;
    /** Audio-context time of the first downbeat, after the bar counted in. */
    downbeat: number;
    /** The next answer to relay. */
    i: number;
    holding: boolean;
    pressError: number | null;
    results: NoteResult[];
    combo: number;
    /** What Earth heard last, for its flash. */
    arrived: { kind: Message; at: number } | null;
}

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
    const packets = useMemo(() => packetsOf(level), [level]);
    const latency = getLatency();

    const hostRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    const popLayerRef = useRef<HTMLDivElement>(null);
    const play = useRef<Play>({ started: false, finished: false, downbeat: 0, i: 0, holding: false, pressError: null, results: [], combo: 0, arrived: null });
    const audio = useRef<{ nodes: Tone.ToneAudioNode[]; earth: HeldVoice } | null>(null);
    // Space Voices is fetched while the intro is up.
    useEffect(() => preload(SOUNDS.star, SOUNDS.earth), []);
    // Each voice sounds in the octave its samples sing best in — the whistle round G♯3, the hums round C3–G3 —
    // whole octaves, so the canon's harmony is kept (the notes you see are as written).
    const starShift = useMemo(() => octavesInto(level.calls.map(n => n.midi ?? 72), 52, 66), [level]);
    const earthShift = useMemo(() => octavesInto(level.answers.map(n => n.midi ?? 60), 45, 60), [level]);
    const pops = useRef<string[]>([]);
    const [started, setStarted] = useState(false);
    const [countIn, setCountIn] = useState(0);
    const [hud, setHud] = useState({ bar: 0, combo: 0, received: 0 });
    const [messages, setMessages] = useState<Array<Message | null>>(() => baseLevel.answers.map(() => null));
    const onFinishRef = useRef(onFinish);
    useEffect(() => { onFinishRef.current = onFinish; });

    const songTime = (heard: number) => heard - play.current.downbeat - latency;
    const viewTime = () => heardNow() - play.current.downbeat;
    const startOf = (i: number) => level.answers[i].start * beat;
    const endOf = (i: number) => (level.answers[i].start + level.answers[i].dur) * beat;

    const record = (i: number, r: NoteResult) => {
        const p = play.current;
        p.results[i] = r;
        const m = messageOf(r);
        p.combo = m === 'received' ? p.combo + 1 : 0;
        p.arrived = { kind: m, at: performance.now() };
        setMessages(ms => { const next = [...ms]; next[i] = m; return next; });
        setHud(h => ({ ...h, combo: p.combo, received: h.received + (m === 'received' ? 1 : 0) }));
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
        // Earth: the hums, close — yours (without them, a warm triangle).
        const near = new Tone.Freeverb({ roomSize: 0.5, dampening: 3000 });
        near.wet.value = 0.12;
        near.toDestination();
        const earth = await heldSampler([{ set: SOUNDS.earth, volume: -3, release: 0.18 }], near)
            ?? heldSynth(new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.12, sustain: 0.65, release: 0.16 }, volume: -7 }).toDestination());
        audio.current = { nodes: [space, near, click, accent, star], earth };
        const t0 = scheduleNow() + LEAD_SECONDS;
        p.downbeat = t0 + barSec;
        // A bar counted in, then the beat, softly, all the way.
        const beats = Math.round((level.bars + 1) * level.beatsPerBar);
        for (let k = 0; k <= beats; k++) {
            const down = k % level.beatsPerBar === 0;
            (down ? accent : click).triggerAttackRelease(down ? 'C7' : 'G6', 0.02, t0 + k * beat);
        }
        for (const n of level.calls) {
            star.triggerAttackRelease(Tone.Frequency((n.midi ?? 72) + starShift, 'midi').toFrequency(), Math.max(0.06, n.dur * beat * 0.95), p.downbeat + n.start * beat);
        }
        p.started = true;
        setStarted(true);
    };

    const press = (heard: number) => {
        const p = play.current;
        if (!p.started) { void start(); return; }
        if (p.finished || p.holding || p.i >= level.answers.length) return;
        const err = songTime(heard) - startOf(p.i);
        if (err < -PRESS.ok) { pops.current.push('Too early'); return; }
        p.holding = true;
        p.pressError = err;
        audio.current?.earth.attack(Tone.Frequency((level.answers[p.i].midi ?? 60) + earthShift, 'midi').toFrequency(), Tone.now());
    };

    const release = (heard: number) => {
        const p = play.current;
        if (!p.holding) return;
        const err = songTime(heard) - endOf(p.i);
        p.holding = false;
        audio.current?.earth.release(Tone.now());
        record(p.i, { press: grade(p.pressError, PRESS), release: grade(err, RELEASE), pressError: p.pressError, releaseError: err });
        p.i++;
    };

    // Input: space (and Enter), a touch or click, MIDI — the first key down sends, the last one up stops.
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
            const STAR = { x: 0, y: -255 }, SAT = { x: 0, y: 10 }, EARTH_C = { x: 0, y: 600 }, EARTH_R = 400;
            const ground = { x: 0, y: EARTH_C.y - EARTH_R };
            const sky = new PIXI.Graphics();
            let seed = 23;
            const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
            for (let s = 0; s < 520; s++) sky.circle(rnd() * 2400 - 1200, rnd() * 1600 - 900, rnd() * 1.3 + 0.3).fill({ color: 0xffffff, alpha: 0.12 + rnd() * 0.4 });
            // Earth: ocean, a few continents, the air around it, and the dish that listens.
            const earth = new PIXI.Graphics();
            earth.circle(EARTH_C.x, EARTH_C.y, EARTH_R + 26).fill({ color: 0x38bdf8, alpha: 0.06 });
            earth.circle(EARTH_C.x, EARTH_C.y, EARTH_R + 10).fill({ color: 0x38bdf8, alpha: 0.1 });
            earth.circle(EARTH_C.x, EARTH_C.y, EARTH_R).fill({ color: 0x0f3b6b });
            earth.circle(EARTH_C.x - 60, EARTH_C.y - 30, EARTH_R - 30).fill({ color: 0x14508f, alpha: 0.6 });
            for (const [dx, dy, rx, ry] of [[-190, -330, 90, 36], [120, -350, 70, 28], [-40, -372, 44, 16], [250, -280, 60, 40], [-300, -250, 50, 50]]) {
                earth.ellipse(EARTH_C.x + dx, EARTH_C.y + dy, rx, ry).fill({ color: 0x2f9e5b, alpha: 0.85 });
            }
            earth.moveTo(ground.x, ground.y + 4).lineTo(ground.x, ground.y - 16).stroke({ width: 3, color: 0xd6d6e0 });
            earth.ellipse(ground.x, ground.y - 20, 14, 5).fill({ color: 0xe5e7eb });
            // The satellite: a body, two solar panels, a dish up to the star and an antenna down to Earth.
            const satellite = new PIXI.Graphics();
            for (const side of [-1, 1]) {
                const x0 = side < 0 ? -64 : 20;
                satellite.rect(x0, -9, 44, 18).fill({ color: 0x1d4ed8 });
                for (let c = 1; c < 4; c++) satellite.moveTo(x0 + c * 11, -9).lineTo(x0 + c * 11, 9).stroke({ width: 1, color: 0x93c5fd, alpha: 0.5 });
                satellite.moveTo(x0, 0).lineTo(x0 + 44, 0).stroke({ width: 1, color: 0x93c5fd, alpha: 0.5 });
                satellite.moveTo(side * 14, 0).lineTo(side * 20, 0).stroke({ width: 2, color: 0x9ca3af });
            }
            satellite.roundRect(-14, -13, 28, 26, 4).fill({ color: 0xd1d5db });
            satellite.roundRect(-14, -13, 28, 26, 4).stroke({ width: 1.5, color: 0x6b7280 });
            satellite.ellipse(0, -19, 11, 4).fill({ color: 0xe5e7eb });
            satellite.moveTo(0, -13).lineTo(0, -17).stroke({ width: 2, color: 0x9ca3af });
            satellite.moveTo(0, 13).lineTo(0, 21).stroke({ width: 2, color: 0x9ca3af });
            satellite.circle(0, 22, 2.5).fill({ color: 0xf87171 });
            satellite.position.set(SAT.x, SAT.y);

            const scene = new PIXI.Container();
            const path = new PIXI.Graphics();
            const ringLayer = new PIXI.Graphics();
            const star = new PIXI.Graphics();
            const beam = new PIXI.Graphics();
            const flights = new PIXI.Graphics();
            const halo = new PIXI.Graphics();
            const dots = new PIXI.Graphics();
            scene.addChild(sky, path, earth, ringLayer, beam, flights, star, halo, satellite, dots);
            app.stage.addChild(scene);

            const from = STAR.y + 40, to = SAT.y - 24;
            path.moveTo(0, from).lineTo(0, to).stroke({ width: 1, color: CALL, alpha: 0.14 });
            const travel = level.distance * barSec;
            const speed = (to - from) / travel;
            const callStarts = level.calls.map(n => n.start * beat);
            const rings: number[] = [];
            let flash = 0;
            let lastCall = -1;
            let lastBar = -1;
            let lastCount = 0;

            app.ticker.add(() => {
                const p = play.current;
                const t = p.started ? viewTime() : -barSec;
                const now = p.started ? songTime(heardNow()) : -Infinity;
                const W = app.screen.width, H = app.screen.height;
                scene.position.set(W / 2, H / 2 - 30);
                scene.scale.set(Math.min(W, H) / 740);
                const n = level.answers.length;
                const wall = performance.now();

                // A note never sent, or held on past its end.
                if (p.started && !p.finished) {
                    if (!p.holding && p.i < n && now > startOf(p.i) + PRESS.ok) {
                        record(p.i, { press: 'miss', release: 'miss', pressError: null, releaseError: null });
                        p.i++;
                    } else if (p.holding && now > endOf(p.i) + RELEASE.ok) {
                        p.holding = false;
                        audio.current?.earth.release(Tone.now());
                        record(p.i, { press: grade(p.pressError, PRESS), release: 'miss', pressError: p.pressError, releaseError: null });
                        p.i++;
                    }
                    if (p.i >= n && now > total + 0.5) {
                        p.finished = true;
                        onFinishRef.current(p.results);
                    }
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
                    ringLayer.circle(STAR.x, STAR.y, 44 + age * 200).stroke({ width: 2 + 4 * (1 - age), color: CALL, alpha: (1 - age) * 0.45 });
                }
                star.clear();
                star.circle(STAR.x, STAR.y, 100).fill({ color: CALL, alpha: 0.05 + 0.08 * flash });
                star.circle(STAR.x, STAR.y, 58).fill({ color: CALL, alpha: 0.12 + 0.25 * flash });
                star.circle(STAR.x, STAR.y, 30 + 6 * flash).fill({ color: 0xe6fbff, alpha: 0.9 });

                // Signals on their way down: a head for the note's start, a tail as long as it
                // lasts. What has passed the satellite is gone — beamed on, or lost.
                flights.clear();
                const next = p.i < n ? p.i : -1;
                for (const pk of packets) {
                    const sent = t - pk.emit * beat;
                    if (sent < 0) break;
                    const d = pk.dur * beat;
                    if (sent > travel + d + 0.05) continue;
                    const head = Math.min(to, from + sent * speed), tail = Math.max(from, Math.min(to, from + (sent - d) * speed));
                    if (pk.answer === null) {
                        // One of the star's last notes: nothing to relay, it just passes.
                        if (head < to) {
                            if (head - tail > 1) flights.moveTo(0, tail).lineTo(0, head).stroke({ width: 2, color: 0xffffff, alpha: 0.25 });
                            flights.circle(0, head, 7).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
                        }
                        continue;
                    }
                    // Already relayed (or given up on): what is left of it fades on the way — never sent.
                    const done = pk.answer < p.i;
                    const isNext = pk.answer === next;
                    const alpha = done ? 0.18 : isNext ? 0.85 : 0.5;
                    if (head - tail > 1) flights.moveTo(0, tail).lineTo(0, head).stroke({ width: isNext ? 6 : 4, color: CALL, alpha, cap: 'round' });
                    if (head < to - 1) {
                        flights.circle(0, head, isNext ? 11 : 8).fill({ color: CALL, alpha: 0.22 * (done ? 0.3 : 1) });
                        flights.circle(0, head, isNext ? 6.5 : 5).fill({ color: 0xe6fbff, alpha: done ? 0.25 : 0.95 });
                    }
                    if (isNext && head >= to - 1 && !p.holding) {
                        // It is here: send it.
                        const pulse = 0.5 + 0.5 * Math.sin(wall / 90);
                        flights.circle(0, to, 16 + 4 * pulse).stroke({ width: 2.5, color: CALL, alpha: 0.5 + 0.5 * pulse });
                    }
                }

                // The beam: while you hold, the satellite sends down to Earth — green while there is
                // a note to send, red when you hold on past its end.
                beam.clear();
                halo.clear();
                if (p.holding && p.i < n) {
                    const over = now > endOf(p.i);
                    const color = over ? 0xf87171 : EARTH;
                    const y0 = SAT.y + 24, y1 = ground.y - 24;
                    beam.moveTo(0, y0).lineTo(0, y1).stroke({ width: 16, color, alpha: 0.12 });
                    for (let y = y0 + ((wall / 6) % 22); y < y1; y += 22) beam.moveTo(0, y).lineTo(0, Math.min(y1, y + 11)).stroke({ width: 4, color, alpha: 0.9 });
                    halo.circle(SAT.x, SAT.y, 34).fill({ color, alpha: 0.18 });
                }
                // Earth's dish answers what reached it.
                const got = p.arrived;
                if (got) {
                    const age = (wall - got.at) / 500;
                    if (age < 1) {
                        const c = got.kind === 'received' ? EARTH : got.kind === 'garbled' ? 0xfb923c : 0x9a9aa8;
                        halo.circle(ground.x, ground.y - 20, 12 + age * 34).stroke({ width: 3, color: c, alpha: 0.8 * (1 - age) });
                    }
                }

                // The bar's beats, under the satellite.
                dots.clear();
                const inBar = t >= 0 ? Math.floor((t - bar * barSec) / beat) : -1;
                for (let k = 0; k < level.beatsPerBar; k++) {
                    const x = (k - (level.beatsPerBar - 1) / 2) * 26;
                    dots.circle(x, SAT.y + 50, k === 0 ? 6 : 4.5).fill({ color: 0xffffff, alpha: p.started && t >= 0 && k <= inBar ? 0.85 : 0.14 });
                }

                const ph = playheadRef.current;
                if (ph) {
                    ph.style.left = `${Math.max(0, Math.min(1, t / total)) * 100}%`;
                    ph.style.opacity = p.started && t >= 0 ? '1' : '0';
                }
                // Words at the satellite, which rise and fade on their own (DOM, not Pixi text).
                const layer = popLayerRef.current;
                for (const text of pops.current.splice(0)) {
                    if (!layer) continue;
                    const el = document.createElement('div');
                    el.textContent = text;
                    el.className = 'echo-pop';
                    const sc = Math.min(W, H) / 740;
                    el.style.left = `${W / 2 + 90 * sc}px`;
                    el.style.top = `${H / 2 - 30 + SAT.y * sc}px`;
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

    return (
        <div
            style={{ position: 'relative', flex: 1, minHeight: 0, touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => { e.preventDefault(); press(heardAt(e.timeStamp)); }}
            onPointerUp={e => release(heardAt(e.timeStamp))}
            onPointerCancel={e => release(heardAt(e.timeStamp))}
        >
            <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
            <style>{POP_CSS}</style>
            <div ref={popLayerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />
            <div style={hudStyle}>
                <span style={{ fontWeight: 700 }}>{level.title}</span>
                <span style={{ color: '#9a9aa8' }}>
                    ♩ = {Math.round(level.bpm)} · {level.distance === 1 ? 'a bar' : `${level.distance} bars`} behind · bar {Math.min(hud.bar + 1, level.bars)}/{level.bars}
                </span>
                <span style={{ color: '#86efac' }}>📡 {hud.received}/{level.answers.length}</span>
                {hud.combo > 1 && <span style={{ color: '#4ade80', fontWeight: 700 }}>×{hud.combo}</span>}
                <span style={{ flex: 1 }} />
                <button onClick={e => { e.stopPropagation(); onQuit(); }} onPointerDown={e => e.stopPropagation()} style={quitStyle}>✕ Quit</button>
            </div>

            {!started && (
                <div style={{ ...centerStyle, justifyContent: 'flex-start', paddingTop: '13vh' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>Relay the canon</div>
                    <div style={{ color: '#b0b0bc', maxWidth: 520, lineHeight: 1.5 }}>
                        The star sings a line. Its notes fly down to your satellite and arrive just as your voice — {level.distance === 1 ? 'a bar' : `${level.distance} bars`} behind —
                        should sing them. Hold <b>space</b> (or touch, or any MIDI key) as each one arrives and let go as it ends, to send it on to Earth.
                        Empty circles are the star's last words: let them pass.
                    </div>
                    <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Press to start — one bar counts you in</div>
                </div>
            )}
            {started && countIn > 0 && <div style={{ ...centerStyle, fontSize: '4.5rem', fontWeight: 800, paddingBottom: '8rem' }}>{countIn}</div>}

            <MessageStrip level={level} messages={messages} playheadRef={playheadRef} style={{ position: 'absolute', left: '8%', right: '8%', bottom: '1.4rem', pointerEvents: 'none' }} />
        </div>
    );
};

const POP_CSS = `
.echo-pop { position: absolute; transform: translate(0, -50%); font: 700 18px system-ui, sans-serif; color: #9a9aa8; white-space: nowrap;
  animation: echo-pop 0.8s ease-out forwards; }
@keyframes echo-pop { from { opacity: 1; transform: translate(0, -50%); } to { opacity: 0; transform: translate(0, calc(-50% - 26px)); } }`;
const hudStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', gap: '1rem', alignItems: 'center',
    padding: '0.8rem 1.2rem', fontSize: '0.95rem', background: 'linear-gradient(#05060cdd, transparent)', pointerEvents: 'none',
};
const quitStyle: React.CSSProperties = {
    pointerEvents: 'auto', padding: '0.35rem 0.8rem', borderRadius: '8px', background: 'transparent',
    color: 'white', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
};
const centerStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.8rem', textAlign: 'center', padding: '1rem', pointerEvents: 'none',
};

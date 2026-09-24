import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import * as Tone from 'tone';
import { useMidiNotes } from '../../hooks/useMidi';
import { heardAt, heardNow, scheduleNow } from '../../games/clock';
import { getLatency } from '../../games/latency';
import { addTap, cellOfTap, stepsOf, targetCells, turnOf, type GrooveLevel, type Take, type Turn } from '../../games/groove';
import type { DrumKit, DrumVoiceKey } from '../../utils/drumKit';
import { SOUNDS, marsKit, preload } from './sounds';

/**
 * Groove Builder. The groove is a wheel of pads, Simon-style: a ring for
 * each part, a pad for every step of the bar — 16 for sixteenths, 12 in
 * 12/8, 32 for two bars. A bar is counted in; then you play the first part
 * (space, a touch, any MIDI key or pad) once round, its pads outlined where
 * it should hit. From the next time round it plays as you played it — every
 * tap on the step it landed nearest — while you play the next part on top,
 * and so on; then the whole groove plays twice. A wrong step stays wrong
 * and a missed one stays missing: the groove is what you played. The step
 * sounding lights its column and flashes each pad that plays. Timing as in
 * every game (games/clock.ts, games/latency.ts); the kit is cut from
 * Perseverance's and InSight's recordings on Mars (sounds.ts).
 */

const COLOR: Record<DrumVoiceKey, number> = {
    kick: 0xf97316, snare: 0x22d3ee, clap: 0xe879f9, rim: 0xa3e635, hatClosed: 0xfacc15, hatOpen: 0xfde68a,
    ride: 0x60a5fa, crash: 0x93c5fd, cowbell: 0xf472b6, tambourine: 0xfb7185, tomLow: 0x34d399, tomMid: 0x2dd4bf, tomHigh: 0x86efac,
};
const WRONG = 0xef4444;
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const LEAD_SECONDS = 0.4;
/** How far ahead steps are put on the audio clock. */
const AHEAD = 0.25;

/** Two colours mixed, `t` of the way from a to b. */
function mix(a: number, b: number, t: number): number {
    const c = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
    return (c(16) << 16) | (c(8) << 8) | c(0);
}

interface Play {
    started: boolean;
    finished: boolean;
    /** Audio-context time the count-in starts: global step g falls g steps later. */
    origin: number;
    takes: Take[];
    /** The last step put on the audio clock. */
    scheduled: number;
    /** When the last loop ends, once known. */
    endsAt: number | null;
    /** Bumped whenever a pad changes, so the wheel is redrawn. */
    version: number;
    /** Wall-clock time of the last tap on each step of the part being played, for its flash. */
    tapped: Map<number, number>;
}

export const GrooveGame: React.FC<{
    level: GrooveLevel;
    tempoScale: number;
    onFinish: (takes: Take[]) => void;
    onQuit: () => void;
}> = ({ level, tempoScale, onFinish, onQuit }) => {
    const bpm = level.bpm * tempoScale;
    const beatSec = 60 / bpm;
    const steps = stepsOf(level);
    const stepSec = level.step * beatSec;
    const loopSec = steps * stepSec;
    const latency = getLatency();
    const hostRef = useRef<HTMLDivElement>(null);
    const play = useRef<Play>({ started: false, finished: false, origin: 0, takes: level.layers.map(() => new Map()), scheduled: -1, endsAt: null, version: 0, tapped: new Map() });
    const kit = useRef<DrumKit | null>(null);
    const clicks = useRef<{ click: Tone.Synth; accent: Tone.Synth } | null>(null);
    const [hud, setHud] = useState<{ started: boolean; turn: Turn; countIn: number; nextUp: boolean }>({ started: false, turn: { kind: 'countin' }, countIn: 0, nextUp: false });
    const onFinishRef = useRef(onFinish);
    useEffect(() => { onFinishRef.current = onFinish; });
    // The Mars kit is fetched while the intro is up.
    useEffect(() => preload(SOUNDS.kit), []);

    const onPulse = (cell: number) => Math.abs(((cell * level.step) / level.pulse) - Math.round((cell * level.step) / level.pulse)) < 1e-6;
    const onBar = (cell: number) => Math.abs(((cell * level.step) / level.beatsPerBar) - Math.round((cell * level.step) / level.beatsPerBar)) < 1e-6;

    /** Put step g on the audio clock: the parts already played, as played, and the beat while you play. */
    const scheduleStep = (g: number) => {
        const p = play.current, k = kit.current, c = clicks.current;
        if (!k || !c) return;
        const loop = Math.floor(g / steps), cell = g % steps;
        const turn = turnOf(level, loop);
        const at = p.origin + g * stepSec;
        if (turn.kind === 'end') { if (p.endsAt === null) p.endsAt = at; return; }
        if ((turn.kind === 'countin' || turn.kind === 'record') && onPulse(cell)) {
            const down = onBar(cell);
            const loud = turn.kind === 'countin' ? 0 : -6;
            (down ? c.accent : c.click).triggerAttackRelease(down ? 'C7' : 'G6', 0.02, at, loud === 0 ? 1 : 0.5);
        }
        const upTo = turn.kind === 'record' ? turn.layer : turn.kind === 'final' ? level.layers.length : 0;
        const vel = onBar(cell) ? 0.95 : onPulse(cell) ? 0.82 : 0.68;
        for (let l = 0; l < upTo; l++) if (p.takes[l].has(cell)) k.play(level.layers[l].voice, vel, at);
    };

    // Starting takes a moment (the audio, the samples): a second press meanwhile must not start twice.
    const starting = useRef(false);
    const start = async () => {
        const p = play.current;
        if (p.started || starting.current) return;
        starting.current = true;
        await Tone.start();
        // The kit cut from Perseverance on Mars (the drums app's kit for any part it lacks, or if it cannot be had).
        kit.current = await marsKit();
        const soft = (v: number) => new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: v }).toDestination();
        clicks.current = { click: soft(-24), accent: soft(-18) };
        p.origin = scheduleNow() + LEAD_SECONDS;
        p.started = true;
        setHud(h => ({ ...h, started: true }));
    };

    const tap = (heard: number) => {
        const p = play.current;
        if (!p.started) { void start(); return; }
        if (p.finished) return;
        const { loop, cell, error } = cellOfTap(heard - p.origin - latency, stepSec, steps);
        const turn = turnOf(level, loop);
        // The groove played back at the end is only yours: taps there are silent.
        if (turn.kind === 'final' || turn.kind === 'end') return;
        // You hear your own hit at once, in the voice of the part you are playing.
        kit.current?.play(level.layers[turn.kind === 'record' ? turn.layer : 0].voice, 0.9, Tone.now());
        if (turn.kind !== 'record') return;
        addTap(p.takes[turn.layer], cell, error);
        p.tapped.set(cell, performance.now());
        p.version++;
    };

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onQuit(); return; }
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            if (!e.repeat) tap(heardAt(e.timeStamp));
        };
        window.addEventListener('keydown', down);
        return () => window.removeEventListener('keydown', down);
    });
    useMidiNotes({ onNoteOn: hit => tap(heardAt(hit.timestamp)) });

    // The wheel.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        let destroyed = false;
        const app = new PIXI.Application();
        const setup = async () => {
            await app.init({ resizeTo: host, antialias: true, background: '#0a0a10', resolution: window.devicePixelRatio || 1, autoDensity: true });
            if (destroyed) { app.destroy(true); return; }
            host.appendChild(app.canvas);
            const wheel = new PIXI.Container();
            const base = new PIXI.Graphics();      // the body of the toy, and the hub
            const pads = new PIXI.Graphics();      // every pad, as it stands
            const lit = new PIXI.Graphics();       // the column sounding, and the pads flashing in it
            wheel.addChild(base, pads, lit);
            app.stage.addChild(wheel);

            const n = level.layers.length;
            const targetSets = level.layers.map((_, k) => new Set(targetCells(level, k)));
            let R = 0, r0 = 0;
            const ringIn = (k: number) => r0 + (k * (R - r0)) / n;
            const ringOut = (k: number) => r0 + ((k + 1) * (R - r0)) / n;
            const A = (Math.PI * 2) / steps;
            /** A pad: its ring and step, as an annular sector with a gap of so many pixels round it. */
            const padPath = (k: number, cell: number, inset = 0): number[] => {
                const gap = 5 + 2 * inset;
                const inner = ringIn(k) + gap / 2, outer = ringOut(k) - gap / 2;
                const s0 = -Math.PI / 2 + cell * A, s1 = s0 + A;
                const span = (r: number) => {
                    const half = Math.min(A * 0.45, gap / (2 * r));
                    return [s0 + half, s1 - half] as const;
                };
                const [o0, o1] = span(outer), [i0, i1] = span(inner);
                const seg = Math.max(3, Math.ceil(A / 0.06));
                const pts: number[] = [];
                for (let q = 0; q <= seg; q++) { const a = o0 + (o1 - o0) * (q / seg); pts.push(outer * Math.cos(a), outer * Math.sin(a)); }
                for (let q = seg; q >= 0; q--) { const a = i0 + (i1 - i0) * (q / seg); pts.push(inner * Math.cos(a), inner * Math.sin(a)); }
                return pts;
            };
            /** A pad, filled, with rounded corners: a round-joined stroke of its own colour around it. */
            const drawPad = (g: PIXI.Graphics, k: number, cell: number, color: number, alpha: number) => {
                const pts = padPath(k, cell, 2);
                g.poly(pts).fill({ color, alpha });
                g.poly(pts).stroke({ width: 4, color, alpha, join: 'round' });
            };

            let W = 0, H = 0, drawnVersion = -1, drawnTurn = '', lastCount = -1;
            const redrawPads = (turn: Turn, nextUp: boolean) => {
                const p = play.current;
                pads.clear();
                const current = turn.kind === 'record' ? turn.layer : turn.kind === 'countin' ? 0 : n;
                for (let k = 0; k < n; k++) {
                    const color = COLOR[level.layers[k].voice];
                    const targets = targetSets[k];
                    const take = p.takes[k];
                    const recorded = k < current || turn.kind === 'final' || turn.kind === 'end';
                    const playing = k === current && turn.kind === 'record';
                    // The next part shows its steps a beat early, and during the count-in.
                    const showTargets = playing || (k === current && turn.kind === 'countin') || (nextUp && k === current + 1);
                    for (let c = 0; c < steps; c++) {
                        const hit = take.has(c), want = targets.has(c);
                        if ((recorded || playing) && hit && !want) drawPad(pads, k, c, mix(WRONG, 0x000000, 0.35), 0.95);    // wrong: it stays
                        else if ((recorded || playing) && hit) drawPad(pads, k, c, mix(color, 0x000000, 0.35), 0.95);          // as played
                        else if (showTargets && want) {
                            drawPad(pads, k, c, mix(color, 0x000000, 0.72), 1);
                            pads.poly(padPath(k, c, 2)).stroke({ width: 2, color, alpha: 0.95, join: 'round' });
                        } else if (recorded && want) {
                            // Missing from the groove: an empty pad where a hit should be.
                            drawPad(pads, k, c, 0x15151d, 1);
                            pads.poly(padPath(k, c, 2)).stroke({ width: 1.5, color: WRONG, alpha: 0.6, join: 'round' });
                        } else drawPad(pads, k, c, mix(color, 0x0a0a10, recorded || playing ? 0.88 : 0.93), 1);
                    }
                }
            };
            const relayout = () => {
                W = app.screen.width; H = app.screen.height;
                R = Math.min(W * 0.47, H * 0.46);
                r0 = R * 0.3;
                wheel.position.set(W / 2, H / 2 + 8);
                base.clear();
                base.circle(0, 0, R + 16).fill({ color: 0x1a1a24 });
                base.circle(0, 0, R + 16).stroke({ width: 3, color: 0x2a2a38 });
                // Beat lines between the pads: stronger on each beat, strongest on the bar.
                for (let c = 0; c < steps; c++) {
                    if (!onPulse(c)) continue;
                    const a = -Math.PI / 2 + c * A;
                    base.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * (R + 12), Math.sin(a) * (R + 12))
                        .stroke({ width: onBar(c) ? 3 : 1.5, color: 0xffffff, alpha: onBar(c) ? 0.22 : 0.1 });
                }
                base.circle(0, 0, r0 - 6).fill({ color: 0x101018 });
                base.circle(0, 0, r0 - 6).stroke({ width: 4, color: 0x2a2a38 });
                drawnVersion = -1;
            };

            app.ticker.add(() => {
                if (app.screen.width !== W || app.screen.height !== H) relayout();
                const p = play.current;
                const wall = performance.now();
                // Steps onto the audio clock, a little ahead.
                if (p.started && !p.finished && p.endsAt === null) {
                    while (p.origin + (p.scheduled + 1) * stepSec < scheduleNow() + AHEAD && p.endsAt === null) scheduleStep(++p.scheduled);
                }
                const t = p.started ? heardNow() - p.origin : -1;
                const g = Math.floor(t / stepSec + 1e-6);
                const loop = p.started ? Math.floor(g / steps) : 0;
                const cell = ((g % steps) + steps) % steps;
                const turn = p.started ? turnOf(level, loop) : { kind: 'countin' } as Turn;
                const intoLoop = t - loop * loopSec;
                const nextUp = turn.kind === 'record' && turn.layer + 1 < n && loopSec - intoLoop <= level.pulse * beatSec + 1e-6;
                const countIn = p.started && turn.kind === 'countin' ? Math.ceil((loopSec - Math.max(0, t)) / (level.pulse * beatSec) - 1e-6) : 0;
                const key = `${turn.kind}:${'layer' in turn ? turn.layer : ''}:${nextUp}`;
                if (key !== drawnTurn || p.version !== drawnVersion) {
                    if (key !== drawnTurn) setHud(h => ({ ...h, turn, nextUp }));
                    drawnTurn = key;
                    drawnVersion = p.version;
                    redrawPads(turn, nextUp);
                }
                if (countIn !== lastCount) { lastCount = countIn; setHud(h => ({ ...h, countIn })); }

                // The step sounding: its column lights up; every pad that plays in it flashes.
                lit.clear();
                if (p.started && t >= 0 && turn.kind !== 'end') {
                    const fade = 1 - (t - g * stepSec) / stepSec;
                    const current = turn.kind === 'record' ? turn.layer : turn.kind === 'final' ? n : -1;
                    for (let k = 0; k < n; k++) {
                        const color = COLOR[level.layers[k].voice];
                        const sounds = (k < current && p.takes[k].has(cell)) || (turn.kind === 'final' && p.takes[k].has(cell));
                        const justTapped = k === current && turn.kind === 'record' && wall - (p.tapped.get(cell) ?? -1e9) < stepSec * 1000 * 1.2;
                        if (sounds || justTapped) {
                            const wrong = !targetSets[k].has(cell);
                            const c = wrong ? WRONG : color;
                            lit.poly(padPath(k, cell, -3)).fill({ color: c, alpha: 0.35 * fade });
                            drawPad(lit, k, cell, mix(c, 0xffffff, 0.25 * fade), 1);
                        } else {
                            drawPad(lit, k, cell, 0xffffff, 0.09 + 0.06 * fade);
                        }
                    }
                }

                if (p.endsAt !== null && !p.finished && heardNow() > p.endsAt + 0.3) {
                    p.finished = true;
                    onFinishRef.current(p.takes);
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
        kit.current?.dispose();
        kit.current = null;
        clicks.current?.click.dispose();
        clicks.current?.accent.dispose();
        clicks.current = null;
    }, []);

    const { turn } = hud;
    const part = turn.kind === 'record' ? level.layers[turn.layer] : null;
    const next = turn.kind === 'record' ? level.layers[turn.layer + 1] : level.layers[0];
    return (
        <div
            style={{ position: 'relative', flex: 1, minHeight: 0, touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => { e.preventDefault(); tap(heardAt(e.timeStamp)); }}
        >
            <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
            <div style={hudStyle}>
                <span style={{ fontWeight: 700 }}>{level.title}</span>
                <span style={{ color: '#9a9aa8' }}>♩ = {Math.round(bpm)} · {steps} steps</span>
                <span style={{ flex: 1 }} />
                <button onClick={e => { e.stopPropagation(); onQuit(); }} onPointerDown={e => e.stopPropagation()} style={quitStyle}>✕ Quit</button>
            </div>
            <div style={legendStyle}>
                {level.layers.map((l, k) => {
                    const state = turn.kind === 'final' || turn.kind === 'end' || (turn.kind === 'record' && k < turn.layer) ? 'done'
                        : turn.kind === 'record' && k === turn.layer ? 'now' : 'wait';
                    return (
                        <div key={l.voice} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: state === 'wait' ? 0.45 : 1, fontWeight: state === 'now' ? 700 : 500 }}>
                            <span style={{ width: 12, height: 12, borderRadius: 3, background: css(COLOR[l.voice]) }} />
                            <span>{l.label}</span>
                            <span style={{ color: '#9a9aa8', fontSize: '0.8rem' }}>{state === 'done' ? '✓' : state === 'now' ? '◀' : ''}</span>
                        </div>
                    );
                })}
            </div>
            {/* The hub: the count, then the part being played. */}
            {hud.started && (
                <div style={hubStyle}>
                    {turn.kind === 'countin' && (
                        <>
                            <div style={{ fontSize: '3.2rem', fontWeight: 800, lineHeight: 1 }}>{hud.countIn || ''}</div>
                            <div style={{ color: '#b0b0bc', fontSize: '0.85rem' }}>then the {level.layers[0].label.toLowerCase()}</div>
                        </>
                    )}
                    {part && (
                        <>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: css(COLOR[part.voice]) }}>{part.label}</div>
                            <div style={{ color: '#b0b0bc', fontSize: '0.85rem' }}>{hud.nextUp && next ? `next: ${next.label.toLowerCase()}` : 'your turn'}</div>
                        </>
                    )}
                    {(turn.kind === 'final' || turn.kind === 'end') && (
                        <>
                            <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>Your groove</div>
                            <div style={{ color: '#b0b0bc', fontSize: '0.85rem' }}>as you played it</div>
                        </>
                    )}
                </div>
            )}
            {!hud.started && (
                <div style={{ ...centerStyle, background: 'rgba(10,10,16,0.72)' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>Build the groove</div>
                    <div style={{ color: '#b0b0bc', maxWidth: 520, lineHeight: 1.5 }}>
                        A bar counts you in; then play the {level.layers[0].label.toLowerCase()} once round the wheel — <b>space</b>, a touch, or any
                        MIDI key or pad — on the outlined pads. From then on it plays as you played it, and the next part is yours. After the last one,
                        the whole groove plays twice. What you play is what you get.
                    </div>
                    <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Press to start</div>
                </div>
            )}
        </div>
    );
};

const hudStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', gap: '1rem', alignItems: 'center',
    padding: '0.8rem 1.2rem', fontSize: '0.95rem', background: 'linear-gradient(#0a0a10dd, transparent)', pointerEvents: 'none', zIndex: 1,
};
const legendStyle: React.CSSProperties = {
    position: 'absolute', left: '1.2rem', top: '4rem', display: 'flex', flexDirection: 'column', gap: '0.45rem',
    fontSize: '0.9rem', pointerEvents: 'none',
};
const hubStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, paddingTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.2rem', textAlign: 'center', pointerEvents: 'none',
};
const quitStyle: React.CSSProperties = {
    pointerEvents: 'auto', padding: '0.35rem 0.8rem', borderRadius: '8px', background: 'transparent',
    color: 'white', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
};
const centerStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.8rem', textAlign: 'center', padding: '1rem', pointerEvents: 'none',
};

import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import * as Tone from 'tone';
import { useMidiNotes } from '../../hooks/useMidi';
import { heardAt, heardNow, scheduleNow } from '../../games/clock';
import { getLatency } from '../../games/latency';
import { PRESS, RELEASE, grade, noteGrade, type Grade, type NoteResult } from '../../games/judge';
import { angleAt, buildCourse, idealPosition, onOrbit, tangent, type Course, type Point } from '../../games/slingshot/course';
import { LESSON_PITCH, noteShape, type RhythmLevel } from '../../games/rhythm';
import { drawNote } from './noteGlyph';
import { SOUNDS, heldSampler, heldSynth, preload, type HeldVoice } from './sounds';

/**
 * Centripetal Groove — the Slingshot. Hold (space, a touch, any MIDI key)
 * while a note sounds and the probe whips around its anchor, a quarter turn
 * a beat; let go when the note ends and it is flung to the next. What is
 * judged is when you press and, above all, when you let go: the length of
 * each note. The note sounds for exactly as long as you hold it.
 *
 * Timing is the audio clock as heard (games/clock.ts), less the calibrated
 * device delay (games/latency.ts). The course is the level's rhythm drawn as
 * geometry (games/slingshot/course.ts).
 */

const GRADE_COLOR: Record<Grade, number> = { perfect: 0x4ade80, good: 0x22d3ee, ok: 0xfacc15, miss: 0xf87171 };
const GRADE_LABEL: Record<Grade, string> = { perfect: 'Perfect', good: 'Good', ok: 'OK', miss: 'Miss' };
const ACCENT = 0x22d3ee;
const LEAD_SECONDS = 0.4;

interface Play {
    started: boolean;
    finished: boolean;
    /** Audio-context time of the first downbeat (after the count-in). */
    downbeat: number;
    /** Next note to play. */
    i: number;
    holding: boolean;
    pressError: number | null;
    results: NoteResult[];
    /** Where the last fling left from, for drawing the flight. */
    fling: { from: Point; dir: Point; t: number } | null;
    combo: number;
}

export const SlingshotGame: React.FC<{
    level: RhythmLevel;
    tempoScale: number;
    onFinish: (results: NoteResult[]) => void;
    onQuit: () => void;
}> = ({ level, tempoScale, onFinish, onQuit }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const bpm = level.bpm * tempoScale;
    const beat = 60 / bpm;
    const [course] = useState<Course>(() => buildCourse(level.notes, { beat }));
    const play = useRef<Play>({ started: false, finished: false, downbeat: 0, i: 0, holding: false, pressError: null, results: [], fling: null, combo: 0 });
    const [hud, setHud] = useState({ started: false, countIn: 0, combo: 0, done: 0 });
    const audio = useRef<{ click: Tone.Synth; accent: Tone.Synth; voice: HeldVoice; space: Tone.Freeverb } | null>(null);
    // The NASA pad is fetched while the intro is up, so it is ready by the first press.
    useEffect(() => preload(SOUNDS.slingshot, SOUNDS.slingshotTexture), []);
    const popups = useRef<Array<{ text: string; color: number; at: Point; t: number }>>([]);
    const judged = useRef<Map<number, Grade>>(new Map());
    const onFinishRef = useRef(onFinish);
    useEffect(() => { onFinishRef.current = onFinish; });

    const latency = getLatency();
    /** A press or release, in seconds from the first downbeat: as heard, less
     *  the device delay (the input and the player's reaction to the sound). */
    const songTime = (heard: number) => heard - play.current.downbeat - latency;
    /** The picture follows the sound as heard, with no delay taken off. */
    const viewTime = () => heardNow() - play.current.downbeat;
    const noteStart = (i: number) => level.notes[i].start * beat;
    const noteEnd = (i: number) => (level.notes[i].start + level.notes[i].dur) * beat;
    const freq = (i: number) => Tone.Frequency(level.notes[i].midi ?? LESSON_PITCH, 'midi').toFrequency();

    const record = (i: number, r: NoteResult) => {
        const p = play.current;
        p.results[i] = r;
        const g = noteGrade(r);
        judged.current.set(i, g);
        p.combo = g === 'miss' ? 0 : p.combo + 1;
        const o = course.orbits[i];
        popups.current.push({ text: GRADE_LABEL[g], color: GRADE_COLOR[g], at: { x: o.cx, y: o.cy }, t: performance.now() });
        setHud(h => ({ ...h, combo: p.combo, done: i + 1 }));
    };

    // Starting takes a moment (the audio, the samples): a second press meanwhile must not start twice.
    const starting = useRef(false);
    const start = async () => {
        const p = play.current;
        if (p.started || starting.current) return;
        starting.current = true;
        await Tone.start();
        const click = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: -20 }).toDestination();
        const accent = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 }, volume: -15 }).toDestination();
        // The held note: Nasa Space Pad's sonar ping at the note's pitch, the take-off rumble under it,
        // in a little space — or, without the samples, the triangle it always had.
        const space = new Tone.Freeverb({ roomSize: 0.78, dampening: 3000 });
        space.wet.value = 0.22;
        space.toDestination();
        const voice = await heldSampler([{ set: SOUNDS.slingshot, volume: -4 }, { set: SOUNDS.slingshotTexture, volume: -15 }], space)
            ?? heldSynth(new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.12 }, volume: -8 }).toDestination());
        audio.current = { click, accent, voice, space };
        // One bar counted in, then every beat to the end.
        const t0 = scheduleNow() + LEAD_SECONDS;
        const countIn = level.beatsPerBar;
        p.downbeat = t0 + countIn * beat;
        const beats = countIn + Math.ceil(level.length);
        for (let k = 0; k <= beats; k++) {
            const down = ((k - countIn) % level.beatsPerBar + level.beatsPerBar) % level.beatsPerBar === 0;
            (down ? accent : click).triggerAttackRelease(down ? 'C7' : 'G6', 0.02, t0 + k * beat);
        }
        p.started = true;
        setHud(h => ({ ...h, started: true }));
    };

    const press = (heard: number) => {
        const p = play.current;
        if (!p.started) { void start(); return; }
        if (p.finished || p.holding || p.i >= level.notes.length) return;
        const t = songTime(heard);
        const err = t - noteStart(p.i);
        if (err < -PRESS.ok) {
            popups.current.push({ text: 'Too early', color: 0x9a9aa8, at: { x: course.orbits[p.i].cx, y: course.orbits[p.i].cy }, t: performance.now() });
            return;
        }
        p.holding = true;
        p.pressError = err;
        audio.current?.voice.attack(freq(p.i), Tone.now());
    };

    const release = (heard: number) => {
        const p = play.current;
        if (!p.holding) return;
        const i = p.i;
        const t = songTime(heard);
        // The fling is drawn on the picture's clock, from where the probe was.
        const seen = heard - p.downbeat;
        const o = course.orbits[i];
        const a = angleAt(o, course.omega, Math.min(seen, noteEnd(i)));
        p.fling = { from: onOrbit(o, course.radius, a), dir: tangent(o, a), t: seen };
        p.holding = false;
        audio.current?.voice.release(Tone.now());
        record(i, { press: grade(p.pressError, PRESS), release: grade(t - noteEnd(i), RELEASE), pressError: p.pressError, releaseError: t - noteEnd(i) });
        p.i++;
    };

    // Input: space (and Enter), a touch or click, any MIDI key.
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
            await app.init({ resizeTo: host, antialias: true, background: '#07080f', resolution: window.devicePixelRatio || 1, autoDensity: true });
            if (destroyed) { app.destroy(true); return; }
            host.appendChild(app.canvas);
            const world = new PIXI.Container();
            app.stage.addChild(world);

            // Stars, scattered over the course with a margin.
            const stars = new PIXI.Graphics();
            let seed = 7;
            const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
            const b = course.orbits.reduce((acc, o) => ({
                minX: Math.min(acc.minX, o.cx), maxX: Math.max(acc.maxX, o.cx), minY: Math.min(acc.minY, o.cy), maxY: Math.max(acc.maxY, o.cy),
            }), { minX: course.origin.x, maxX: course.origin.x, minY: course.origin.y, maxY: course.origin.y });
            const area = (b.maxX - b.minX + 1600) * (b.maxY - b.minY + 1600);
            for (let s = 0; s < Math.min(2500, area / 6000); s++) {
                stars.circle(b.minX - 800 + rnd() * (b.maxX - b.minX + 1600), b.minY - 800 + rnd() * (b.maxY - b.minY + 1600), rnd() * 1.4 + 0.3)
                    .fill({ color: 0xffffff, alpha: 0.15 + rnd() * 0.45 });
            }
            world.addChild(stars);

            // The course: each note's arc with a tick per beat, the flights between.
            const r = course.radius;
            const guides = new PIXI.Graphics();
            world.addChild(guides);
            // The way to go glows (drawn over the arcs, under the probe).
            const glow = new PIXI.Graphics();
            const arcs = course.orbits.map(() => {
                const g = new PIXI.Graphics();
                world.addChild(g);
                return g;
            });
            // Every stroke is its own path, begun with moveTo: in Pixi v8 an
            // arc() or a shape joins onto whatever point the path was at.
            const line = (g: PIXI.Graphics, pts: Point[], style: PIXI.StrokeInput) => {
                g.moveTo(pts[0].x, pts[0].y);
                for (let k = 1; k < pts.length; k++) g.lineTo(pts[k].x, pts[k].y);
                g.stroke(style);
            };
            const at = (o: typeof course.orbits[number], radius: number, a: number): Point =>
                ({ x: o.cx + radius * Math.cos(a), y: o.cy + radius * Math.sin(a) });
            const drawArc = (i: number) => {
                const o = course.orbits[i];
                const g = arcs[i];
                const judgedAs = judged.current.get(i);
                const color = judgedAs ? GRADE_COLOR[judgedAs] : ACCENT;
                g.clear();
                g.circle(o.cx, o.cy, r).stroke({ width: 1, color: 0xffffff, alpha: 0.08 });
                // The note's arc: a quarter turn a beat.
                const sweep = o.dir * o.beats * Math.PI / 2;
                const steps = Math.max(8, Math.ceil(o.beats * 18));
                line(g, Array.from({ length: steps + 1 }, (_, k) => at(o, r, o.entry + sweep * k / steps)),
                    { width: 5, color, alpha: judgedAs ? 0.85 : 0.35, cap: 'round' });
                // A tick on every beat inside the note…
                for (let k = 1; k < o.beats; k++) {
                    const a = o.entry + o.dir * k * Math.PI / 2;
                    line(g, [at(o, r - 7, a), at(o, r + 7, a)], { width: 2, color, alpha: 0.6 });
                }
                // …and the mark where to let go.
                const end = o.entry + sweep;
                line(g, [at(o, r - 12, end), at(o, r + 12, end)], { width: 4, color: 0xffffff, alpha: judgedAs ? 0.3 : 0.9 });
                // The written note, at the anchor.
                drawNote(g, o.cx, o.cy, noteShape(o.beats), judgedAs ? color : 0xffffff, judgedAs ? 0.9 : 0.85);
            };
            course.orbits.forEach((o, i) => {
                drawArc(i);
                const next = course.orbits[i + 1];
                if (!next) return;
                line(guides, [onOrbit(o, r, angleAt(o, course.omega, o.end)), onOrbit(next, r, next.entry)], { width: 1.5, color: ACCENT, alpha: 0.25 });
            });
            const first = course.orbits[0];
            if (first) {
                line(guides, [course.origin, onOrbit(first, r, first.entry)], { width: 1.5, color: ACCENT, alpha: 0.25 });
            }

            const tether = new PIXI.Graphics();
            const trail = new PIXI.Graphics();
            const probe = new PIXI.Graphics();
            probe.circle(0, 0, 9).fill(0xffffff).circle(0, 0, 16).fill({ color: ACCENT, alpha: 0.25 });
            world.addChild(glow, tether, trail, probe);
            const labels = new PIXI.Container();
            world.addChild(labels);
            const history: Point[] = [];
            let cam: Point | null = null;
            let lastJudged = 0;
            let lastNext = -1;
            let lastCountIn = 0;
            const popupText = new Map<object, PIXI.Text>();

            app.ticker.add(() => {
                const p = play.current;
                // `now`: the judging clock, for missed strikes and overlong
                // holds. `t`: the sound as heard, for the picture.
                const now = p.started ? songTime(heardNow()) : -Infinity;
                const t = p.started ? viewTime() : -course.leadIn - 1;
                const n = level.notes.length;

                // A strike that never came, or a note held too long.
                if (p.started && !p.finished) {
                    if (!p.holding && p.i < n && now > noteStart(p.i) + PRESS.ok) {
                        record(p.i, { press: 'miss', release: 'miss', pressError: null, releaseError: null });
                        p.i++;
                    } else if (p.holding && now > noteEnd(p.i) + RELEASE.ok) {
                        const i = p.i;
                        p.holding = false;
                        audio.current?.voice.release(Tone.now());
                        record(i, { press: grade(p.pressError, PRESS), release: 'miss', pressError: p.pressError, releaseError: null });
                        p.fling = null;
                        p.i++;
                    }
                    if (p.i >= n && now > level.length * beat + 0.4) {
                        p.finished = true;
                        onFinishRef.current(p.results);
                    }
                }
                if (judged.current.size !== lastJudged) {
                    lastJudged = judged.current.size;
                    course.orbits.forEach((_, i) => { if (judged.current.has(i)) drawArc(i); });
                }
                // The next orbit glows; the few after it wait a little dimmer;
                // the rest of the course — played, or far ahead — fades back,
                // so where it crosses itself the way on still reads.
                if (p.i !== lastNext) {
                    lastNext = p.i;
                    arcs.forEach((g, k) => { g.alpha = k < p.i ? 0.25 : k === p.i ? 1 : k <= p.i + 3 ? 0.7 : 0.3; });
                }
                // The glow is the way to go, not the whole ring: the arc still
                // to travel on the next orbit — shrinking as the note is held —
                // up to the mark where to let go, which glows too.
                glow.clear();
                const next = course.orbits[p.i];
                if (next && !p.finished) {
                    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
                    const release = next.entry + next.dir * next.beats * Math.PI / 2;
                    const from = p.holding ? angleAt(next, course.omega, Math.min(t, noteEnd(p.i))) : next.entry;
                    const left = release - from;
                    if (Math.abs(left) > 1e-3) {
                        const steps = Math.max(4, Math.ceil(Math.abs(left) / (Math.PI / 36)));
                        const pts = Array.from({ length: steps + 1 }, (_, k) => at(next, r, from + (left * k) / steps));
                        line(glow, pts, { width: 16, color: ACCENT, alpha: 0.1 + 0.1 * pulse, cap: 'round' });
                        line(glow, pts, { width: 7, color: ACCENT, alpha: 0.35 + 0.25 * pulse, cap: 'round' });
                    }
                    line(glow, [at(next, r - 16, release), at(next, r + 16, release)], { width: 10, color: 0xffffff, alpha: 0.12 + 0.18 * pulse, cap: 'round' });
                }

                // Where the probe is: on the orbit while held (in time with
                // the music), flying from where it was let go, or on course.
                let pos: Point;
                let coasting = false;
                const o = course.orbits[p.i];
                if (p.holding && o) {
                    pos = onOrbit(o, r, angleAt(o, course.omega, Math.min(t, noteEnd(p.i))));
                } else if (p.fling && o && t < noteStart(p.i)) {
                    const to = onOrbit(o, r, o.entry);
                    const span = Math.max(0.05, noteStart(p.i) - p.fling.t);
                    const k = Math.max(0, Math.min(1, (t - p.fling.t) / span));
                    const d = Math.hypot(to.x - p.fling.from.x, to.y - p.fling.from.y) / 2;
                    const c = { x: p.fling.from.x + p.fling.dir.x * d, y: p.fling.from.y + p.fling.dir.y * d };
                    pos = {
                        x: (1 - k) * (1 - k) * p.fling.from.x + 2 * (1 - k) * k * c.x + k * k * to.x,
                        y: (1 - k) * (1 - k) * p.fling.from.y + 2 * (1 - k) * k * c.y + k * k * to.y,
                    };
                } else {
                    pos = idealPosition(course, t);
                    coasting = !!o && t >= noteStart(p.i) && t <= noteEnd(p.i);
                }
                probe.position.set(pos.x, pos.y);
                probe.alpha = coasting ? 0.35 : 1;
                tether.clear();
                if (p.holding && o) line(tether, [{ x: o.cx, y: o.cy }, pos], { width: 2, color: 0xffffff, alpha: 0.5 });
                history.push(pos);
                if (history.length > 40) history.shift();
                // The trail, fading, in five strokes rather than one per segment.
                trail.clear();
                const BUCKETS = 5, per = Math.ceil(history.length / BUCKETS);
                for (let bkt = 0; bkt < BUCKETS; bkt++) {
                    const seg = history.slice(bkt * per, (bkt + 1) * per + 1);
                    if (seg.length > 1) line(trail, seg, { width: 3, color: ACCENT, alpha: ((bkt + 1) / BUCKETS) * 0.6 });
                }

                // Grade popups: one text each for its whole short life (making
                // text is costly — a new one every frame stuttered in WebKit).
                const wall = performance.now();
                for (const pp of popups.current) {
                    let label = popupText.get(pp);
                    if (!label) {
                        label = new PIXI.Text({ text: pp.text, style: { fill: pp.color, fontSize: 22, fontWeight: '700', fontFamily: 'system-ui, sans-serif' } });
                        label.anchor.set(0.5);
                        labels.addChild(label);
                        popupText.set(pp, label);
                    }
                    const age = (wall - pp.t) / 900;
                    label.position.set(pp.at.x, pp.at.y - r - 22 - age * 30);
                    label.alpha = Math.max(0, 1 - age);
                }
                const alive = popups.current.filter(pp => wall - pp.t < 900);
                if (alive.length !== popups.current.length) {
                    for (const pp of popups.current) {
                        if (alive.includes(pp)) continue;
                        popupText.get(pp)?.destroy();
                        popupText.delete(pp);
                    }
                    popups.current = alive;
                }

                // Camera: follow the probe, a little ahead, smoothly.
                const scale = Math.min(app.screen.width, app.screen.height) / 620;
                world.scale.set(scale);
                cam = cam ? { x: cam.x + (pos.x - cam.x) * 0.08, y: cam.y + (pos.y - cam.y) * 0.08 } : pos;
                world.position.set(app.screen.width / 2 - cam.x * scale, app.screen.height / 2 - cam.y * scale);

                // The count-in, big, before the first downbeat — React only
                // hears about it when the number changes.
                const left = p.started && t < 0 ? Math.ceil(-t / beat) : 0;
                if (left !== lastCountIn) {
                    lastCountIn = left;
                    setHud(hh => ({ ...hh, countIn: left }));
                }
            });
        };
        void setup();
        return () => {
            destroyed = true;
            if (app.renderer) app.destroy(true, { children: true });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [course]);

    // Sound off when leaving.
    useEffect(() => () => {
        const a = audio.current;
        audio.current = null;
        if (a) { a.voice.dispose(); a.click.dispose(); a.accent.dispose(); a.space.dispose(); }
    }, []);

    return (
        <div
            style={{ position: 'relative', flex: 1, minHeight: 0, touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => { e.preventDefault(); press(heardAt(e.timeStamp)); }}
            onPointerUp={e => release(heardAt(e.timeStamp))}
            onPointerCancel={e => release(heardAt(e.timeStamp))}
        >
            <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
            <div style={hudStyle}>
                <span style={{ fontWeight: 700 }}>{level.title}</span>
                <span style={{ color: '#9a9aa8' }}>♩ = {Math.round(bpm)} · {hud.done}/{level.notes.length}</span>
                {hud.combo > 1 && <span style={{ color: '#4ade80', fontWeight: 700 }}>×{hud.combo}</span>}
                <span style={{ flex: 1 }} />
                <button onClick={e => { e.stopPropagation(); onQuit(); }} onPointerDown={e => e.stopPropagation()} style={quitStyle}>✕ Quit</button>
            </div>
            {!hud.started && (
                <div style={centerStyle}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>Hold to orbit · let go to fling</div>
                    <div style={{ color: '#b0b0bc', maxWidth: 460, lineHeight: 1.5 }}>
                        Press and hold <b>space</b> (or touch, or any MIDI key) as the probe reaches an anchor, and
                        let go at the white mark — each tick is a beat. The note sounds for as long as you hold.
                    </div>
                    <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Press to start — one bar counts you in</div>
                </div>
            )}
            {hud.started && hud.countIn > 0 && <div style={{ ...centerStyle, fontSize: '5rem', fontWeight: 800, pointerEvents: 'none' }}>{hud.countIn}</div>}
        </div>
    );
};

const hudStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', gap: '1rem', alignItems: 'center',
    padding: '0.8rem 1.2rem', fontSize: '0.95rem', background: 'linear-gradient(#07080fdd, transparent)', pointerEvents: 'none',
};
const quitStyle: React.CSSProperties = {
    pointerEvents: 'auto', padding: '0.35rem 0.8rem', borderRadius: '8px', background: 'transparent',
    color: 'white', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
};
const centerStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.8rem', textAlign: 'center', padding: '1rem', pointerEvents: 'none',
};

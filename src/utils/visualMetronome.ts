import * as PIXI from 'pixi.js';
import * as Tone from 'tone';
import { TONE_PPQ, type TimemapData } from './timemap';
import { beatTicksOf, beatsAt, swingAt } from './metronomeBeat';

export { beatTicksOf };

/**
 * The visual metronome on the score's cursor.
 *
 * A small arrow on the cursor, pointing back over the music, dips to the
 * bottom of its swing on every beat and rises between: a wave in the tempo.
 * Behind it, over the clef and the key signature, it leaves its trace — the
 * last few beats of the wave, sliding away to the left — and every key the
 * player presses leaves a dot on the trace where the arrow was. A dot in a
 * trough is a note on the beat; one on the slope before or after it is early
 * or late, by as much as it is up the slope.
 *
 *         ·  ╭─╮     ╭─╮     ╭─◂│
 *   ╭─╮     ╭╯  ╰╮   ╭╯  ╰╮   ╭╯  │   the cursor
 *  ╯   ╰─•─╯     ╰─•─╯     ╰─•─╯  │   (• a key pressed on the beat)
 *
 * It keeps the time that is heard: the transport at the audio clock's
 * present, not the lookahead the scheduler works at — so the arrow is at the
 * bottom as the metronome clicks, and a key pressed with the click lands in a
 * trough. The beat is the meter's (a quarter in 4/4, a dotted quarter in 6/8,
 * an eighth in 5/8), counted from each bar line.
 */

/** Where the metronome draws, in screen pixels: from `left` to the cursor, between `top` and `bottom`. */
export interface MetronomeArea {
    left: number;
    cursorX: number;
    top: number;
    bottom: number;
}

/** How long the trace is, at most and at least, in beats; about this many pixels a beat. */
const MAX_BEATS = 4;
const MIN_BEATS = 2;
const PX_PER_BEAT = 70;
/** The arrow: how far it points back, and how tall it is. */
const ARROW_W = 9;
const ARROW_H = 12;
/** Pressed keys kept: enough for a fast passage across the trace. */
const MAX_HITS = 96;

/** The transport's position as it is heard: at the audio clock's present, not ahead of it. */
export function heardTicks(): number {
    const transport = Tone.getTransport();
    try {
        return transport.getTicksAtTime(Tone.immediate());
    } catch {
        return transport.ticks;
    }
}

export class VisualMetronome {
    readonly view = new PIXI.Graphics();
    private readonly color: number;
    private readonly trace: number;
    private hits: number[] = [];
    private bars: number[] = [0];
    private beatTicks = TONE_PPQ;
    private area: MetronomeArea | null = null;
    private drawnKey = '';

    /** `trace`: how strongly the trace is drawn — fainter where it crosses the music rather than the clef strip. */
    constructor(color: number, trace = 1) {
        this.color = color;
        this.trace = trace;
        this.view.eventMode = 'none';
    }

    /** A new score: its bar lines and its beat. */
    setScore(tm: TimemapData) {
        const starts = [...new Set(tm.measureTicks.values())].sort((a, b) => a - b);
        this.bars = starts.length ? starts : [0];
        this.beatTicks = beatTicksOf(tm.meter);
        this.hits = [];
        this.drawnKey = '';
    }

    setArea(area: MetronomeArea | null) {
        this.area = area;
    }

    /** A key pressed now. */
    hit() {
        this.hits.push(heardTicks());
        if (this.hits.length > MAX_HITS) this.hits.splice(0, this.hits.length - MAX_HITS);
    }

    /** Draw for this frame; nothing is redrawn while nothing has moved. */
    update() {
        const a = this.area;
        if (!a || a.cursorX - a.left < 40 || a.bottom - a.top < 10) {
            if (this.drawnKey) { this.view.clear(); this.drawnKey = ''; }
            return;
        }
        const now = heardTicks();
        const key = `${now.toFixed(1)}|${a.left}|${a.cursorX}|${a.top}|${a.bottom}|${this.hits.length}`;
        if (key === this.drawnKey) return;
        this.drawnKey = key;

        const tip = a.cursorX - ARROW_W;
        const width = tip - a.left;
        const beats = Math.max(MIN_BEATS, Math.min(MAX_BEATS, Math.round(width / PX_PER_BEAT)));
        const span = beats * this.beatTicks;
        const pxPerTick = width / span;
        const mid = (a.top + a.bottom) / 2, amp = (a.bottom - a.top) / 2;
        // At the bottom on the beat, at the top between beats.
        const yAt = (tick: number) => mid + amp * swingAt(beatsAt(this.bars, this.beatTicks, tick));
        const xAt = (tick: number) => tip - (now - tick) * pxPerTick;

        const g = this.view;
        g.clear();

        // The beat: a faint floor the troughs touch.
        g.moveTo(a.left, a.bottom).lineTo(tip, a.bottom).stroke({ width: 1, color: this.color, alpha: 0.18 });

        // The trace, fading as it goes back in time.
        const steps = Math.max(24, Math.round(width / 3));
        const parts = 6;
        for (let p = 0; p < parts; p++) {
            const from = Math.floor((p * steps) / parts), to = Math.floor(((p + 1) * steps) / parts);
            for (let i = from; i <= to; i++) {
                const x = a.left + (i / steps) * width;
                const y = yAt(now - (tip - x) / pxPerTick);
                if (i === from) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.stroke({ width: 2, color: this.color, alpha: (0.12 + 0.68 * ((p + 1) / parts)) * this.trace });
        }

        // The keys pressed, where the arrow was.
        for (const t of this.hits) {
            if (t > now + 1 || t < now - span) continue;
            g.circle(xAt(t), yAt(t), 3.5).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ width: 1.5, color: this.color });
        }

        // The arrow, on the cursor, pointing back along the trace.
        const y = yAt(now);
        g.poly([a.cursorX, y - ARROW_H / 2, a.cursorX, y + ARROW_H / 2, tip, y]).fill({ color: this.color });
    }

    destroy() {
        this.view.destroy();
    }
}

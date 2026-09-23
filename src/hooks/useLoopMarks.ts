import { useEffect, useRef, useState, type RefObject } from 'react';
import * as PIXI from 'pixi.js';
import { useGame } from '../context/game';

export interface LoopMarksLayout {
    /** Where the page sits in the scroll container. */
    top: number;
    /** The scroll container's scale. */
    scale: number;
    /** Each measure's left edge on the page, by start tick; `end` is where
     *  the last measure stops. */
    measures: Array<{ startTick: number; x: number }>;
    end: { tick: number; x: number };
    /** Each staff's top and bottom line (utils/scoreRaster.ts measureStaffLines). */
    staves: Array<{ top: number; bottom: number }>;
    /** Where the start sign goes: the stage, above the sticky clef strip. */
    overlay: PIXI.Container;
}

export interface LoopMarks {
    /** Before the viewer clears its scroll container for a new score. */
    reset(): void;
    /** Once the page, its clef strip and overlays are all in place. */
    attach(layout: LoopMarksLayout): void;
    /** Every frame, from the viewer's ticker: where the page is scrolled to,
     *  and the cursor's x — the start sign never goes left of it. */
    follow(scrollX: number, cursorX: number): void;
}

/**
 * The minimap's bar range, drawn on the score itself: a start-repeat sign at
 * its first bar line and an end-repeat at its last, in the instrument's own
 * colour — the page says what is looping (or, by ear, what is being learned)
 * without a glance at the minimap. Thick line, thin line and two dots per
 * staff, spanning the whole system like a real repeat bar line, both in the
 * room before their bar line so they never sit on a note.
 *
 * The end sign scrolls with the music. The start sign is pinned: once the
 * music has scrolled past it, it waits at the cursor, over the clef strip —
 * otherwise it would spend the whole loop hidden under that strip, since the
 * playhead is at (or after) the loop's start.
 */
export function useLoopMarks(scrollContainerRef: RefObject<PIXI.Container | null>, color: number): LoopMarks {
    const { loopRange } = useGame();
    const layoutRef = useRef<LoopMarksLayout | null>(null);
    const endRef = useRef<PIXI.Graphics | null>(null);
    const startRef = useRef<PIXI.Graphics | null>(null);
    /** The start bar line on the page, or null when there is no range. */
    const startXRef = useRef<number | null>(null);
    const [layoutId, setLayoutId] = useState(0);

    const [api] = useState<LoopMarks>(() => ({
        reset() {
            for (const ref of [endRef, startRef]) {
                const g = ref.current;
                ref.current = null;
                if (g && !g.destroyed) g.destroy();
            }
            layoutRef.current = null;
            startXRef.current = null;
        },
        attach(layout) {
            layoutRef.current = layout;
            const end = new PIXI.Graphics();
            scrollContainerRef.current?.addChild(end);
            endRef.current = end;
            const start = new PIXI.Graphics();
            start.scale.set(layout.scale);
            layout.overlay.addChild(start);
            startRef.current = start;
            setLayoutId(n => n + 1);
        },
        follow(scrollX, cursorX) {
            const start = startRef.current;
            const layout = layoutRef.current;
            const x = startXRef.current;
            if (!start || !layout || x === null) return;
            start.x = Math.max(scrollX + x * layout.scale, cursorX);
        },
    }));

    useEffect(() => {
        const end = endRef.current;
        const start = startRef.current;
        const layout = layoutRef.current;
        if (!end || !start || !layout) return;
        end.clear();
        start.clear();
        startXRef.current = null;
        if (!loopRange || layout.staves.length === 0) return;

        const xAt = (tick: number) => tick >= layout.end.tick
            ? layout.end.x
            : layout.measures.find(m => m.startTick === tick)?.x;
        const systemTop = layout.top + layout.staves[0].top;
        const height = layout.top + layout.staves[layout.staves.length - 1].bottom - systemTop;
        const space = (layout.staves[0].bottom - layout.staves[0].top) / 4;

        // Proportions of an engraved repeat bar line, in staff spaces, a
        // little slimmer than printed: the page was not spaced for it.
        const thick = space * 0.42;
        const thin = Math.max(1.2, space * 0.14);
        const gap = space * 0.28;
        const dotR = space * 0.2;
        const dots = (g: PIXI.Graphics, cx: number) => {
            for (const s of layout.staves) {
                const top = layout.top + s.top;
                const sp = (s.bottom - s.top) / 4;
                g.circle(cx, top + sp * 1.5, dotR).fill(color);
                g.circle(cx, top + sp * 2.5, dotR).fill(color);
            }
        };

        // Both signs sit in the space before their bar line: Verovio sets a
        // bar's first note close after it, and a sign drawn there would sit
        // on the note. Start ‖: — thick, thin, dots, then the bar line —
        // drawn with the bar line at x = 0, positioned by follow().
        const startX = xAt(loopRange.start);
        if (startX !== undefined) {
            const dotX = -gap - dotR;
            const thinX = dotX - dotR - gap - thin;
            start.rect(thinX - gap - thick, systemTop, thick, height).fill(color);
            start.rect(thinX, systemTop, thin, height).fill(color);
            dots(start, dotX);
            startXRef.current = startX;
        }
        // End :‖ — dots, thin, and the thick line over the bar line itself.
        const endX = xAt(loopRange.end);
        if (endX !== undefined) {
            const thickX = endX - thick / 2;
            const thinX = thickX - gap - thin;
            end.rect(thickX, systemTop, thick, height).fill(color);
            end.rect(thinX, systemTop, thin, height).fill(color);
            dots(end, thinX - gap - dotR);
        }
    }, [loopRange, layoutId, color]);

    return api;
}

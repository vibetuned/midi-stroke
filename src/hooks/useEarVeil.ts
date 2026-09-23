import { useEffect, useRef, useState, type RefObject } from 'react';
import * as PIXI from 'pixi.js';
import { useEarTraining } from '../context/earTraining';
import { emptyBarsSvg, loadSvgImage, sliceToSprites, type ScorePage } from '../utils/scoreRaster';

export interface VeilLayout {
    page: ScorePage & {
        /** Between the two staves of a grand staff; null for a single staff. */
        staffMidY: number | null;
    };
    /** The SVG the page was rasterised from. */
    svg: string;
    /** Each note's left edge on the page (utils/scoreRaster.ts measureNoteLefts). */
    noteLeft: Map<string, number>;
}

export interface EarVeil {
    /** Before the viewer clears its scroll container for a new score. */
    reset(): void;
    /** Once a page's slices are in the scroll container. */
    attach(layout: VeilLayout): void;
}

/**
 * Learn by ear's veil over a score viewer: what is on the page is only what
 * has been played. Notes are revealed strictly in order, so what is visible is
 * always a prefix of the melody. From the first unplayed note to the end the
 * page shows empty bars instead — no pitch, no rhythm, no beam slope to give
 * the contour away — and so does the other staff of a grand staff, which is
 * not being trained and whose notes would hint at the harmony. A finished
 * melody lifts it all.
 *
 * The empty bars are a second raster of the page (utils/scoreRaster.ts),
 * built on entering the mode, freed on leaving it, and masked in over the
 * page. Until it is ready a plain curtain in the page colour covers the same
 * places, so nothing shows through for even a frame.
 *
 * The viewer calls `reset()` before it clears its scroll container and
 * `attach()` after it has put the new page's slices in; both are stable, so a
 * viewer's load code can call them from any closure.
 */
export function useEarVeil(scrollContainerRef: RefObject<PIXI.Container | null>, background: string): EarVeil {
    const ear = useEarTraining();
    const earActive = !!ear?.active;
    const earVeiled = earActive && ear!.state.phase !== 'complete';

    const layoutRef = useRef<VeilLayout | null>(null);
    const curtainRef = useRef<PIXI.Graphics | null>(null);
    const emptyRef = useRef<PIXI.Container | null>(null);
    const maskRef = useRef<PIXI.Graphics | null>(null);
    const [layoutId, setLayoutId] = useState(0);
    const [built, setBuilt] = useState(0);

    const [api] = useState<EarVeil & { disposeEmpty(): void }>(() => {
        const disposeEmpty = () => {
            const layer = emptyRef.current;
            const mask = maskRef.current;
            emptyRef.current = null;
            maskRef.current = null;
            if (layer && !layer.destroyed) {
                layer.mask = null;
                layer.destroy({ children: true, texture: true, textureSource: true });
            }
            if (mask && !mask.destroyed) mask.destroy();
        };
        return {
            disposeEmpty,
            reset() {
                disposeEmpty();
                const curtain = curtainRef.current;
                curtainRef.current = null;
                if (curtain && !curtain.destroyed) curtain.destroy();
                layoutRef.current = null;
            },
            attach(layout) {
                layoutRef.current = layout;
                const curtain = new PIXI.Graphics();
                curtain.visible = false;
                scrollContainerRef.current?.addChild(curtain);
                curtainRef.current = curtain;
                setLayoutId(n => n + 1);
            },
        };
    });

    // The empty bars exist only while the mode is on.
    useEffect(() => {
        const layout = layoutRef.current;
        if (!earActive || !layout) return;
        let cancelled = false;
        loadSvgImage(emptyBarsSvg(layout.svg)).then(img => {
            const container = scrollContainerRef.current;
            if (cancelled || !container || layoutRef.current !== layout) return;
            const layer = new PIXI.Container();
            for (const sprite of sliceToSprites(img, layout.page, background)) layer.addChild(sprite);
            layer.visible = false;
            const mask = new PIXI.Graphics();
            layer.mask = mask;
            // Straight above the page (and its curtain), under anything drawn
            // over the music since — the loop's repeat signs.
            const curtain = curtainRef.current;
            const at = curtain && curtain.parent === container ? container.getChildIndex(curtain) + 1 : container.children.length;
            container.addChildAt(layer, at);
            container.addChildAt(mask, at + 1);
            emptyRef.current = layer;
            maskRef.current = mask;
            setBuilt(n => n + 1);
        });
        return () => {
            cancelled = true;
            api.disposeEmpty();
        };
    }, [earActive, layoutId, api, scrollContainerRef, background]);

    const melody = ear?.melody;
    const revealed = ear?.state.revealed ?? 0;
    const staff = ear?.staff;
    useEffect(() => {
        const layout = layoutRef.current;
        const curtain = curtainRef.current;
        const empty = emptyRef.current;
        const mask = maskRef.current;
        curtain?.clear();
        if (curtain) curtain.visible = false;
        mask?.clear();
        if (empty) empty.visible = false;
        if (!earVeiled || !layout || !melody) return;
        const { page, noteLeft } = layout;

        // From a little before the first unplayed note, so no sliver of its
        // accidental shows. A note the page cannot place veils everything.
        const frontier = melody[revealed];
        const veilX = frontier
            ? Math.max(0, ((frontier.id !== undefined ? noteLeft.get(frontier.id) : undefined) ?? 6) - 6)
            : undefined;
        // The staff not being trained, the whole way along.
        const band = page.staffMidY === null ? null
            : staff === 1 ? { top: page.staffMidY, bottom: page.height }
                : { top: 0, bottom: page.staffMidY };

        const ready = !!empty && !!mask;
        const paint = (x: number, y: number, w: number, h: number) => {
            if (ready) mask.rect(x, y, w, h).fill(0xffffff);
            else curtain?.rect(x, y, w, h).fill({ color: background });
        };
        if (veilX !== undefined) paint(veilX, page.top, page.width - veilX, page.height);
        if (band) paint(0, page.top + band.top, page.width, band.bottom - band.top);
        if (ready) empty.visible = true;
        else if (curtain) curtain.visible = true;
    }, [earVeiled, melody, revealed, staff, layoutId, built, background]);

    return api;
}

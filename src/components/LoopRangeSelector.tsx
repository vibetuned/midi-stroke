import React, { useMemo, useState } from 'react';
import { useGame } from '../context/game';
import { barBoundaries, barSpanLabel, dragRangeEnd } from '../utils/loopRange';

/**
 * Two handles on the minimap that choose a stretch of the piece, snapping to
 * bar lines: looped in rhythm and practice, the melody to learn by ear. At
 * rest they sit at the ends of the piece, small and quiet; drag either one in
 * and the rest of the minimap darkens. Double-click a handle, or drag both
 * back out, for the whole piece again.
 *
 * Rendered inside a viewer's minimap strip, which it measures to turn a
 * pointer position into a tick. It stops its pointer events from reaching the
 * strip, so grabbing a handle never seeks.
 */
export const LoopRangeSelector: React.FC = () => {
    const { timemap, loopRange, setLoopRange, gameMode } = useGame();
    const boundaries = useMemo(() => (timemap ? barBoundaries(timemap) : []), [timemap]);
    const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
    const total = timemap?.totalTicks ?? 0;
    if (!timemap || boundaries.length < 2 || total <= 0) return null;

    const start = loopRange?.start ?? boundaries[0];
    const end = loopRange?.end ?? boundaries[boundaries.length - 1];
    const pct = (t: number) => Math.max(0, Math.min(100, (t / total) * 100));
    const byEar = gameMode === 'ear';
    const what = byEar ? 'learn by ear' : 'loop';

    const tickAt = (el: HTMLElement, clientX: number) => {
        const strip = el.parentElement!.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - strip.left) / strip.width)) * total;
    };

    const handle = (which: 'start' | 'end') => {
        const at = which === 'start' ? start : end;
        const active = !!loopRange || dragging === which;
        return (
            <div
                key={which}
                role="slider"
                aria-label={which === 'start' ? `First bar to ${what}` : `Last bar to ${what}`}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={at}
                title={loopRange
                    ? `${barSpanLabel(boundaries, loopRange)} — drag to change, double-click for the whole piece`
                    : `Drag to choose the bars to ${what}`}
                onPointerDown={e => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(which);
                }}
                onPointerMove={e => {
                    if (dragging !== which) return;
                    e.stopPropagation();
                    setLoopRange(dragRangeEnd(boundaries, loopRange, which, tickAt(e.currentTarget, e.clientX)));
                }}
                onPointerUp={e => {
                    e.stopPropagation();
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                    setDragging(null);
                }}
                onPointerCancel={() => setDragging(null)}
                onDoubleClick={e => { e.stopPropagation(); setLoopRange(null); }}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: `${pct(at)}%`,
                    // Hangs below the strip once in use, so it is easy to grab.
                    height: active ? '22px' : '14px',
                    width: active ? '10px' : '7px',
                    // Each sits inside the range, its edge on the bar line, so
                    // the one at the very end of the piece stays on screen.
                    marginLeft: which === 'start' ? 0 : active ? '-10px' : '-7px',
                    borderRadius: which === 'start' ? '0 0 4px 0' : '0 0 0 4px',
                    background: active ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.45)',
                    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.5)' : 'none',
                    cursor: 'ew-resize',
                    touchAction: 'none',
                    zIndex: 2,
                }}
            />
        );
    };

    return (
        <>
            {loopRange && (
                <>
                    <div style={{ ...shade, left: 0, width: `${pct(start)}%` }} />
                    <div style={{ ...shade, left: `${pct(end)}%`, right: 0 }} />
                    <div style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%`,
                        background: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
                        borderBottom: '2px solid var(--color-accent)',
                        boxSizing: 'border-box', pointerEvents: 'none',
                    }} />
                </>
            )}
            {handle('start')}
            {handle('end')}
        </>
    );
};

const shade: React.CSSProperties = {
    position: 'absolute', top: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', pointerEvents: 'none',
};

/** "⟲ bars 5–8 ✕": what is looping (by ear, being learned), and a way out.
 *  For the transport. */
export const LoopChip: React.FC = () => {
    const { timemap, loopRange, setLoopRange, gameMode } = useGame();
    const boundaries = useMemo(() => (timemap ? barBoundaries(timemap) : []), [timemap]);
    if (!loopRange || boundaries.length < 2) return null;
    const byEar = gameMode === 'ear';
    return (
        <span
            title={byEar
                ? 'Learning these bars by ear — drag the handles on the minimap to change them'
                : 'Looping these bars — drag the handles on the minimap to change them'}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.3rem 0.4rem 0.3rem 0.75rem', borderRadius: '14px', fontSize: '0.8rem',
                border: '1px solid var(--color-accent)', color: 'var(--color-text-primary, white)',
                background: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', whiteSpace: 'nowrap',
            }}
        >
            ⟲ {barSpanLabel(boundaries, loopRange)}
            <button
                onClick={() => setLoopRange(null)}
                title={byEar ? 'Learn the whole piece' : 'Stop looping: the whole piece'}
                aria-label={byEar ? 'Learn the whole piece' : 'Stop looping'}
                style={{
                    background: 'none', border: 'none', color: 'inherit', cursor: 'pointer',
                    fontSize: '0.85rem', padding: '0 0.25rem', opacity: 0.8,
                }}
            >
                ✕
            </button>
        </span>
    );
};

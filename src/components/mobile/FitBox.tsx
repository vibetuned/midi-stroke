import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * Its child, scaled to fit the space it is given: the virtual instruments are
 * drawn at desktop sizes (a keyboard 1,350 px wide, a drum grid of 40 px
 * cells), and a phone has a screen a third that size. The child keeps its own
 * layout and is scaled as a picture — the same in both directions, up to
 * `maxScale` — and may then be stretched up to `stretchY` times taller, to fill
 * the height (a keyboard's keys can grow longer; a drum grid's cells cannot).
 */
export const FitBox: React.FC<{ children: React.ReactNode; maxScale?: number; stretchY?: number }> = ({ children, maxScale = 1.6, stretchY = 1 }) => {
    const outer = useRef<HTMLDivElement>(null);
    const inner = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState({ x: 1, y: 1, w: 0, h: 0 });

    useLayoutEffect(() => {
        const o = outer.current, i = inner.current;
        if (!o || !i) return;
        const fit = () => {
            const w = i.offsetWidth, h = i.offsetHeight;
            const W = o.clientWidth, H = o.clientHeight;
            if (!w || !h || !W || !H) return;
            const s = Math.min(maxScale, W / w, H / h);
            const k = Math.max(1, Math.min(stretchY, H / (h * s)));
            setScale(prev => (Math.abs(prev.x - s) < 1e-3 && Math.abs(prev.y - s * k) < 1e-3 && prev.w === w && prev.h === h ? prev : { x: s, y: s * k, w, h }));
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(o);
        ro.observe(i);
        return () => ro.disconnect();
    }, [maxScale, stretchY]);

    return (
        <div ref={outer} style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* The scaled box takes the scaled size, so centring works on what is seen. */}
            <div style={{ width: scale.w * scale.x || undefined, height: scale.h * scale.y || undefined, flexShrink: 0, position: 'relative' }}>
                {/* Its own size: the child's widths of "100%" are then its content's, not the screen's. */}
                <div ref={inner} style={{ width: 'max-content', position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `scale(${scale.x}, ${scale.y})` }}>
                    {children}
                </div>
            </div>
        </div>
    );
};

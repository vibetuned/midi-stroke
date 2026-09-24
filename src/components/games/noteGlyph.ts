import type * as PIXI from 'pixi.js';
import type { NoteShape } from '../../games/rhythm';

/**
 * A written note, drawn: an open head for a whole note, open with a stem for
 * a half, filled with a stem for a quarter, flags for eighths and
 * sixteenths, a dot for a dotted value — centred on (cx, cy) as a whole, at
 * `size` (1 ≈ 45 px tall). In one colour: a "black" head is a filled one, on
 * the games' dark skies. The Slingshot's anchors and the Conductor's notes.
 */
export function drawNote(g: PIXI.Graphics, cx: number, cy: number, shape: NoteShape, color: number, alpha: number, size = 1): void {
    const whole = !shape.stem;
    const hw = (whole ? 11 : 9.5) * size, hh = (whole ? 7.6 : 6.8) * size, tilt = whole ? -0.2 : -0.38;
    // The head sits low, the stem rises above it.
    const hx = cx - (shape.stem ? 3 * size : 0), hy = cy + (shape.stem ? 11 * size : 0);
    const pts: number[] = [];
    for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        const x = hw * Math.cos(a), y = hh * Math.sin(a);
        pts.push(hx + x * Math.cos(tilt) - y * Math.sin(tilt), hy + x * Math.sin(tilt) + y * Math.cos(tilt));
    }
    g.poly(pts);
    if (shape.head === 'open') g.stroke({ width: (whole ? 3.4 : 2.6) * size, color, alpha });
    else g.fill({ color, alpha });
    if (shape.stem) {
        const sx = hx + hw * 0.88, sy0 = hy - 2.5 * size, sy1 = hy - 34 * size;
        g.moveTo(sx, sy0).lineTo(sx, sy1).stroke({ width: 2.2 * size, color, alpha });
        for (let f = 0; f < shape.flags; f++) {
            const fy = sy1 + f * 7 * size;
            g.moveTo(sx, fy).bezierCurveTo(sx + 1 * size, fy + 7 * size, sx + 11 * size, fy + 9 * size, sx + 8 * size, fy + 19 * size)
                .stroke({ width: 2.2 * size, color, alpha });
        }
    }
    if (shape.dotted) g.circle(hx + hw + 6 * size, hy - 2 * size, 2.6 * size).fill({ color, alpha });
}

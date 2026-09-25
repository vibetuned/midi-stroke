import type { Grade } from '../../games/judge';
import type { Outcome } from '../../games/echo';

/** Grade colours on the games' dark skies (CSS, and as numbers for Pixi). */
export const GRADE_CSS: Record<Grade, string> = { perfect: '#4ade80', good: '#22d3ee', ok: '#facc15', miss: '#f87171' };
export const GRADE_HEX: Record<Grade, number> = { perfect: 0x4ade80, good: 0x22d3ee, ok: 0xfacc15, miss: 0xf87171 };
/** …and on the white page of the notation. */
export const NOTATION_INK: Record<Grade, string> = { perfect: '#16a34a', good: '#0891b2', ok: '#ca8a04', miss: '#dc2626' };
/** What happened to a bolt in Rhythm echo: intercepted, down on its city, its turret overheated. */
export const OUTCOME_CSS: Record<Outcome, string> = { intercepted: '#4ade80', city: '#fb923c', turret: '#f43f5e' };

/** A voice's colour: low voices deep violet, through teal and green, to gold for the highest (`height` 0–1). */
export function voiceColor(height: number): number {
    const h = (265 - height * 225) / 360, s = 0.72, l = 0.6;
    const f = (n: number) => {
        const k = (n + h * 12) % 12;
        const a = s * Math.min(l, 1 - l);
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return (f(0) << 16) | (f(8) << 8) | f(4);
}

/** Two colours mixed, `t` of the way from a to b. */
export function mix(a: number, b: number, t: number): number {
    const c = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
    return (c(16) << 16) | (c(8) << 8) | c(0);
}

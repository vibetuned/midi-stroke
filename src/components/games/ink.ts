import type { Grade } from '../../games/judge';

/** Grade colours on the games' dark skies (CSS, and as numbers for Pixi). */
export const GRADE_CSS: Record<Grade, string> = { perfect: '#4ade80', good: '#22d3ee', ok: '#facc15', miss: '#f87171' };
export const GRADE_HEX: Record<Grade, number> = { perfect: 0x4ade80, good: 0x22d3ee, ok: 0xfacc15, miss: 0xf87171 };
/** …and on the white page of the notation. */
export const NOTATION_INK: Record<Grade, string> = { perfect: '#16a34a', good: '#0891b2', ok: '#ca8a04', miss: '#dc2626' };

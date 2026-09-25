import React from 'react';
import type { EchoLevel, Outcome } from '../../games/echo';
import { OUTCOME_CSS } from './ink';

/**
 * The defence, along a strip of the level's bars: a mark for every bolt of
 * your voice, where it fell — a green burst for one intercepted, flames on
 * a house for one that reached its city (let go too soon, or never fired),
 * flames on a turret for one that overheated it (held too long).
 */
export const DefenceLog: React.FC<{
    level: EchoLevel;
    outcomes: Array<Outcome | null>;
    height?: number;
    style?: React.CSSProperties;
}> = ({ level, outcomes, height = 40, style }) => {
    const totalBeats = level.bars * level.beatsPerBar;
    return (
        <div style={{ position: 'relative', height, display: 'flex', borderRadius: 8, background: '#05060c', border: '1px solid rgba(255,255,255,0.16)', ...style }}>
            {Array.from({ length: level.bars }, (_, i) => (
                <div key={i} style={{ flex: 1, borderRight: i < level.bars - 1 ? '1px solid rgba(255,255,255,0.1)' : undefined }} />
            ))}
            <div style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 1, background: 'rgba(255,255,255,0.12)' }} />
            {level.answers.map((a, k) => {
                const o = outcomes[k];
                if (!o) return null;
                return (
                    <div key={k} title={TITLE[o]} style={{ position: 'absolute', top: '50%', left: `${(a.start / totalBeats) * 100}%`, transform: 'translate(-50%, -50%)', lineHeight: 0 }}>
                        <Glyph kind={o} size={height / 40} />
                    </div>
                );
            })}
        </div>
    );
};

const TITLE: Record<Outcome, string> = { intercepted: 'Intercepted', city: 'Reached the city: let go too soon', turret: 'Turret overheated: held too long' };

const Flame: React.FC<{ x: number; y: number; s: number; color: string }> = ({ x, y, s, color }) => (
    <path d={`M${x} ${y} C${x - 4 * s} ${y - 3 * s} ${x - 2 * s} ${y - 7 * s} ${x} ${y - 10 * s} C${x + 1 * s} ${y - 6 * s} ${x + 4 * s} ${y - 5 * s} ${x} ${y} Z`} fill={color} />
);

/** The three marks: a burst, a burning house, a burning turret. */
export const Glyph: React.FC<{ kind: Outcome; size?: number }> = ({ kind, size = 1 }) => {
    if (kind === 'intercepted') {
        const rays = Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * Math.PI * 2, r0 = k % 2 ? 3 : 2.5, r1 = k % 2 ? 6 : 8.5;
            return <line key={k} x1={10 + r0 * Math.cos(a)} y1={10 + r0 * Math.sin(a)} x2={10 + r1 * Math.cos(a)} y2={10 + r1 * Math.sin(a)} stroke={OUTCOME_CSS.intercepted} strokeWidth={1.8} strokeLinecap="round" />;
        });
        return (
            <svg width={20 * size} height={20 * size} viewBox="0 0 20 20" aria-hidden>
                {rays}
                <circle cx={10} cy={10} r={2.2} fill="#dcfce7" />
            </svg>
        );
    }
    if (kind === 'city') {
        return (
            <svg width={18 * size} height={22 * size} viewBox="0 0 18 22" aria-hidden>
                <rect x={2} y={12} width={6} height={9} fill="#9a9aa8" />
                <rect x={9} y={9} width={7} height={12} fill="#9a9aa8" />
                <Flame x={6} y={12} s={1} color={OUTCOME_CSS.city} />
                <Flame x={12} y={9} s={0.8} color="#fde047" />
            </svg>
        );
    }
    return (
        <svg width={18 * size} height={22 * size} viewBox="0 0 18 22" aria-hidden>
            <rect x={3} y={16} width={12} height={5} rx={1} fill="#9a9aa8" />
            <path d="M4.5 16 A4.5 4.5 0 0 1 13.5 16 Z" fill="#9a9aa8" />
            <line x1={9} y1={13} x2={14} y2={8} stroke="#9a9aa8" strokeWidth={2} strokeLinecap="round" />
            <Flame x={9} y={13} s={1} color={OUTCOME_CSS.turret} />
        </svg>
    );
};

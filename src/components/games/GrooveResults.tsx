import React from 'react';
import { grooveTip, stepsOf, summarizeGroove, type GrooveLevel, type Take } from '../../games/groove';
import { GRADE_CSS } from './ink';

/**
 * After a Groove Builder run: the groove as you built it, each part a row of
 * the step sequencer — the grid the drums app's pattern builder uses. A step
 * hit where it should be is in the colour of how close it came; one missed
 * is an empty pad outlined red; one hit where no hit belongs is red. How
 * many of each part's steps landed, one tip, and the chart, to open in the
 * drums app.
 */

export const GrooveResults: React.FC<{
    level: GrooveLevel;
    takes: Take[];
    onRetry: () => void;
    onNext: (() => void) | null;
    onBack: () => void;
    onOpenDrums: ((songKey: string) => void) | null;
}> = ({ level, takes, onRetry, onNext, onBack, onOpenDrums }) => {
    const s = summarizeGroove(level, takes);
    const hint = grooveTip(level, s);
    const steps = stepsOf(level);
    const perPulse = Math.round(level.pulse / level.step);
    const pct = (x: number) => `${Math.round(x * 100)}%`;

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.6rem' }}>{level.title}</h2>
                    <span style={{ fontSize: '1.6rem', letterSpacing: '0.15em' }} aria-label={`${s.stars} of 3 stars`}>
                        {'★'.repeat(s.stars)}<span style={{ opacity: 0.25 }}>{'★'.repeat(3 - s.stars)}</span>
                    </span>
                    <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-accent)' }}>{pct(s.accuracy)}</span>
                </div>
                {hint && <p style={{ margin: 0, color: '#d6d6e0', lineHeight: 1.5 }}>💡 {hint}</p>}

                <div style={{ background: '#0b0c14', borderRadius: 12, padding: '0.9rem', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.55rem', overflowX: 'auto' }}>
                    <div style={{ fontSize: '0.75rem', color: '#9a9aa8' }}>
                        The groove as you built it, step by step. Coloured: on its step, by how close. Red outline: a hit missing. Red: a hit on the wrong step.
                    </div>
                    {level.layers.map((l, k) => {
                        const part = s.parts[k];
                        const byCell = new Map(part.correct.map(c => [c.cell, c.grade]));
                        const missed = new Set(part.missed), wrong = new Set(part.wrong);
                        return (
                            <div key={l.voice} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', minWidth: 620 }}>
                                <div style={{ width: 160, flexShrink: 0 }}>
                                    <div style={{ fontWeight: 700 }}>{l.label}</div>
                                    <div style={{ fontSize: '0.78rem', color: '#9a9aa8' }}>
                                        {part.correct.length}/{part.targets.length} on their step
                                        {part.missed.length > 0 && ` · ${part.missed.length} missing`}
                                        {part.wrong.length > 0 && ` · ${part.wrong.length} wrong`}
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps}, 1fr)`, gap: 3, flex: 1 }}>
                                    {Array.from({ length: steps }, (_, st) => {
                                        const beat = st % perPulse === 0;
                                        const g = byCell.get(st);
                                        const base: React.CSSProperties = { height: 26, borderRadius: 5 };
                                        if (g) return <div key={st} style={{ ...base, background: GRADE_CSS[g] }} title="on its step" />;
                                        if (wrong.has(st)) return <div key={st} style={{ ...base, background: '#ef4444', color: '#2a0707', fontSize: 13, fontWeight: 800, textAlign: 'center', lineHeight: '26px' }} title="a hit on the wrong step">✕</div>;
                                        if (missed.has(st)) return <div key={st} style={{ ...base, border: '2px solid #ef4444', background: 'rgba(239,68,68,0.08)' }} title="a hit missing" />;
                                        return <div key={st} style={{ ...base, background: beat ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)' }} />;
                                    })}
                                </div>
                                <div style={{ width: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#d6d6e0' }}>{pct(part.accuracy)}</div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
                    <button onClick={onRetry} style={ghostStyle}>↻ Again</button>
                    {onNext && <button onClick={onNext} style={primaryStyle}>Next →</button>}
                    <button onClick={onBack} style={ghostStyle}>All levels</button>
                    <span style={{ flex: 1 }} />
                    {onOpenDrums && level.songKey && (
                        <button onClick={() => onOpenDrums(level.songKey!)} style={ctaStyle} title="Open this groove in the drums app, to play every part at once">
                            🥁 Play it on the drums →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const primaryStyle: React.CSSProperties = {
    padding: '0.6rem 1.2rem', borderRadius: 10, border: 'none', fontWeight: 700,
    background: 'var(--color-accent)', color: '#06222a', cursor: 'pointer',
};
const ghostStyle: React.CSSProperties = {
    padding: '0.55rem 1rem', borderRadius: 10, cursor: 'pointer',
    background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.25)',
};
const ctaStyle: React.CSSProperties = { ...primaryStyle, background: 'linear-gradient(135deg, #d4a017, #f5c451)', color: '#2a1d00' };

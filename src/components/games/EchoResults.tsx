import React, { useMemo } from 'react';
import { noteGrade, type Grade, type NoteResult } from '../../games/judge';
import { echoTip, outcomeOf, summarizeEcho, type EchoLevel } from '../../games/echo';
import { DefenceLog, Glyph } from './DefenceLog';
import { Notation } from './Notation';
import { NOTATION_INK, OUTCOME_CSS } from './ink';

/**
 * After the defence: the bolts intercepted, the ones that reached a city and
 * the turrets that overheated; one tip; the defence along the bars; the
 * canon as two lanes — the star's voice above, yours below, each note as
 * written with how long you actually fired over it; and the canon written
 * out, your voice coloured note by note.
 */

export const EchoResults: React.FC<{
    level: EchoLevel;
    results: NoteResult[];
    onRetry: () => void;
    onNext: (() => void) | null;
    onBack: () => void;
    onOpenInstrument: ((instrument: 'piano' | 'saxo', songKey: string) => void) | null;
}> = ({ level, results, onRetry, onNext, onBack, onOpenInstrument }) => {
    const s = summarizeEcho(results);
    const hint = echoTip(s);
    const outcomes = useMemo(() => level.answers.map((_, k) => (results[k] ? outcomeOf(results[k]) : null)), [level, results]);
    const colors = useMemo(() => {
        const out = new Map<string, string>();
        level.answers.forEach((a, k) => { if (a.id && results[k]) out.set(a.id, NOTATION_INK[noteGrade(results[k])]); });
        return out;
    }, [level, results]);
    const beat = 60 / level.bpm;
    const totalBeats = level.bars * level.beatsPerBar;

    // Two lanes across the canon: the star's notes above, yours below — each as written, and as sent.
    const W = 900, H = 120, pad = 20;
    const x = (beats: number) => pad + (beats / totalBeats) * (W - 2 * pad);

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.6rem' }}>{level.title}</h2>
                    <span style={{ fontSize: '1.6rem', letterSpacing: '0.15em' }} aria-label={`${s.stars} of 3 stars`}>
                        {'★'.repeat(s.stars)}<span style={{ opacity: 0.25 }}>{'★'.repeat(3 - s.stars)}</span>
                    </span>
                    <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-accent)' }}>{Math.round(s.accuracy * 100)}%</span>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={chip('#166534')}><Glyph kind="intercepted" size={0.8} /> Intercepted · {s.intercepted}</span>
                    <span style={chip('#431407')}><Glyph kind="city" size={0.75} /> Reached a city · {s.city}</span>
                    <span style={chip('#4c0519')}><Glyph kind="turret" size={0.75} /> Turret overheated · {s.turret}</span>
                    {(['perfect', 'good', 'ok', 'miss'] as Grade[]).map(g => (
                        <span key={g} style={chip(NOTATION_INK[g])}>{g === 'ok' ? 'OK' : g[0].toUpperCase() + g.slice(1)} · {s.counts[g]}</span>
                    ))}
                    <span style={chip('#6b7280')}>Best run · {s.maxCombo}</span>
                </div>
                {hint && <p style={{ margin: 0, color: '#d6d6e0', lineHeight: 1.5 }}>💡 {hint}</p>}

                <div style={{ background: '#0b0c14', borderRadius: 12, padding: '0.8rem', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#9a9aa8', marginLeft: '0.3rem' }}>
                        🏙 The defence, bar by bar: a burst for every bolt intercepted, flames on a house for one that reached its city, on a turret for one that overheated it.
                    </div>
                    <DefenceLog level={level} outcomes={outcomes} height={52} />
                    <div style={{ fontSize: '0.75rem', color: '#9a9aa8', margin: '0.3rem 0 0 0.3rem' }}>
                        ✦ The star's voice above, yours below — each note as written, and over it how long you fired.
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="The two voices, and how long you fired">
                        {Array.from({ length: level.bars }, (_, i) => (
                            <line key={i} x1={x(i * level.beatsPerBar)} x2={x(i * level.beatsPerBar)} y1={6} y2={H - 6} stroke="rgba(255,255,255,0.08)" />
                        ))}
                        {level.calls.map((n, i) => (
                            <rect key={`c${i}`} x={x(n.start)} y={16} width={Math.max(2, x(n.start + n.dur) - x(n.start) - 1.5)} height={22} rx={3} fill="rgba(34,211,238,0.5)" />
                        ))}
                        {level.answers.map((a, k) => {
                            const r = results[k];
                            const m = outcomes[k];
                            // What was fired: from the press to the let-go (or to where the game let go for you).
                            const from = r && r.pressError !== null ? a.start + r.pressError / beat : null;
                            const to = r && r.pressError !== null ? a.start + a.dur + (r.releaseError ?? 0.21) / beat : null;
                            return (
                                <g key={`a${k}`}>
                                    <rect x={x(a.start)} y={62} width={Math.max(2, x(a.start + a.dur) - x(a.start) - 1.5)} height={26} rx={3}
                                        fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
                                    {from !== null && to !== null && m && (
                                        <rect x={x(from)} y={69} width={Math.max(2, x(to) - x(from))} height={12} rx={3} fill={OUTCOME_CSS[m]} opacity={0.9} />
                                    )}
                                </g>
                            );
                        })}
                        <text x={2} y={31} fill="#77778a" fontSize="11">✦</text>
                        <text x={2} y={80} fill="#77778a" fontSize="11">🏙</text>
                    </svg>
                </div>

                <Notation
                    mei={level.notation.mei}
                    measureRange={level.notation.measureRange}
                    bars={level.notation.bars}
                    colors={colors}
                    caption={level.songKey ? 'The canon as written: the voice you sang, note by note.' : 'The line of the canon, as written: each note shows how you defended it.'}
                />

                <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
                    <button onClick={onRetry} style={ghostStyle}>↻ Again</button>
                    {onNext && <button onClick={onNext} style={primaryStyle}>Next →</button>}
                    <button onClick={onBack} style={ghostStyle}>All levels</button>
                    <span style={{ flex: 1 }} />
                    {onOpenInstrument && level.songKey && level.instrument && (
                        <button onClick={() => onOpenInstrument(level.instrument!, level.songKey!)} style={ctaStyle}>
                            🎹 Play both voices on the piano →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const chip = (bg: string): React.CSSProperties => ({
    padding: '0.25rem 0.7rem', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, color: 'white', background: bg,
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
});
const primaryStyle: React.CSSProperties = {
    padding: '0.6rem 1.2rem', borderRadius: 10, border: 'none', fontWeight: 700,
    background: 'var(--color-accent)', color: '#06222a', cursor: 'pointer',
};
const ghostStyle: React.CSSProperties = {
    padding: '0.55rem 1rem', borderRadius: 10, cursor: 'pointer',
    background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.25)',
};
const ctaStyle: React.CSSProperties = { ...primaryStyle, background: 'linear-gradient(135deg, #d4a017, #f5c451)', color: '#2a1d00' };

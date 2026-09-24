import React, { useMemo } from 'react';
import { PRESS, grade, type Grade, type NoteResult } from '../../games/judge';
import type { RhythmLevel } from '../../games/rhythm';
import { HOLD, LIFT, choirBeats, conductorTip, noteGradesFromBeats, summarizeConductor } from '../../games/choir';
import { Notation } from './Notation';
import { GRADE_CSS, NOTATION_INK } from './ink';

/**
 * After conducting: every beat's length as you conducted it, against one
 * beat of the piece — longer above the line (the song stretched), shorter
 * below (it hurried), a mark under the beats let go early (a singer cut
 * off) — how much longer or shorter the song came out, one tip, and the tune
 * written out, each note in the colour of the beats it sounds in.
 */

const RANGE = 0.3;   // ± seconds shown

export const ConductorResults: React.FC<{
    level: RhythmLevel;
    results: NoteResult[];
    /** Seconds a beat, as played (Relaxed scales it). */
    beatSec: number;
    onRetry: () => void;
    onNext: (() => void) | null;
    onBack: () => void;
    onOpenInstrument: ((instrument: 'piano' | 'saxo', songKey: string) => void) | null;
}> = ({ level, results, beatSec, onRetry, onNext, onBack, onOpenInstrument }) => {
    const s = summarizeConductor(results);
    const hint = conductorTip(s);
    const beats = useMemo(() => choirBeats(level), [level]);
    const colors = useMemo(() => {
        const out = new Map<string, string>();
        noteGradesFromBeats(level, beats, results).forEach((g, i) => { const id = level.notes[i].id; if (id && g) out.set(id, NOTATION_INK[g]); });
        return out;
    }, [level, beats, results]);
    const written = beats.reduce((a, b) => a + b.length, 0) * beatSec;
    const stretchPct = Math.round((s.stretch / written) * 100);

    const W = 900, H = 200, pad = 26;
    const n = Math.max(1, beats.length);
    const bw = (W - 2 * pad) / n;
    const x = (k: number) => pad + k * bw;
    const y = (e: number) => H / 2 - (Math.max(-RANGE, Math.min(RANGE, e)) / RANGE) * (H / 2 - 20);

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
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {(['perfect', 'good', 'ok', 'miss'] as Grade[]).map(g => (
                        <span key={g} style={chip(NOTATION_INK[g])}>{g === 'ok' ? 'OK' : g[0].toUpperCase() + g.slice(1)} · {s.counts[g]} beats</span>
                    ))}
                    <span style={chip('#6b7280')}>Best run · {s.maxCombo}</span>
                    <span style={chip('#3f3f46')}>
                        {Math.abs(stretchPct) < 2 ? '⏱ The song ran on time' : stretchPct > 0 ? `⏱ The song ran ${stretchPct} % long` : `⏱ The song ran ${-stretchPct} % short`}
                    </span>
                </div>
                {hint && <p style={{ margin: 0, color: '#d6d6e0', lineHeight: 1.5 }}>💡 {hint}</p>}

                <div style={{ background: '#0b0c14', borderRadius: 12, padding: '0.8rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.75rem', color: '#9a9aa8', margin: '0 0 0.4rem 0.3rem' }}>
                        Every beat as you conducted it, press to next press, against one beat of the piece: above the line longer (the
                        song stretched), below shorter (it hurried). A grey mark under a beat: let go early, the singer cut off.
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="How long every beat was held">
                        <rect x={pad} y={y(0.07)} width={W - 2 * pad} height={y(-0.07) - y(0.07)} fill="rgba(74,222,128,0.08)" />
                        {beats.map((b, k) => b.start % level.beatsPerBar === 0 && (
                            <line key={`b${k}`} x1={x(k)} x2={x(k)} y1={8} y2={H - 8} stroke="rgba(255,255,255,0.1)" />
                        ))}
                        <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.35)" />
                        <text x={4} y={20} fill="#77778a" fontSize="11">long</text>
                        <text x={4} y={H - 8} fill="#77778a" fontSize="11">short</text>
                        {results.map((r, k) => {
                            if (!r) return null;
                            // A beat's length is settled by the next press; the last one, by its let-go.
                            const next = results[k + 1];
                            // (The last one's let-go is allowed its lift, as the judging allows it.)
                            const e = next ? next.pressError : r.releaseError === null ? null : r.releaseError + LIFT;
                            // Coloured by how far off its length was, as its height shows.
                            const g = e === null ? 'miss' : grade(e, next ? PRESS : HOLD);
                            const cut = r.releaseError !== null && r.releaseError + LIFT < -HOLD.perfect;
                            return (
                                <g key={k}>
                                    {e !== null && <rect x={x(k) + bw * 0.2} width={bw * 0.6} y={Math.min(y(e), H / 2)} height={Math.max(2, Math.abs(y(e) - H / 2))} rx={2} fill={GRADE_CSS[g]} />}
                                    {cut && <rect x={x(k) + bw * 0.3} width={bw * 0.4} y={H - 12} height={6} rx={2} fill="#9a9aa8" />}
                                </g>
                            );
                        })}
                    </svg>
                </div>

                <Notation
                    mei={level.source.mei}
                    measureRange={level.source.kind === 'song' ? level.source.measureRange : undefined}
                    bars={Math.round(level.length / level.beatsPerBar)}
                    colors={colors}
                    caption="The tune you conducted, as written. Each note is coloured by the beats it sounds in."
                />

                <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
                    <button onClick={onRetry} style={ghostStyle}>↻ Again</button>
                    {onNext && <button onClick={onNext} style={primaryStyle}>Next →</button>}
                    <button onClick={onBack} style={ghostStyle}>All levels</button>
                    <span style={{ flex: 1 }} />
                    {onOpenInstrument && level.source.kind === 'song' && (
                        <button
                            onClick={() => level.source.kind === 'song' && onOpenInstrument(level.source.instrument, level.source.songKey)}
                            style={ctaStyle}
                        >
                            {level.source.instrument === 'saxo' ? '🎷 Play it on the saxophone →' : '🎹 Play it on the piano →'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const chip = (bg: string): React.CSSProperties => ({ padding: '0.25rem 0.7rem', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, color: 'white', background: bg });
const primaryStyle: React.CSSProperties = {
    padding: '0.6rem 1.2rem', borderRadius: 10, border: 'none', fontWeight: 700,
    background: 'var(--color-accent)', color: '#06222a', cursor: 'pointer',
};
const ghostStyle: React.CSSProperties = {
    padding: '0.55rem 1rem', borderRadius: 10, cursor: 'pointer',
    background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.25)',
};
const ctaStyle: React.CSSProperties = { ...primaryStyle, background: 'linear-gradient(135deg, #d4a017, #f5c451)', color: '#2a1d00' };

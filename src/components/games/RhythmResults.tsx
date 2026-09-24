import React, { useMemo } from 'react';
import { noteGrade, summarize, tip, type Grade, type NoteResult } from '../../games/judge';
import type { RhythmLevel } from '../../games/rhythm';
import { Notation } from './Notation';
import { NOTATION_INK } from './ink';

/**
 * After a run: how it went, one tip, and the level written out — every note
 * coloured by how it was played. The notation is the point: what was just
 * felt, shown as it is read, so the games lead into the real thing.
 */

const INK: Record<Grade, string> = NOTATION_INK;

export const RhythmResults: React.FC<{
    level: RhythmLevel;
    results: NoteResult[];
    onRetry: () => void;
    onNext: (() => void) | null;
    onBack: () => void;
    /** "Play it on the saxophone" — into the instrument app, the piece loaded. */
    onOpenInstrument: ((instrument: 'piano' | 'saxo', songKey: string) => void) | null;
}> = ({ level, results, onRetry, onNext, onBack, onOpenInstrument }) => {
    const s = summarize(results);
    const hint = tip(s);
    // Each played note in its grade's colour.
    const colors = useMemo(() => {
        const out = new Map<string, string>();
        level.notes.forEach((n, i) => { if (n.id && results[i]) out.set(n.id, INK[noteGrade(results[i])]); });
        return out;
    }, [level, results]);

    const pct = Math.round(s.accuracy * 100);
    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.6rem' }}>{level.title}</h2>
                    <span style={{ fontSize: '1.6rem', letterSpacing: '0.15em' }} aria-label={`${s.stars} of 3 stars`}>
                        {'★'.repeat(s.stars)}<span style={{ opacity: 0.25 }}>{'★'.repeat(3 - s.stars)}</span>
                    </span>
                    <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-accent)' }}>{pct}%</span>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {(['perfect', 'good', 'ok', 'miss'] as Grade[]).map(g => (
                        <span key={g} style={chip(INK[g])}>{g === 'ok' ? 'OK' : g[0].toUpperCase() + g.slice(1)} · {s.counts[g]}</span>
                    ))}
                    <span style={chip('#6b7280')}>Best run · {s.maxCombo}</span>
                </div>
                {hint && <p style={{ margin: 0, color: '#d6d6e0', lineHeight: 1.5 }}>💡 {hint}</p>}

                <Notation
                    mei={level.source.mei}
                    measureRange={level.source.kind === 'song' ? level.source.measureRange : undefined}
                    bars={Math.round(level.length / level.beatsPerBar)}
                    colors={colors}
                    caption={`This is what you just played${level.source.kind === 'song' ? ' — the melody, as written' : ''}. Each note shows how you did.`}
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
                            title="Open this piece in the instrument app, to learn the notes as well as the rhythm"
                        >
                            {level.source.instrument === 'saxo' ? '🎷 Play it on the saxophone →' : '🎹 Play it on the piano →'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const chip = (color: string): React.CSSProperties => ({
    padding: '0.25rem 0.7rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600,
    color: 'white', background: color,
});
const primaryStyle: React.CSSProperties = {
    padding: '0.6rem 1.2rem', borderRadius: 10, border: 'none', fontWeight: 700,
    background: 'var(--color-accent)', color: '#06222a', cursor: 'pointer',
};
const ghostStyle: React.CSSProperties = {
    padding: '0.55rem 1rem', borderRadius: 10, cursor: 'pointer',
    background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.25)',
};
const ctaStyle: React.CSSProperties = {
    ...primaryStyle, background: 'linear-gradient(135deg, #d4a017, #f5c451)', color: '#2a1d00',
};

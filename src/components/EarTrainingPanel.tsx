import React, { useEffect, useMemo } from 'react';
import { useEarTraining } from '../context/earTraining';
import { useGame } from '../context/GameContext';
import { barBoundaries, barSpanLabel } from '../utils/loopRange';
import { pitchAccuracy, type EarStats } from '../utils/earTraining';

/**
 * Learn by ear's controls: the bar above the transport that runs a session and
 * holds its settings, the assessment that comes up at a wrong note, and the
 * summary when the whole melody has been played back.
 */
export const EarTrainingPanel: React.FC = () => {
    const ear = useEarTraining();
    if (!ear?.active) return null;
    const { state, melody, staff, staves, rhythm, exactOctave } = ear;
    const inSession = state.phase !== 'idle' && state.phase !== 'complete';
    const hasMelody = melody.length > 0;

    return (
        <>
            <div style={barStyle}>
                <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                    <Status />
                    {state.phase === 'idle' && (
                        <button onClick={ear.start} disabled={!hasMelody} style={primaryStyle(!hasMelody)}>
                            ▶ Start
                        </button>
                    )}
                    {inSession && (
                        <button onClick={ear.restart} title="Back to the first note, everything veiled again" style={ghostStyle}>
                            ⟲ Restart
                        </button>
                    )}
                    {state.phase === 'complete' && (
                        <button onClick={ear.start} style={primaryStyle(false)}>
                            ▶ Train again
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {/* A single staff (the saxo) has nothing to choose. */}
                    {staves.length > 1 && (
                        <Toggle
                            label="Staff"
                            value={staff}
                            options={[
                                { value: 1, label: 'Treble', disabled: !staves.includes(1) },
                                { value: 2, label: 'Bass', disabled: !staves.includes(2) },
                            ]}
                            onChange={ear.setStaff}
                            title="Which staff to learn — changing it starts a new session"
                        />
                    )}
                    <Toggle
                        label="Rhythm"
                        value={rhythm}
                        options={[{ value: 'written', label: 'As written' }, { value: 'even', label: 'Even pulses' }]}
                        onChange={ear.setRhythm}
                        title="Hear the phrase in its own rhythm, or one note per beat so only the pitches are left to listen for"
                    />
                    <Toggle
                        label="Octave"
                        value={exactOctave}
                        options={[{ value: true, label: 'Exact' }, { value: false, label: 'Any' }]}
                        onChange={ear.setExactOctave}
                        title="Exact: the note in the register written. Any: any octave of the right note"
                    />
                </div>
            </div>
            {state.phase === 'error' && <Assessment kind="error" />}
            {state.phase === 'complete' && <CompleteSummary />}
        </>
    );
};

/** "bars 5–8", when a passage is chosen on the minimap; null for the whole piece. */
function usePassage(): string | null {
    const { timemap, loopRange } = useGame();
    return useMemo(
        () => (timemap && loopRange ? barSpanLabel(barBoundaries(timemap), loopRange) : null),
        [timemap, loopRange],
    );
}

/** What is happening now, in a few words. */
const Status: React.FC = () => {
    const ear = useEarTraining()!;
    const passage = usePassage();
    const { state, melody, staves } = ear;
    const n = melody.length;
    if (n === 0) {
        return passage
            ? <StatusText title={`Nothing to learn in ${passage}`} detail="Widen the bars on the minimap, or pick the other staff." />
            : <StatusText title="Nothing to learn on this staff" detail={staves.length > 1 ? 'Pick the other staff, or another piece.' : 'Pick another piece.'} />;
    }
    switch (state.phase) {
        case 'idle':
            return (
                <StatusText
                    title={passage ? `Learn ${passage} by ear` : 'Learn by ear'}
                    detail={`Hear a phrase, play it back from memory — one more note each time. ${n} notes${passage ? '' : ' · drag the handles on the minimap to learn a passage'}.`}
                />
            );
        case 'call':
            return <StatusText title="🎧 Listen…" detail={`${state.k === 1 ? 'The first note' : `Notes 1–${state.k}`} · round ${state.k} of ${n}`} pulse />;
        case 'response':
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <span style={statusTitle}>Your turn</span>
                    <Pips done={state.i} total={state.k} />
                </div>
            );
        case 'breath':
            return <StatusText title="✓ Got it" detail={`One more note — round ${state.k} of ${n}`} />;
        case 'error':
            return <StatusText title="Stopped" detail={`At note ${state.stumbleAt} of ${state.k}`} />;
        case 'complete':
            return <StatusText title={passage ? `🎉 ${passage}, by ear` : '🎉 The whole melody, by ear'} detail={`All ${n} notes`} />;
    }
};

const StatusText: React.FC<{ title: string; detail: string; pulse?: boolean }> = ({ title, detail, pulse }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
        <span style={{ ...statusTitle, animation: pulse ? 'earPulse 1.2s ease-in-out infinite' : undefined }}>{title}</span>
        <span style={{ fontSize: '0.78rem', color: '#9a9aa8' }}>{detail}</span>
        <style>{'@keyframes earPulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }'}</style>
    </div>
);

/** One pip per note of the phrase; played ones filled. */
const Pips: React.FC<{ done: number; total: number }> = ({ done, total }) => (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '360px' }} aria-label={`${done} of ${total} played`}>
        {Array.from({ length: total }, (_, j) => (
            <span key={j} style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: j < done ? 'var(--color-accent)' : 'transparent',
                border: '1.5px solid var(--color-accent)',
                opacity: j === done ? 1 : j < done ? 0.9 : 0.4,
            }} />
        ))}
    </div>
);

function Toggle<T extends string | number | boolean>({ label, value, options, onChange, title }: {
    label: string;
    value: T;
    options: Array<{ value: T; label: string; disabled?: boolean }>;
    onChange: (v: T) => void;
    title: string;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }} title={title}>
            <span style={{ fontSize: '0.68rem', color: '#9a9aa8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', padding: '3px' }}>
                {options.map(o => {
                    const on = o.value === value;
                    return (
                        <button
                            key={String(o.value)}
                            onClick={() => !o.disabled && onChange(o.value)}
                            disabled={o.disabled}
                            style={{
                                background: on ? 'var(--color-accent)' : 'transparent',
                                color: on ? 'white' : 'var(--color-text-secondary, #cfcfd8)',
                                border: 'none', borderRadius: '13px', padding: '0.3rem 0.7rem',
                                fontSize: '0.78rem', cursor: o.disabled ? 'default' : 'pointer',
                                opacity: o.disabled ? 0.35 : 1,
                            }}
                        >
                            {o.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ------------------------------------------------------------- the modals

/** The three figures the specification's formative assessment shows. */
const Figures: React.FC<{ stats: EarStats }> = ({ stats }) => {
    const accuracy = Math.round(pitchAccuracy(stats) * 100);
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.7rem' }}>
            <Figure value={`${accuracy}%`} label="Pitch accuracy" detail={`${stats.correct} of ${stats.attempts} keys right`} />
            <Figure value={String(stats.depth)} label="Audiation depth"
                detail={stats.depth === 0 ? 'No phrase played back yet' : `Retained ${stats.depth} note${stats.depth > 1 ? 's' : ''} by ear`} />
            <Figure value={String(stats.bestStreak)} label="Longest streak" detail="Correct notes in a row" />
        </div>
    );
};

const Figure: React.FC<{ value: string; label: string; detail: string }> = ({ value, label, detail }) => (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.8rem' }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-accent)' }}>{value}</div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.1rem' }}>{label}</div>
        <div style={{ fontSize: '0.72rem', color: '#9a9aa8', marginTop: '0.2rem' }}>{detail}</div>
    </div>
);

/** A wrong note: what happened, how it is going, and the two ways on. */
const Assessment: React.FC<{ kind: 'error' }> = () => {
    const ear = useEarTraining()!;
    const { state } = ear;
    // Enter retries: the path that keeps the progress.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); ear.retry(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ear]);
    return (
        <Modal>
            <h2 style={modalTitle}>Not quite</h2>
            <p style={modalLead}>
                Note {state.stumbleAt} of this {state.k}-note phrase wasn&apos;t the one you heard.
                {' '}The response stopped there, so the wrong interval doesn&apos;t settle in.
            </p>
            <Figures stats={state.stats} />
            <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                <Path
                    primary
                    title="Retry from here"
                    detail={`Hear these ${state.k} notes again and play them back. What you have learned stays visible.`}
                    onClick={ear.retry}
                />
                <Path
                    title="Restart from beginning"
                    detail="Back to the first note, with the whole score veiled again."
                    onClick={ear.restart}
                />
            </div>
        </Modal>
    );
};

const CompleteSummary: React.FC = () => {
    const ear = useEarTraining()!;
    const passage = usePassage();
    const [open, setOpen] = React.useState(true);
    if (!open) return null;
    return (
        <Modal onClose={() => setOpen(false)}>
            <h2 style={modalTitle}>{passage ? `🎉 ${passage[0].toUpperCase()}${passage.slice(1)}, by ear` : '🎉 The whole melody, by ear'}</h2>
            <p style={modalLead}>All {ear.melody.length} notes in one go. The score is unveiled.</p>
            <Figures stats={ear.state.stats} />
            <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                <Path primary title="Train again" detail="A new session from the first note." onClick={ear.start} />
                <Path title="Look at the score" detail="Close this and read what you learned." onClick={() => setOpen(false)} />
            </div>
        </Modal>
    );
};

const Modal: React.FC<{ children: React.ReactNode; onClose?: () => void }> = ({ children, onClose }) => (
    <div
        style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 220,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}
        onClick={onClose}
    >
        <div
            role="dialog"
            style={{
                background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
                padding: '1.5rem', width: '100%', maxWidth: '560px', color: 'white',
                display: 'flex', flexDirection: 'column', gap: '0.9rem',
            }}
            onClick={e => e.stopPropagation()}
        >
            {children}
        </div>
    </div>
);

const Path: React.FC<{ title: string; detail: string; onClick: () => void; primary?: boolean }> = ({ title, detail, onClick, primary }) => (
    <button
        onClick={onClick}
        style={{
            flex: '1 1 220px', textAlign: 'left', cursor: 'pointer',
            padding: '0.8rem 1rem', borderRadius: '10px',
            background: primary ? 'var(--color-accent)' : 'transparent',
            border: `1px solid ${primary ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`,
            color: 'white', display: 'flex', flexDirection: 'column', gap: '0.25rem',
        }}
    >
        <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{title}</span>
        <span style={{ fontSize: '0.75rem', opacity: 0.85, lineHeight: 1.35 }}>{detail}</span>
    </button>
);

// ----------------------------------------------------------------- styles

const barStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap',
    padding: '0.7rem 1.2rem', background: '#16161c',
    borderTop: '1px solid rgba(255,255,255,0.08)',
};
const statusTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: 700 };
const primaryStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '0.55rem 1.2rem', borderRadius: '10px', border: 'none', fontWeight: 600,
    background: 'var(--color-accent)', color: 'white',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
});
const ghostStyle: React.CSSProperties = {
    padding: '0.45rem 0.9rem', borderRadius: '10px', cursor: 'pointer',
    background: 'transparent', color: 'var(--color-text-secondary, #cfcfd8)',
    border: '1px solid rgba(255,255,255,0.2)',
};
const modalTitle: React.CSSProperties = { margin: 0, fontSize: '1.25rem' };
const modalLead: React.CSSProperties = { margin: 0, fontSize: '0.88rem', color: '#b0b0bc', lineHeight: 1.45 };

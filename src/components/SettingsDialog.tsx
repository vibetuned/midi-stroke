import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TEMPO_MAX, TEMPO_MIN, useGame } from '../context/game';
import { useMobileLayout } from '../hooks/useMobileLayout';
import type { TempoMap } from '../utils/tempo';
import { cardIconStyle, cardStyle, cardTitleStyle, closeStyle } from './dialogStyles';

/**
 * The ⚙ settings: what is set once rather than played with — the sound, the
 * tempo, how play starts and what scrolling does, the visual metronome. They
 * left the controls bar to make room, and are remembered on the device (the
 * tempo is the song's own: GameContext). The bar keeps what is used while
 * playing: the mode, the hands, reset and play, the loop. Cards as in the 🎧
 * playback panel (dialogStyles.ts): what each does is in its title, on hover.
 */
export const SettingsButton: React.FC = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title="Settings: sound, tempo, count-in, scrolling, visual metronome"
                aria-label="Settings"
                style={{
                    width: '40px', height: '40px', borderRadius: '50%', padding: 0, marginLeft: '0.5rem',
                    border: '1px solid var(--color-text-secondary)', background: 'transparent',
                    color: 'var(--color-text-primary)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                }}
                className="hover-scale"
            >
                {/* A drawn gear, centred exactly. */}
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3.2" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                </svg>
            </button>
            {/* On the body: on a phone the bar sits in a sliding drawer, whose
                transform would hold a fixed dialog inside it (mobile/MobileShell.css). */}
            {open && createPortal(<SettingsDialog onClose={() => setOpen(false)} />, document.body)}
        </>
    );
};

const INSTRUMENT_ICON: Record<string, string> = { piano: '🎹', drums: '🥁', saxo: '🎷' };

const SettingsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const {
        isMetronomeMuted, setMetronomeMuted, visualMetronome, setVisualMetronome,
        countIn, setCountIn, midiStartAnywhere, setMidiStartAnywhere, pauseOnScroll, setPauseOnScroll,
        tempo, setTempo, scoreTempo, tempoLock, instrument,
    } = useGame();
    const key = instrument === 'drums' ? 'pad' : instrument === 'saxo' ? 'note' : 'key';
    // A phone in landscape is wide and short: the cards side by side.
    const phone = useMobileLayout();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const sound = (
        <Toggle
            icon={isMetronomeMuted ? '🔇' : '🔊'}
            label="Sound"
            detail="The metronome's click and your instrument's sound. Off: silent."
            on={!isMetronomeMuted}
            onChange={on => setMetronomeMuted(!on)}
        />
    );
    const tempoCard = <TempoCard tempo={tempo} setTempo={setTempo} scoreTempo={scoreTempo} locked={tempoLock !== null} />;
    const count = (
        <Toggle
            icon="🔢"
            label="Count in before play"
            detail="A bar counted before the music: 4, 3, 2, Start. Off: play starts at once."
            on={countIn}
            onChange={setCountIn}
        />
    );
    const midStart = (
        <Toggle
            icon={INSTRUMENT_ICON[instrument] ?? '🎹'}
            label="Start mid-song from the instrument"
            detail={`Any ${key} played starts a song paused part-way through, as well as at its start. Off: only at the start, so you can try a ${key} while paused.`}
            on={midiStartAnywhere}
            onChange={setMidiStartAnywhere}
        />
    );
    const scroll = (
        <Toggle
            icon="⏸️"
            label="Pause while scrolling"
            detail="Dragging the score, or the bar strip above it, stops the music. Off: it plays on from where you let go."
            on={pauseOnScroll}
            onChange={setPauseOnScroll}
        />
    );
    const wave = (
        <Toggle
            icon={(
                // The wave the old ∿ button drew, centred exactly.
                <svg width="24" height="15" viewBox="0 0 22 14" aria-hidden="true" style={{ color: 'var(--color-accent)' }}>
                    <path d="M1 7 C 4 -1, 7 -1, 11 7 S 18 15, 21 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
            )}
            label="Visual metronome"
            detail="An arrow on the cursor swinging with the beat, its wave over the clef, and a dot for each key you press."
            on={visualMetronome}
            onChange={setVisualMetronome}
        />
    );

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: phone ? '0.6rem' : '1rem',
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-label="Settings"
                style={{
                    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', boxSizing: 'border-box',
                    padding: phone ? '0.9rem 1.2rem' : '1.5rem', width: '100%', maxWidth: phone ? '860px' : '520px',
                    maxHeight: '100%', overflowY: 'auto',
                    color: 'white', display: 'flex', flexDirection: 'column', gap: phone ? '0.8rem' : '1rem',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }} title="Set once, remembered on this device.">Settings</h2>
                    <button onClick={onClose} title="Close (Esc)" style={closeStyle}>✕</button>
                </div>

                {phone
                    ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                            <div style={columnStyle}>{sound}{tempoCard}{wave}</div>
                            <div style={columnStyle}>{count}{midStart}{scroll}</div>
                        </div>
                    )
                    : <div style={columnStyle}>{sound}{tempoCard}{count}{midStart}{scroll}{wave}</div>}
            </div>
        </div>
    );
};

const columnStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 };

/** A setting that is on or off: a card with its icon, its name and a switch; what it does on hover. */
const Toggle: React.FC<{ icon: React.ReactNode; label: string; detail: string; on: boolean; onChange: (on: boolean) => void }> = ({ icon, label, detail, on, onChange }) => (
    <label title={detail} style={{ ...cardStyle(on), cursor: 'pointer' }}>
        <span style={cardIconStyle} aria-hidden="true">{icon}</span>
        <span style={{ ...cardTitleStyle, flex: 1, minWidth: 0 }}>{label}</span>
        <input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
        <span aria-hidden="true" style={{
            flexShrink: 0, width: '40px', height: '22px', borderRadius: '11px', position: 'relative',
            background: on ? 'var(--color-accent)' : '#3a3a44', transition: 'background 0.2s',
        }}>
            <span style={{
                position: 'absolute', top: '3px', left: on ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
            }} />
        </span>
    </label>
);

/**
 * The tempo: quarter notes a minute on a slider. What the score says about it
 * is in the title; when the slider has moved off the score's marking, a button
 * goes back to it.
 */
const TempoCard: React.FC<{ tempo: number; setTempo: (bpm: number) => void; scoreTempo: TempoMap | null; locked: boolean }> = ({ tempo, setTempo, scoreTempo, locked }) => {
    const initial = locked ? undefined : scoreTempo?.initial;
    const marked = initial ? Math.round(initial.bpm) : null;
    return (
        <div title={tempoTitle(tempo, scoreTempo, locked)} style={cardStyle(false)}>
            <span style={cardIconStyle} aria-hidden="true">⏱️</span>
            <span style={{ ...cardTitleStyle, whiteSpace: 'nowrap' }}>
                {locked && <span aria-label="set by the accompaniment">🎶 </span>}♩ = {Math.round(tempo * 10) / 10}
            </span>
            <input
                type="range"
                min={TEMPO_MIN}
                max={TEMPO_MAX}
                step="1"
                value={tempo}
                disabled={locked}
                onChange={e => setTempo(Number(e.target.value))}
                aria-label="Tempo"
                style={{ flex: 1, minWidth: 0, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.45 : 1, accentColor: 'var(--color-accent)' }}
            />
            {initial && marked !== null && tempo !== marked && (
                <button
                    onClick={() => setTempo(initial.bpm)}
                    title={`Back to the score's tempo, ♩ = ${marked}`}
                    style={{
                        fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '8px', cursor: 'pointer', flexShrink: 0,
                        background: 'transparent', color: 'var(--color-accent)', border: '1px solid var(--color-accent)',
                    }}
                >
                    use {marked}
                </button>
            )}
        </div>
    );
};

/** What the tempo card says on hover: the slider, and the score's own marking. */
function tempoTitle(tempo: number, scoreTempo: TempoMap | null, locked: boolean): string {
    if (locked) {
        return 'The accompaniment was synced at this tempo, so the piece plays at it. Change it in the accompaniment\'s sync view (🎧 → Accompaniment).';
    }
    let text = 'Tempo, in quarter notes per minute; ↑ and ↓ change it as you play.';
    const initial = scoreTempo?.initial;
    if (!initial) return text;
    const marked = Math.round(initial.bpm);
    const changes = scoreTempo.marks.length - 1;
    const name = initial.text && !/\d/.test(initial.text) ? `${initial.text}, ` : '';
    text += ` The score marks ${name}♩ = ${marked} (from @${initial.source === 'text' ? 'its tempo text' : initial.source})`;
    if (changes) text += `, and changes tempo ${changes} time${changes > 1 ? 's' : ''} — each change keeps its proportion to the slider`;
    if (tempo !== marked) text += `; this is ${Math.round((tempo / initial.bpm) * 100)}% of it`;
    return text + '.';
}

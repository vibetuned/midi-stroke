import React, { useCallback, useEffect, useState } from 'react';
import { useGame } from '../context/game';
import { listMidiOutputs } from '../utils/midiOut';
import { AccompanimentPanel } from './AccompanimentPanel';
import { useAccompanimentFor } from '../hooks/useAccompaniment';
import { formatTime } from '../utils/accompanimentSync';

/**
 * Where the score's own playback goes, as a header button beside the stats and
 * a panel with the three choices spelled out — off, in sound, or to a MIDI
 * output — rather than a select squeezed into the transport. The exercise
 * builders keep their compact selector; both read and write the same
 * remembered setting.
 */

const VOICE_OF: Record<string, string> = {
    piano: 'the piano samples',
    saxo: 'the saxophone reed tone',
    drums: 'the drum kit',
};

/** The header button: 🎧, lit when the score is being played somewhere. */
export const PlaybackButton: React.FC = () => {
    const { playbackTarget } = useGame();
    const [open, setOpen] = useState(false);
    // The accompaniment's sync view opens from the panel, in its place.
    const [accompanimentOpen, setAccompanimentOpen] = useState(false);
    const active = playbackTarget !== 'off';
    const state = playbackTarget === 'off' ? 'off'
        : playbackTarget === 'audio' ? 'in sound'
            : `MIDI → ${playbackTarget}`;
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title={`Score playback: ${state}`}
                aria-label={`Score playback: ${state}`}
                style={{
                    width: '32px',
                    height: '32px',
                    padding: '4px',
                    background: active ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)' : 'transparent',
                    border: `1px solid ${active ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    lineHeight: 1,
                }}
            >
                🎧
            </button>
            {open && (
                <PlaybackPanel
                    onClose={() => setOpen(false)}
                    onOpenAccompaniment={() => { setOpen(false); setAccompanimentOpen(true); }}
                />
            )}
            {accompanimentOpen && <AccompanimentPanel onClose={() => setAccompanimentOpen(false)} />}
        </>
    );
};

/** The choices themselves. Picking one applies it at once; there is no Save. */
export const PlaybackPanel: React.FC<{ onClose: () => void; onOpenAccompaniment?: () => void }> = ({ onClose, onOpenAccompaniment }) => {
    const { playbackTarget, setPlaybackTarget, instrument, selectedSong } = useGame();
    const accompaniment = useAccompanimentFor(selectedSong);
    const [ports, setPorts] = useState<string[] | null>(null);

    // Asking for the port list is what raises the Web MIDI permission prompt in
    // a browser, so it happens here, when the user has come looking for it.
    const load = useCallback(() => {
        listMidiOutputs().then(setPorts).catch(() => setPorts([]));
    }, []);
    useEffect(() => { load(); }, [load]);
    /** The "look again" links: show the searching state, then search. */
    const refresh = () => { setPorts(null); load(); };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const isMidi = playbackTarget !== 'off' && playbackTarget !== 'audio';
    // A remembered port that is not plugged in right now still shows, so it is
    // clear why nothing is sounding.
    const shownPorts = ports === null ? [] : (isMidi && !ports.includes(playbackTarget)
        ? [...ports, playbackTarget]
        : ports);
    const missing = (p: string) => ports !== null && !ports.includes(p);

    const chooseMidi = () => {
        if (isMidi) return;
        const first = ports?.[0];
        if (first) setPlaybackTarget(first);
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-label="Score playback"
                style={{
                    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
                    padding: '1.5rem', width: '100%', maxWidth: '520px', color: 'white',
                    display: 'flex', flexDirection: 'column', gap: '1rem',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Score playback</h2>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#9a9aa8' }}>
                            Whether the score plays along as it scrolls, and where it goes.
                        </p>
                    </div>
                    <button onClick={onClose} title="Close (Esc)" style={closeStyle}>✕</button>
                </div>

                <div role="radiogroup" aria-label="Playback" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <Choice
                        icon="🔇"
                        title="Off"
                        detail="The score stays silent. You hear only what you play."
                        selected={playbackTarget === 'off'}
                        onSelect={() => setPlaybackTarget('off')}
                    />
                    <Choice
                        icon="🔈"
                        title="Play in sound"
                        detail={`The score plays as it scrolls, on ${VOICE_OF[instrument] ?? 'this app’s instrument'}. It follows the tempo slider and waits with you in practice mode.`}
                        selected={playbackTarget === 'audio'}
                        onSelect={() => setPlaybackTarget('audio')}
                    />
                    <Choice
                        icon="🎹"
                        title="Send to MIDI"
                        detail={'Your synth, module or DAW plays the score, and nothing sounds here.'
                            + (instrument === 'drums' ? ' Drums go out as General MIDI pads on channel 10.' : '')}
                        selected={isMidi}
                        disabled={!isMidi && (ports === null || ports.length === 0)}
                        onSelect={chooseMidi}
                    >
                        {ports === null && <span style={noteStyle}>Looking for MIDI outputs…</span>}
                        {ports !== null && shownPorts.length === 0 && (
                            <span style={noteStyle}>
                                No MIDI outputs found. Connect a device or start a virtual port, then{' '}
                                <button onClick={e => { e.stopPropagation(); refresh(); }} style={linkStyle}>look again</button>.
                            </span>
                        )}
                        {shownPorts.length > 0 && (
                            <div role="radiogroup" aria-label="MIDI output" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.2rem' }}>
                                {shownPorts.map(p => (
                                    <button
                                        key={p}
                                        role="radio"
                                        aria-checked={playbackTarget === p}
                                        onClick={e => { e.stopPropagation(); setPlaybackTarget(p); }}
                                        style={portStyle(playbackTarget === p)}
                                    >
                                        <span style={dotStyle(playbackTarget === p)} />
                                        <span style={{ flex: 1, textAlign: 'left' }}>{p}</span>
                                        {missing(p) && <span style={{ fontSize: '0.7rem', color: '#f87171' }}>not connected</span>}
                                    </button>
                                ))}
                                <button onClick={e => { e.stopPropagation(); refresh(); }} style={{ ...linkStyle, alignSelf: 'flex-start', fontSize: '0.72rem' }}>
                                    ↻ look for outputs again
                                </button>
                            </div>
                        )}
                    </Choice>
                </div>

                <p style={{ margin: 0, fontSize: '0.72rem', color: '#7a7a88' }}>
                    Remembered for next time. The exercise builders&apos; ▶ Listen uses the same choice.
                </p>

                {/* A recording to play along with, in rhythm mode (piano, saxo). */}
                {onOpenAccompaniment && (instrument === 'piano' || instrument === 'saxo') && (
                    <div style={accompanimentCardStyle}>
                        <span style={{ fontSize: '1.35rem', lineHeight: 1.2 }}>🎶</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Accompaniment</span>
                            <span style={{ fontSize: '0.8rem', color: '#b0b0bc', lineHeight: 1.4 }}>
                                {!selectedSong
                                    ? 'Open a piece to give it a recording to play along with.'
                                    : accompaniment
                                        ? `${accompaniment.fileName} · ${formatTime(accompaniment.duration, 0)} · ♩ = ${Math.round(accompaniment.bpm * 10) / 10}. Plays along in Rhythm mode.`
                                        : 'A recording of the piece — a backing track, a band, a teacher — that plays along in Rhythm mode.'}
                            </span>
                        </div>
                        <button onClick={onOpenAccompaniment} disabled={!selectedSong} style={accompanimentButtonStyle(!selectedSong)}>
                            {accompaniment ? 'Sync…' : 'Add…'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

/** One option: a whole card is the target, so the choice reads at a glance. */
const Choice: React.FC<{
    icon: string;
    title: string;
    detail: string;
    selected: boolean;
    disabled?: boolean;
    onSelect: () => void;
    children?: React.ReactNode;
}> = ({ icon, title, detail, selected, disabled, onSelect, children }) => (
    <div
        role="radio"
        aria-checked={selected}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onSelect()}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(); } }}
        style={{
            display: 'flex', gap: '0.8rem', alignItems: 'flex-start',
            padding: '0.85rem 1rem', borderRadius: '10px',
            border: `1px solid ${selected ? 'var(--color-accent)' : 'rgba(255,255,255,0.12)'}`,
            background: selected ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'rgba(255,255,255,0.03)',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.55 : 1,
        }}
    >
        <span style={{ fontSize: '1.35rem', lineHeight: 1.2 }}>{icon}</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{title}</span>
                {selected && <span style={{ fontSize: '0.68rem', color: 'var(--color-accent)', fontWeight: 600 }}>SELECTED</span>}
            </div>
            <span style={{ fontSize: '0.8rem', color: '#b0b0bc', lineHeight: 1.4 }}>{detail}</span>
            {children}
        </div>
    </div>
);

const accompanimentCardStyle: React.CSSProperties = {
    display: 'flex', gap: '0.8rem', alignItems: 'center',
    padding: '0.85rem 1rem', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)',
};

const accompanimentButtonStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600,
    background: 'transparent', color: 'white', border: '1px solid var(--color-accent)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, flexShrink: 0,
});

const closeStyle: React.CSSProperties = {
    width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #444',
    background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

const noteStyle: React.CSSProperties = { fontSize: '0.75rem', color: '#8a8a98', marginTop: '0.2rem' };

const linkStyle: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--color-accent)', textDecoration: 'underline', font: 'inherit',
};

const portStyle = (on: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '0.55rem',
    padding: '0.4rem 0.6rem', borderRadius: '7px', cursor: 'pointer',
    fontSize: '0.82rem', color: 'white',
    background: on ? 'rgba(255,255,255,0.08)' : 'transparent',
    border: `1px solid ${on ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`,
});

const dotStyle = (on: boolean): React.CSSProperties => ({
    width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
    border: '1.5px solid var(--color-accent)',
    background: on ? 'var(--color-accent)' : 'transparent',
});

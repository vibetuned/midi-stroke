import React, { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useGame } from '../../context/game';
import { useMidi } from '../../hooks/useMidi';
import { useDrumMap } from '../../hooks/useDrumMap';
import {
    DRUM_VOICES, GM_DRUM_MAP, GM_PERCUSSION, assignNote, notesForVoice, sameMap, setDrumMap,
    voiceForInput, voiceInfo,
} from '../../utils/drumMap';
import type { DrumVoiceKey } from '../../utils/drumPads';

/**
 * The drum controller's pad map (utils/drumMap.ts): a header button, and a
 * panel listing each kit voice with the notes assigned to it. A pad is taught
 * by hitting it — pick a voice, press Learn, hit every pad and zone that
 * should play it — or typed in by number. Edits apply at once and are
 * remembered on this device; the kit sounds through the new map straight away,
 * so the panel doubles as a way to test the kit.
 */
export const DrumMapButton: React.FC = () => {
    const map = useDrumMap();
    const [open, setOpen] = useState(false);
    const custom = !sameMap(map, GM_DRUM_MAP);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title={custom ? 'Drum pad map: customised' : 'Drum pad map: General MIDI'}
                aria-label="Drum pad map"
                style={{
                    width: '32px', height: '32px', padding: '4px',
                    background: custom ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)' : 'transparent',
                    border: `1px solid ${custom ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)'}`,
                    borderRadius: '6px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem', lineHeight: 1,
                }}
            >
                🥁
            </button>
            {open && <DrumMapPanel onClose={() => setOpen(false)} />}
        </>
    );
};

const noteLabel = (note: number) => `${note}${GM_PERCUSSION[note] ? ` · GM ${GM_PERCUSSION[note]}` : ''}`;

export const DrumMapPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const map = useDrumMap();
    const { lastNote } = useMidi();
    const { setIsPlaying } = useGame();
    const [learning, setLearning] = useState<DrumVoiceKey | null>(null);
    const [typed, setTyped] = useState('');
    // Only hits made with the panel open are shown or learned.
    const [openedAt] = useState(() => performance.now());

    // Teaching the kit while the piece runs would score every test hit.
    useEffect(() => {
        setIsPlaying(false);
        Tone.getTransport().pause();
    }, [setIsPlaying]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Learn: every pad hit while a voice is armed is assigned to it.
    const learnedRef = useRef(0);
    useEffect(() => {
        if (!learning || !lastNote || lastNote.timestamp < openedAt || lastNote.timestamp <= learnedRef.current) return;
        learnedRef.current = lastNote.timestamp;
        setDrumMap(assignNote(map, lastNote.note, learning));
    }, [lastNote, learning, map, openedAt]);

    const hit = lastNote && lastNote.timestamp >= openedAt ? lastNote : null;
    const hitVoice = hit ? voiceForInput(map, hit.note) : undefined;

    const addTyped = () => {
        const n = Number(typed);
        if (!learning || !Number.isInteger(n) || n < 0 || n > 127) return;
        setDrumMap(assignNote(map, n, learning));
        setTyped('');
    };

    return (
        <div style={backdropStyle} onClick={onClose}>
            <div role="dialog" aria-label="Drum pad map" style={panelStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Drum pad map</h2>
                        <p style={leadStyle}>
                            Which kit piece each note from your drum controller plays. It starts as General
                            MIDI; if your module sends other notes, teach it here — pick a voice, press
                            <b> Learn</b>, and hit every pad or zone that should play it.
                        </p>
                    </div>
                    <button onClick={onClose} title="Close (Esc)" style={closeStyle}>✕</button>
                </div>

                <div style={monitorStyle} aria-live="polite">
                    {hit ? (
                        <>
                            <span style={{ color: '#9a9aa8' }}>Last hit</span>{' '}
                            <b>{noteLabel(hit.note)}</b>
                            {' → '}
                            {hitVoice
                                ? <b style={{ color: 'var(--color-accent)' }}>{voiceInfo(hitVoice).label}</b>
                                : <span style={{ color: '#f5a3ae' }}>not assigned — it makes no sound and scores nothing</span>}
                        </>
                    ) : (
                        <span style={{ color: '#9a9aa8' }}>Hit a pad to see which note it sends and what it plays.</span>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', overflowY: 'auto', minHeight: 0 }}>
                    {DRUM_VOICES.map(v => {
                        const notes = notesForVoice(map, v.key);
                        const armed = learning === v.key;
                        const lit = !!hit && hitVoice === v.key;
                        return (
                            <div key={v.key} style={rowStyle(armed, lit)}>
                                <span style={shortStyle}>{v.short}</span>
                                <span style={{ flex: '0 0 11rem', fontSize: '0.85rem' }}>{v.label}</span>
                                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                                    {notes.length === 0 && <span style={{ fontSize: '0.75rem', color: '#77778a' }}>no pad</span>}
                                    {notes.map(n => (
                                        <span key={n} style={chipStyle} title={noteLabel(n)}>
                                            {n}
                                            <button
                                                onClick={() => setDrumMap(assignNote(map, n, null))}
                                                title={`Unassign note ${n}`}
                                                style={chipXStyle}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                    {armed && (
                                        <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)' }}>hit a pad, or</span>
                                            <input
                                                value={typed}
                                                onChange={e => setTyped(e.target.value.replace(/[^0-9]/g, ''))}
                                                onKeyDown={e => { if (e.key === 'Enter') addTyped(); }}
                                                placeholder="note #"
                                                inputMode="numeric"
                                                aria-label={`Add a note number to ${v.label}`}
                                                style={inputStyle}
                                            />
                                            <button onClick={addTyped} style={smallBtnStyle}>Add</button>
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => { setLearning(armed ? null : v.key); setTyped(''); }}
                                    style={learnStyle(armed)}
                                    title={armed ? 'Stop learning' : `Hit pads to assign them to ${v.label}`}
                                >
                                    {armed ? 'Done' : 'Learn'}
                                </button>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => { setDrumMap(GM_DRUM_MAP); setLearning(null); }}
                        disabled={sameMap(map, GM_DRUM_MAP)}
                        style={{ ...smallBtnStyle, opacity: sameMap(map, GM_DRUM_MAP) ? 0.4 : 1 }}
                    >
                        Reset to General MIDI
                    </button>
                    <span style={{ fontSize: '0.72rem', color: '#77778a', textAlign: 'right' }}>
                        A note belongs to one voice; learning it for another moves it. Saved on this device.
                    </span>
                </div>
            </div>
        </div>
    );
};

const backdropStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};
const panelStyle: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
    padding: '1.5rem', width: '100%', maxWidth: '680px', maxHeight: '90vh', color: 'white',
    display: 'flex', flexDirection: 'column', gap: '0.9rem', boxSizing: 'border-box',
};
const leadStyle: React.CSSProperties = { margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#9a9aa8', lineHeight: 1.45 };
const monitorStyle: React.CSSProperties = {
    fontSize: '0.85rem', padding: '0.6rem 0.8rem', borderRadius: '8px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
};
const rowStyle = (armed: boolean, lit: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.4rem 0.6rem',
    borderRadius: '8px',
    border: `1px solid ${armed ? 'var(--color-accent)' : 'rgba(255,255,255,0.07)'}`,
    background: lit ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'transparent',
    transition: 'background 0.15s',
});
const shortStyle: React.CSSProperties = {
    flex: '0 0 2rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#9a9aa8', textAlign: 'center',
};
const chipStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
    padding: '0.1rem 0.25rem 0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.78rem',
    fontFamily: 'monospace', background: 'rgba(255,255,255,0.08)',
};
const chipXStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: '#9a9aa8', cursor: 'pointer', padding: '0 0.2rem', fontSize: '0.85rem',
};
const inputStyle: React.CSSProperties = {
    width: '4.2rem', padding: '0.2rem 0.4rem', borderRadius: '6px', fontSize: '0.78rem',
    background: '#111', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
};
const smallBtnStyle: React.CSSProperties = {
    padding: '0.3rem 0.7rem', borderRadius: '7px', fontSize: '0.78rem', cursor: 'pointer',
    background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
};
const learnStyle = (armed: boolean): React.CSSProperties => ({
    ...smallBtnStyle,
    flex: '0 0 auto',
    background: armed ? 'var(--color-accent)' : 'transparent',
    border: `1px solid ${armed ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`,
});
const closeStyle: React.CSSProperties = {
    width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #444',
    background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

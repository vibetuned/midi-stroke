import React, { memo, useMemo, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { useGameLogic } from '../../hooks/useGameLogic';
import { useMidi } from '../../hooks/useMidi';
import { scaleUrlPitchClasses, parseScaleUrl, type ScaleMode } from '../../utils/scaleGen';
import { lightHardwareKeys, forgetHardwareKeys, configureHardwareScale, tonicPitchClass, type HardwareScale } from '../../utils/keyLights';

// Generator modes → the nearest scale the ROLI hardware can display
// (melodic minor has no LUMI equivalent; harmonic shares the raised 7th).
const HARDWARE_SCALE: Record<ScaleMode, HardwareScale> = {
    major: 'major',
    natural: 'minor',
    harmonic: 'harmonicMinor',
    melodic: 'harmonicMinor',
};
import * as Tone from 'tone';

// Pressed-but-not-expected keys light up in this red ("release me") — same
// feature as the saxo fingering view, drums-theme red family.
const WRONG_RED = '#f5576c';

interface VirtualPianoProps {
    /** When set, keys become clickable and report their MIDI number (theory mode input). */
    onNoteClick?: (midi: number) => void;
    /** Extra per-key glow colors (MIDI number -> CSS color), e.g. notes entered in an exercise. */
    highlightNotes?: Map<number, string>;
}

// Fix 5: memo prevents re-renders driven by parent renders — the component
// re-renders only when its own hooks (activeNotes, expectedNotes, pianoRange,
// selectedSong via useGame) actually change.
export const VirtualPiano: React.FC<VirtualPianoProps> = memo(({ onNoteClick, highlightNotes }) => {
    const { pianoRange, selectedSong } = useGame();
    const { activeNotes } = useMidi();
    const { expectedNotes } = useGameLogic();

    // For generated scale exercises, gray out the keys foreign to the key —
    // a practice guide, not a lock: they stay playable. Null for normal songs.
    const scalePcs = useMemo(
        () => (selectedSong ? scaleUrlPitchClasses(selectedSong) : null),
        [selectedSong],
    );

    // ROLI light guide: mirror the expected notes onto the hardware keys via
    // note-on/off (per-key, chords included). No-op without a ROLI output.
    // The device wipes a guide light itself once the player presses and
    // releases that key, so keys the player just released are dropped from
    // the lit-model before re-asserting — a repeated note then gets its
    // note-on re-sent instead of being diffed away as "already lit".
    const prevHeldRef = useRef<Set<number>>(new Set());
    useEffect(() => {
        const held = new Set(activeNotes.keys());
        forgetHardwareKeys([...prevHeldRef.current].filter(n => !held.has(n)));
        prevHeldRef.current = held;
        lightHardwareKeys(expectedNotes.map(e => e.note));
    }, [expectedNotes, activeNotes]);
    // All lights off when the keyboard unmounts (song change / leaving piano).
    useEffect(() => () => lightHardwareKeys([]), []);

    // Scale exercises: paint the exercise's key onto the hardware (root +
    // scale), mirroring the grayed-out foreign keys on the virtual keyboard.
    useEffect(() => {
        const spec = selectedSong ? parseScaleUrl(selectedSong) : null;
        if (!spec) return;
        const pc = tonicPitchClass(spec.tonic);
        if (pc !== null) configureHardwareScale(pc, HARDWARE_SCALE[spec.mode]);
    }, [selectedSong]);

    if (!pianoRange) return null;

    // Only flag wrong presses while some note is actually expected, so free
    // play (nothing loaded / between note windows) doesn't flash red.
    const hasExpectation = expectedNotes.length > 0;

    const { min, max } = pianoRange;
    const keys: { note: number; isBlack: boolean; isActive: boolean; isExpected: boolean; inScale: boolean; glowColor: string; noteName: string }[] = [];

    for (let i = min; i <= max; i++) {
        const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
        const isActive = activeNotes.has(i);
        const expectedData = expectedNotes.find(e => e.note === i);
        const highlight = highlightNotes?.get(i);
        const isExpected = !!expectedData || !!highlight;
        const inScale = !scalePcs || scalePcs.has(i % 12);

        let glowColor = 'none';
        if (expectedData) {
            glowColor = expectedData.trackIndex % 2 === 0 ? '#51A0CF' : '#A351CF';
        } else if (highlight) {
            glowColor = highlight;
        }

        const noteName = Tone.Frequency(i, "midi").toNote();
        keys.push({ note: i, isBlack, isActive, isExpected, inScale, glowColor, noteName });
    }

    return (
        <div style={{
            width: '100%',
            background: '#1a1a1a',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderTop: '1px solid #444',
            boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6)',
            padding: '10px 0',
        }}>
            {/* Name band */}
            <div style={{ display: 'flex', position: 'relative', background: '#111', width: 'fit-content' }}>
                {keys.map((key) => {
                    if (key.isBlack) return null;

                    const nextNote = key.note + 1;
                    const hasBlack = (nextNote <= max) && [1, 3, 6, 8, 10].includes(nextNote % 12);
                    const blackActive = activeNotes.has(nextNote);
                    const blackKey = hasBlack ? keys.find(k => k.note === nextNote) : null;

                    return (
                        <div key={key.note} style={{ position: 'relative', width: '24px', margin: '0 1px', height: '20px' }}>
                            {/* White key name */}
                            <span style={{
                                position: 'absolute',
                                bottom: '4px',
                                left: 0,
                                width: '24px',
                                textAlign: 'center',
                                fontSize: '8px',
                                fontFamily: 'monospace',
                                color: key.isActive ? (hasExpectation && !key.isExpected ? WRONG_RED : 'var(--color-accent)') : '#555',
                                transition: 'color 0.05s ease',
                                userSelect: 'none',
                                letterSpacing: '-0.5px',
                            }}>
                                {key.noteName}
                            </span>
                            {/* Black key name — centered over the black key (at right edge of this column) */}
                            {hasBlack && blackKey && (
                                <span style={{
                                    position: 'absolute',
                                    bottom: '4px',
                                    // black key center is at 24px from parent left (right edge of white key)
                                    left: '16px',
                                    width: '16px',
                                    textAlign: 'center',
                                    fontSize: '7px',
                                    fontFamily: 'monospace',
                                    color: blackActive ? (hasExpectation && blackKey && !blackKey.isExpected ? WRONG_RED : 'var(--color-accent)') : '#444',
                                    transition: 'color 0.05s ease',
                                    userSelect: 'none',
                                    zIndex: 11,
                                    letterSpacing: '-0.5px',
                                }}>
                                    #♭
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Keys */}
            <div style={{ height: '120px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ display: 'flex', position: 'relative', height: '100%', alignItems: 'flex-start' }}>
                    {keys.map((key) => {
                        if (key.isBlack) return null;

                        const nextNote = key.note + 1;
                        const hasBlack = (nextNote <= max) && [1, 3, 6, 8, 10].includes(nextNote % 12);
                        const blackActive = activeNotes.has(nextNote);

                        const blackExpectedData = expectedNotes.find(e => e.note === nextNote);
                        const blackHighlight = highlightNotes?.get(nextNote);
                        const blackExpected = !!blackExpectedData || !!blackHighlight;
                        let blackGlowColor = 'none';
                        if (blackExpectedData) {
                            blackGlowColor = blackExpectedData.trackIndex % 2 === 0 ? '#51A0CF' : '#A351CF';
                        } else if (blackHighlight) {
                            blackGlowColor = blackHighlight;
                        }

                        const whiteWrong = key.isActive && hasExpectation && !key.isExpected;
                        const blackWrong = blackActive && hasExpectation && !blackExpected;
                        const blackInScale = keys.find(k => k.note === nextNote)?.inScale ?? true;

                        const whiteKeyStyle: React.CSSProperties = {
                            width: '24px',
                            height: '100%',
                            background: key.isActive
                                ? (whiteWrong ? WRONG_RED : 'var(--color-accent)')
                                : key.inScale
                                    ? 'linear-gradient(to bottom, #e8e8e8 0%, #ffffff 60%, #f5f5f5 100%)'
                                    : 'linear-gradient(to bottom, #8f8f8f 0%, #a8a8a8 60%, #9d9d9d 100%)',
                            boxSizing: 'border-box',
                            borderRadius: '0 0 4px 4px',
                            boxShadow: key.isActive
                                ? 'inset 0 -2px 4px rgba(0,0,0,0.2), inset -4px 0 6px -2px rgba(0,0,0,0.35)'
                                : key.isExpected
                                    ? `inset 0 -4px 6px rgba(0,0,0,0.15), inset -4px 0 6px -2px rgba(0,0,0,0.35), inset 0 0 8px ${key.glowColor}66`
                                    : 'inset 0 -4px 6px rgba(0,0,0,0.15), inset -4px 0 6px -2px rgba(0,0,0,0.35)',
                            transform: key.isActive ? 'translateY(2px)' : 'translateY(0)',
                            transition: 'transform 0.05s ease, box-shadow 0.05s ease',
                            border: key.isExpected ? `2px solid ${key.glowColor}` : '1px solid #bbb',
                            borderTop: 'none',
                            position: 'relative',
                            cursor: onNoteClick ? 'pointer' : 'default',
                        };

                        const blackKeyStyle: React.CSSProperties = {
                            position: 'absolute',
                            top: '-2px',
                            right: '-8px',
                            width: '16px',
                            height: 'calc(60% + 2px)',
                            background: blackActive
                                ? (blackWrong ? WRONG_RED : 'var(--color-accent)')
                                : blackInScale
                                    ? 'linear-gradient(to bottom, #444 0%, #111 40%, #000 100%)'
                                    : 'linear-gradient(to bottom, #5c5c60 0%, #4a4a4e 40%, #414145 100%)',
                            boxSizing: 'border-box',
                            zIndex: 10,
                            borderRadius: '0 0 3px 3px',
                            boxShadow: blackActive
                                ? 'inset 0 -2px 4px rgba(0,0,0,0.2), inset -4px 0 6px -2px rgba(0,0,0,0.35)'
                                : blackExpected
                                    ? `inset 0 1px 4px rgba(255,255,255,0.1), inset 0 0 6px ${blackGlowColor}66`
                                    : 'inset 0 1px 4px rgba(255,255,255,0.1)',
                            transform: blackActive ? 'translateY(2px)' : 'translateY(0)',
                            transition: 'transform 0.05s ease, box-shadow 0.05s ease',
                            border: blackExpected ? `2px solid ${blackGlowColor}` : 'none',
                            cursor: onNoteClick ? 'pointer' : 'default',
                        };

                        return (
                            <div key={key.note} style={{ position: 'relative', height: '100%', margin: '0 1px' }}>
                                <div style={whiteKeyStyle} onPointerDown={onNoteClick ? () => onNoteClick(key.note) : undefined} />
                                {hasBlack && (
                                    <div style={blackKeyStyle} onPointerDown={onNoteClick ? () => onNoteClick(nextNote) : undefined} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

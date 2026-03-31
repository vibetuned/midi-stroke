import React from 'react';
import { useGame } from '../context/GameContext';
import { useGameLogic } from '../hooks/useGameLogic';
import { useMidi } from '../hooks/useMidi';
import * as Tone from 'tone';

export const VirtualPiano: React.FC = () => {
    const { pianoRange } = useGame();
    const { activeNotes } = useMidi();
    const { expectedNotes } = useGameLogic();

    if (!pianoRange) return null;

    const { min, max } = pianoRange;
    const keys: { note: number; isBlack: boolean; isActive: boolean; isExpected: boolean; glowColor: string; noteName: string }[] = [];

    for (let i = min; i <= max; i++) {
        const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
        const isActive = activeNotes.has(i);
        const expectedData = expectedNotes.find(e => e.note === i);
        const isExpected = !!expectedData;

        let glowColor = 'none';
        if (isExpected && expectedData) {
            glowColor = expectedData.trackIndex % 2 === 0 ? '#51A0CF' : '#A351CF';
        }

        const noteName = Tone.Frequency(i, "midi").toNote();
        keys.push({ note: i, isBlack, isActive, isExpected, glowColor, noteName });
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
                                color: key.isActive ? '#646cff' : '#555',
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
                                    color: blackActive ? '#646cff' : '#444',
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
                        const blackExpected = !!blackExpectedData;
                        let blackGlowColor = 'none';
                        if (blackExpected && blackExpectedData) {
                            blackGlowColor = blackExpectedData.trackIndex % 2 === 0 ? '#51A0CF' : '#A351CF';
                        }

                        const whiteKeyStyle: React.CSSProperties = {
                            width: '24px',
                            height: '100%',
                            background: key.isActive
                                ? 'var(--color-accent)'
                                : 'linear-gradient(to bottom, #e8e8e8 0%, #ffffff 60%, #f5f5f5 100%)',
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
                        };

                        const blackKeyStyle: React.CSSProperties = {
                            position: 'absolute',
                            top: '-2px',
                            right: '-8px',
                            width: '16px',
                            height: 'calc(60% + 2px)',
                            background: blackActive
                                ? 'var(--color-accent)'
                                : 'linear-gradient(to bottom, #444 0%, #111 40%, #000 100%)',
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
                        };

                        return (
                            <div key={key.note} style={{ position: 'relative', height: '100%', margin: '0 1px' }}>
                                <div style={whiteKeyStyle} />
                                {hasBlack && (
                                    <div style={blackKeyStyle} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

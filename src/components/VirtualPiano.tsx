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
    const keys = [];

    // Generate keys
    for (let i = min; i <= max; i++) {
        const isBlack = [1, 3, 6, 8, 10].includes(i % 12);
        const isActive = activeNotes.has(i);
        // Find if this note is expected and get its track info
        const expectedData = expectedNotes.find(e => e.note === i);
        const isExpected = !!expectedData;

        let borderColor = 'none';
        if (isExpected && expectedData) {
            borderColor = expectedData.trackIndex % 2 === 0 ? '#51A0CF' : '#A351CF';
        }

        const noteName = Tone.Frequency(i, "midi").toNote(); // e.g., C4

        keys.push({ note: i, isBlack, isActive, isExpected, borderColor, noteName });
    }

    return (
        <div style={{
            width: '100%',
            height: '120px',
            background: '#222',
            display: 'flex',
            justifyContent: 'center',
            padding: '10px',
            borderTop: '1px solid #444'
        }}>


            {/* Let's try a simpler robust mapping: SVG or pure CSS with logic */}
            <div style={{ display: 'flex', position: 'relative', height: '100%', alignItems: 'flex-start' }}>
                {keys.map((key) => {
                    if (key.isBlack) return null; // We handle black keys differently or attached to white keys?

                    // Check if the NEXT semi-tone is a black key
                    const nextNote = key.note + 1;
                    const hasBlack = (nextNote <= max) && [1, 3, 6, 8, 10].includes(nextNote % 12);
                    const blackActive = activeNotes.has(nextNote);

                    // Black key expected check
                    const blackExpectedData = expectedNotes.find(e => e.note === nextNote);
                    const blackExpected = !!blackExpectedData;
                    let blackBorderColor = 'none';
                    if (blackExpected && blackExpectedData) {
                        blackBorderColor = blackExpectedData.trackIndex % 2 === 0 ? '#51A0CF' : '#A351CF';
                    }

                    return (
                        <div key={key.note} style={{ position: 'relative', height: '100%', margin: '0 1px' }}>
                            {/* White Key */}
                            <div style={{
                                width: '24px',
                                height: '100%',
                                background: key.isActive ? 'var(--color-accent)' : '#fff',
                                border: key.isExpected ? `2px solid ${key.borderColor}` : 'none',
                                boxSizing: 'border-box',
                                borderRadius: '0 0 4px 4px'
                            }} />

                            {/* Black Key (Absolute) */}
                            {hasBlack && (
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    right: '-8px', // Half overlap
                                    width: '16px',
                                    height: '60%',
                                    background: blackActive ? 'var(--color-accent)' : '#000',
                                    border: blackExpected ? `2px solid ${blackBorderColor}` : 'none',
                                    boxSizing: 'border-box',
                                    zIndex: 10,
                                    borderRadius: '0 0 2px 2px'
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

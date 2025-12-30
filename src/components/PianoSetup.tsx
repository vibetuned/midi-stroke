import React, { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useMidi } from '../hooks/useMidi';

export const PianoSetup: React.FC = () => {
    const { pianoRange, setPianoRange } = useGame();
    const { activeNotes } = useMidi();
    const [step, setStep] = useState<'intro' | 'low' | 'wait_low' | 'high' | 'wait_high' | 'done'>('intro');
    const [tempLow, setTempLow] = useState<number | null>(null);
    const [tempHigh, setTempHigh] = useState<number | null>(null);

    // Audio Context Resume on Interaction (Just in case, usually handled by start overlay)
    useEffect(() => {
        console.log(`[PianoSetup] Step: ${step}, Active Notes: ${Array.from(activeNotes.keys()).join(', ')}`);

        if (!pianoRange) {
            // Check for key press
            const pressedNote = activeNotes.size > 0 ? activeNotes.keys().next().value : null;

            if (step === 'low' && pressedNote !== null && pressedNote !== undefined) {
                setTempLow(pressedNote);
                setStep('wait_low');
            }
            else if (step === 'wait_low' && activeNotes.size === 0) {
                setStep('high');
            }
            else if (step === 'high' && pressedNote !== null && pressedNote !== undefined) {
                setTempHigh(pressedNote);
                setStep('wait_high');
            }
            else if (step === 'wait_high' && activeNotes.size === 0 && tempLow !== null && tempHigh !== null) {
                const min = Math.min(tempLow, tempHigh);
                const max = Math.max(tempLow, tempHigh);
                console.log("Setup Done. Range:", min, max);
                setPianoRange({ min, max });
                setStep('done');
            }
        }
    }, [activeNotes, step, tempLow, tempHigh, pianoRange, setPianoRange]);

    // If already set up, don't show
    if (pianoRange) return null;

    return (
        <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.9)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            textAlign: 'center'
        }}>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎹 Piano Setup</h2>

            {step === 'intro' && (
                <>
                    <p style={{ marginBottom: '2rem', maxWidth: '400px', lineHeight: '1.6' }}>
                        To get the best experience, we need to calibrate your MIDI keyboard range.
                    </p>
                    <button
                        onClick={() => setStep('low')}
                        style={{
                            padding: '1rem 2rem',
                            fontSize: '1.2rem',
                            background: 'var(--color-accent)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        Start Calibration
                    </button>
                    <button
                        onClick={() => setPianoRange({ min: 21, max: 108 })} // Standard 88 keys
                        style={{
                            marginTop: '1rem',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.3)',
                            padding: '0.5rem 1rem',
                            color: 'rgba(255,255,255,0.7)',
                            cursor: 'pointer',
                            borderRadius: '4px'
                        }}
                    >
                        Skip (Use Standard 88-key)
                    </button>
                </>
            )}

            {step === 'low' && (
                <div className="animate-pulse">
                    <p style={{ fontSize: '1.5rem' }}>Press the <strong>LOWEST</strong> key on your piano</p>
                </div>
            )}

            {step === 'high' && (
                <div className="animate-pulse">
                    <p style={{ fontSize: '1.5rem' }}>Press the <strong>HIGHEST</strong> key on your piano</p>
                </div>
            )}
        </div>
    );
};

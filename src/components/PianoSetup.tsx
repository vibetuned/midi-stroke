import React, { useState } from 'react';
import { useGame } from '../context/game';
import { useMidiNotes } from '../hooks/useMidi';
import { getMidiState } from '../utils/midiInput';

export const PianoSetup: React.FC = () => {
    const { pianoRange, setPianoRange } = useGame();
    const [step, setStep] = useState<'intro' | 'low' | 'wait_low' | 'high' | 'wait_high' | 'done'>('intro');
    const [tempLow, setTempLow] = useState<number | null>(null);
    const [tempHigh, setTempHigh] = useState<number | null>(null);

    // Calibration: press the lowest key, let go, press the highest, let go.
    // Each step moves on at a key event, so the next step never sees the key
    // that finished the last one.
    useMidiNotes({
        onNoteOn: hit => {
            if (pianoRange) return;
            if (step === 'low') {
                setTempLow(hit.note);
                setStep('wait_low');
            } else if (step === 'high') {
                setTempHigh(hit.note);
                setStep('wait_high');
            }
        },
        onNoteOff: () => {
            if (pianoRange || getMidiState().activeNotes.size > 0) return;
            if (step === 'wait_low') {
                setStep('high');
            } else if (step === 'wait_high' && tempLow !== null && tempHigh !== null) {
                const min = Math.min(tempLow, tempHigh);
                const max = Math.max(tempLow, tempHigh);
                console.log("Setup Done. Range:", min, max);
                setPianoRange({ min, max });
                setStep('done');
            }
        },
    });

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

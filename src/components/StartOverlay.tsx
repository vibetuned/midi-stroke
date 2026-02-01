import React from 'react';
import * as Tone from 'tone';
import { useGame } from '../context/GameContext';

export const StartOverlay: React.FC = () => {
    const { isAudioStarted, setAudioStarted } = useGame();

    if (isAudioStarted) return null;

    const handleStart = async () => {
        await Tone.start();
        console.log("Audio Context Started via Overlay");
        setAudioStarted(true);
    };

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(5px)'
        }}>
            <h1 style={{ marginBottom: '2rem', color: 'white' }}>Midi Stroke</h1>
            <button
                onClick={handleStart}
                style={{
                    padding: '1rem 3rem',
                    fontSize: '1.5rem',
                    background: 'var(--color-accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50px',
                    cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(100, 108, 255, 0.4)',
                    transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
                Start Game
            </button>
            <p style={{ marginTop: '1rem', color: 'var(--color-text-secondary)' }}>
                Click to enable audio and MIDI
            </p>
        </div>
    );
};

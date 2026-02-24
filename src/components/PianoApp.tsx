import React from 'react';
import { ScoreView } from './ScoreView';
import { MidiStatus } from './MidiStatus';
import { PlayControls } from './PlayControls';
import { useMidiFile, useGame } from '../context/GameContext';
import { useAudio } from '../hooks/useAudio';
import { StartOverlay } from './StartOverlay';
import { PianoSetup } from './PianoSetup';
import { SongSelector } from './SongSelector';
import { VirtualPiano } from './VirtualPiano';

interface PianoAppProps {
    onBack: () => void;
}

export const PianoApp: React.FC<PianoAppProps> = ({ onBack }) => {
    // Initialize Audio
    useAudio();
    useMidiFile();
    const { selectedSong, setSelectedSong } = useGame();

    return (
        <div className="app-container">
            <StartOverlay />
            <PianoSetup />
            <SongSelector />
            <header style={{
                padding: '1rem',
                borderBottom: '1px solid var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-bg-primary)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={onBack}
                        style={{
                            padding: '0.4rem 0.8rem',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'white',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'background 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        ← Back
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Midi Stroke</h1>
                </div>
                {selectedSong && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                            {selectedSong.split('/').pop()}
                        </span>
                        <button
                            onClick={() => setSelectedSong(null)}
                            style={{
                                padding: '0.5rem 1rem',
                                background: '#444',
                                border: '1px solid #666',
                                color: 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#555'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#444'}
                        >
                            Change Song
                        </button>
                    </div>
                )}
            </header>
            <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <MidiStatus />
                <ScoreView />
            </main>
            <VirtualPiano />
            <PlayControls />
        </div>
    );
};

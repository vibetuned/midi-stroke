import React from 'react';
import { DrumsScoreView } from './DrumsScoreView';
import { VirtualDrums } from './VirtualDrums';
import { MidiStatus } from './MidiStatus';
import { PlayControls } from './PlayControls';
import { useDrumsMidiFile, useGame } from '../context/GameContext';
import { useAudio } from '../hooks/useAudio';
import { StartOverlay } from './StartOverlay';
import { SongSelector } from './SongSelector';

interface DrumsAppProps {
    onBack: () => void;
}

export const DrumsApp: React.FC<DrumsAppProps> = ({ onBack }) => {
    // Initialize Audio
    useAudio();
    useDrumsMidiFile();
    const { selectedSong, setSelectedSong } = useGame();

    return (
        <div className="app-container theme-drums">
            <StartOverlay />
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
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Midi Stroke - Drums</h1>
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

            <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <MidiStatus />
                <DrumsScoreView />
            </main>
            <VirtualDrums />
            <PlayControls />
        </div>
    );
};

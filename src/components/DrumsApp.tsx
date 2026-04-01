import React, { useState, useEffect, useRef } from 'react';
import { DrumsScoreView } from './DrumsScoreView';
import { VirtualDrums } from './VirtualDrums';
import { MidiStatus } from './MidiStatus';
import { PlayControls } from './PlayControls';
import { useDrumsMidiFile, useGame } from '../context/GameContext';
import { useAudio } from '../hooks/useAudio';
import { useGameLogic } from '../hooks/useGameLogic';
import { StartOverlay } from './StartOverlay';
import { SongSelector } from './SongSelector';
import { LiveStats } from './LiveStats';
import { StatsPanel } from './StatsPanel';
import { useStats } from '../context/StatsContext';

interface DrumsAppProps {
    onBack: () => void;
}

export const DrumsApp: React.FC<DrumsAppProps> = ({ onBack }) => {
    useAudio();
    useDrumsMidiFile();
    useGameLogic();
    const { selectedSong, setSelectedSong, isPlaying, gameMode } = useGame();
    const { recordPlay, resetSession } = useStats();

    const [prevSong, setPrevSong] = useState<string | null>(null);
    const [showStats, setShowStats] = useState(false);

    const handleChangeSong = () => {
        setPrevSong(selectedSong);
        setSelectedSong(null);
    };

    const handleDismissSelector = () => {
        setSelectedSong(prevSong);
        setPrevSong(null);
    };

    // Reset session counters whenever the active song changes
    useEffect(() => {
        resetSession();
    }, [selectedSong, resetSession]);

    // Record one play entry each time the user starts a new play session
    const lastPlayKeyRef = useRef('');
    useEffect(() => {
        if (!isPlaying || !selectedSong) return;
        const key = `${selectedSong}::${gameMode}`;
        if (key === lastPlayKeyRef.current) return;
        lastPlayKeyRef.current = key;
        const statsMode = gameMode === 'standard' ? 'rhythm' : 'practice';
        recordPlay(selectedSong, selectedSong.split('/').pop() ?? selectedSong, statsMode);
    }, [isPlaying, selectedSong, gameMode, recordPlay]);

    return (
        <div className="app-container theme-drums">
            <StartOverlay />
            <SongSelector onDismiss={prevSong ? handleDismissSelector : undefined} />
            {showStats && <StatsPanel onClose={() => setShowStats(false)} />}

            <header style={{
                padding: '1rem',
                borderBottom: '1px solid var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-bg-primary)',
                gap: '1rem',
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

                {/* Live session stats */}
                <LiveStats />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {selectedSong && (
                        <>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                                {selectedSong.split('/').pop()}
                            </span>
                            <button
                                onClick={handleChangeSong}
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
                        </>
                    )}
                    {/* Stats history button — to the right of Change Song */}
                    <button
                        onClick={() => setShowStats(true)}
                        title="Song statistics"
                        style={{
                            width: '32px',
                            height: '32px',
                            padding: '4px',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <img src="/stats.svg" alt="Stats" style={{ width: '20px', height: '20px' }} />
                    </button>
                </div>
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

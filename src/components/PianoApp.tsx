import React, { useState, useEffect } from 'react';
import { ScoreView } from './ScoreView';
import { MidiStatus } from './MidiStatus';
import { PlayControls } from './PlayControls';
import { useMidiFile, useGame } from '../context/GameContext';
import { useAudio } from '../hooks/useAudio';
import { StartOverlay } from './StartOverlay';
import { PianoSetup } from './PianoSetup';
import { SongSelector } from './SongSelector';
import { VirtualPiano } from './VirtualPiano';
import { LiveStats } from './LiveStats';
import { StatsPanel } from './StatsPanel';
import { useStats } from '../context/StatsContext';

interface PianoAppProps {
    onBack: () => void;
}

export const PianoApp: React.FC<PianoAppProps> = ({ onBack }) => {
    useAudio();
    useMidiFile();
    const { selectedSong, setSelectedSong, gameMode, midiData, songCompleted, setSongCompleted } = useGame();
    const { recordPlay, recordSessionEnd, resetSession, sessionStats } = useStats();

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

    // When the song finishes naturally: record the completed play, persist maxCombo + precision, then reset
    useEffect(() => {
        if (!songCompleted || !selectedSong) return;
        const statsMode = gameMode === 'standard' ? 'rhythm' : 'practice';
        const songName = selectedSong.split('/').pop() ?? selectedSong;
        const totalNotes = midiData
            ? new Set(midiData.tracks.flatMap(t => t.notes.map(n => n.ticks))).size
            : 0;
        const precision = totalNotes > 0 ? sessionStats.score / totalNotes : 0;
        recordPlay(selectedSong, songName, statsMode);
        recordSessionEnd(selectedSong, songName, statsMode, precision, sessionStats.maxCombo);
        resetSession();
        setSongCompleted(false);
    }, [songCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="app-container">
            <StartOverlay />
            <PianoSetup />
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
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Midi Stroke</h1>
                </div>

                {/* Live session stats — centre of header */}
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

            <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <MidiStatus />
                <ScoreView />
            </main>
            <VirtualPiano />
            <PlayControls />
        </div>
    );
};

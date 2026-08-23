import React, { useState, useEffect } from 'react';
import { SaxoScoreView } from './SaxoScoreView';
import { VirtualSaxo } from './VirtualSaxo';
import { MidiStatus } from '../MidiStatus';
import { PlayControls } from '../PlayControls';
import { useMidiFile, useGame } from '../../context/GameContext';
import { useAudio } from '../../hooks/useAudio';
import { StartOverlay } from '../StartOverlay';
import { SongSelector } from '../SongSelector';
import { LiveStats } from '../LiveStats';
import { StatsPanel } from '../StatsPanel';
import { SongNavigator } from '../SongNavigator';
import { useStats } from '../../context/StatsContext';

interface SaxoAppProps {
    onBack: () => void;
}

export const SaxoApp: React.FC<SaxoAppProps> = ({ onBack }) => {
    useAudio();
    // Saxo is single-voice and melodic, so it reuses the piano playback loop.
    // handSelection defaults to 'both', so the single track plays unfiltered.
    useMidiFile();
    const { selectedSong, setSelectedSong, gameMode, timemap, songCompleted, setSongCompleted } = useGame();
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

    // When the song finishes naturally: record the completed play, persist
    // maxCombo + precision, then reset.
    useEffect(() => {
        if (!songCompleted || !selectedSong) return;
        const statsMode = gameMode === 'standard' ? 'rhythm' : 'practice';
        const songName = selectedSong.split('/').pop() ?? selectedSong;
        // One timemap onset = one hit/good moment (chords pre-grouped,
        // tie continuations already erased).
        const totalNotes = timemap ? timemap.onsets.length : 0;
        const precision = totalNotes > 0 ? sessionStats.score / totalNotes : 0;
        recordPlay(selectedSong, songName, statsMode);
        recordSessionEnd(selectedSong, songName, statsMode, precision, sessionStats.maxCombo);
        resetSession();
        setSongCompleted(false);
    }, [songCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="app-container theme-saxo">
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
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Midi Stroke - Saxo</h1>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {selectedSong && (
                        <>
                            <LiveStats />
                            <SongNavigator onChangeRequest={handleChangeSong} />
                        </>
                    )}
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
                        <img src={`${import.meta.env.BASE_URL}stats.svg`} alt="Stats" style={{ width: '20px', height: '20px' }} />
                    </button>
                </div>
            </header>

            {/* Split layout: VirtualSaxo (left, content-sized) + SaxoScoreView (right).
                The left column hugs the fingering chart instead of a viewport
                percentage; the score sits as a vertically-centered band rather
                than filling the whole column height. */}
            <main style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
                {/* The fingering panel is a centered band matching the score's
                    height, so both sit aligned with the theme background above
                    and below. */}
                <div style={{ flex: '0 0 clamp(200px, 25vw, 340px)', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ height: 'min(100%, 48vh)', minHeight: '200px', display: 'flex' }}>
                        <VirtualSaxo />
                    </div>
                </div>
                <div style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <MidiStatus />
                    <SaxoScoreView />
                </div>
            </main>
            <PlayControls />
        </div>
    );
};

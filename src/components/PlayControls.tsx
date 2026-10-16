import React, { useCallback, useEffect, useRef } from 'react';
import { TEMPO_MAX, TEMPO_MIN } from '../context/game';
import { useGame } from '../context/game';
import { useStats } from '../context/stats';
import * as Tone from 'tone';
import { LoopChip } from './LoopRangeSelector';
import { SettingsButton } from './SettingsDialog';
import { usePlayToggle } from '../hooks/usePlayToggle';

export const PlayControls: React.FC = () => {
    const { isPlaying, setIsPlaying, tempo, setTempo, countdown, countIn, gameMode, setGameMode, setPlayPosition, setWaitingForNotes, seek, instrument, handSelection, setHandSelection, loopRange, tempoLock } = useGame();
    const { resetSession } = useStats();
    // Play and pause, with the count-in (hooks/usePlayToggle.ts); the key handler reads the latest through a ref.
    const togglePlay = usePlayToggle();
    const togglePlayRef = useRef(togglePlay);
    useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);

    // Fix 10: stable refs so the keydown closure never captures stale values
    const tempoRef = useRef(tempo);
    useEffect(() => { tempoRef.current = tempo; }, [tempo]);
    const byEar = gameMode === 'ear';
    const byEarRef = useRef(byEar);
    useEffect(() => { byEarRef.current = byEar; }, [byEar]);
    const lockedRef = useRef(tempoLock !== null);
    useEffect(() => { lockedRef.current = tempoLock !== null; }, [tempoLock]);

    // Fix 10: global keyboard shortcuts
    // Space = play/pause, ←/→ = seek ±1 beat, ↑/↓ = tempo ±5 BPM
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Never intercept events from text inputs
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLSelectElement ||
                e.target instanceof HTMLTextAreaElement
            ) return;

            // By ear, the session drives the page: play and seek would give the
            // melody away, so only the tempo keys stay live.
            if (byEarRef.current && (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    togglePlayRef.current();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    seek(Math.max(0, Tone.getTransport().ticks - 192));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    seek(Tone.getTransport().ticks + 192);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    // An accompaniment sets the tempo; the keys leave it be.
                    if (lockedRef.current) break;
                    setTempo(Math.min(TEMPO_MAX, tempoRef.current + 5));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (lockedRef.current) break;
                    setTempo(Math.max(TEMPO_MIN, tempoRef.current - 5));
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setIsPlaying, seek, setTempo]);

    // Back to the start — of the loop, when there is one.
    const loopStart = loopRange?.start ?? 0;
    const handleReset = useCallback(() => {
        setIsPlaying(false);
        Tone.getTransport().pause();
        Tone.getTransport().ticks = loopStart;
        setPlayPosition(loopStart);
        setWaitingForNotes([]);
        resetSession();
    }, [setIsPlaying, setPlayPosition, setWaitingForNotes, resetSession, loopStart]);

    // Changing hands invalidates the run-in-progress (different note set,
    // different misses possible) — reset to the start so stats and minimap
    // markers reflect a fresh attempt. Skip the very first render so we
    // don't kick the transport before any song is loaded.
    const isFirstHandRender = useRef(true);
    useEffect(() => {
        if (isFirstHandRender.current) {
            isFirstHandRender.current = false;
            return;
        }
        handleReset();
    }, [handSelection, handleReset]);

    return (
        <div style={{
            background: 'var(--color-bg-secondary)',
            padding: '1rem 2rem',
            display: 'flex',
            gap: '1.5rem',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            width: '100%',
            height: '80px'
        }}>
            {/* Game Mode Toggle */}
            <div style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '20px',
                padding: '4px',
                marginRight: '1rem'
            }}>
                <button
                    onClick={() => setGameMode('standard')}
                    style={{
                        background: gameMode === 'standard' ? 'var(--color-accent)' : 'transparent',
                        color: gameMode === 'standard' ? 'white' : 'var(--color-text-secondary)',
                        border: 'none',
                        borderRadius: '16px',
                        padding: '0.5rem 1rem',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Rhythm
                </button>
                <button
                    onClick={() => setGameMode('practice')}
                    style={{
                        background: gameMode === 'practice' ? 'var(--color-accent)' : 'transparent',
                        color: gameMode === 'practice' ? 'white' : 'var(--color-text-secondary)',
                        border: 'none',
                        borderRadius: '16px',
                        padding: '0.5rem 1rem',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Practice
                </button>
                {(instrument === 'piano' || instrument === 'saxo') && (
                    <button
                        onClick={() => {
                            // By ear trains one staff: on the piano, treble
                            // unless the left hand was already chosen.
                            if (instrument === 'piano' && handSelection === 'both') setHandSelection('right');
                            setGameMode('ear');
                        }}
                        title="Learn by ear: hear a phrase, play it back from memory, one more note each round"
                        style={{
                            background: byEar ? 'var(--color-accent)' : 'transparent',
                            color: byEar ? 'white' : 'var(--color-text-secondary)',
                            border: 'none',
                            borderRadius: '16px',
                            padding: '0.5rem 1rem',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        By ear
                    </button>
                )}
            </div>

            {/* Reset and play belong to the transport; by ear the session drives
                itself from the ear panel above. */}
            {!byEar && (<>
            {/* Reset Button (Always visible) */}
            <button
                onClick={handleReset}
                title="Reset to Start"
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '1px solid var(--color-text-secondary)',
                    background: 'transparent',
                    color: 'var(--color-text-primary)',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    marginRight: '0.5rem'
                }}
                className="hover-scale"
            >
                ↺
            </button>

            {/* Play/Pause Button */}
            <button
                onClick={togglePlay}
                title={countdown ? 'Stop the count' : isPlaying ? 'Pause' : countIn ? 'Play, after a bar counted in' : 'Play'}
                style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--color-accent)',
                    color: 'white',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s'
                }}
                className="hover-scale"
            >
                {isPlaying || countdown ? '⏸' : '▶'}
            </button>
            </>)}
            {/* What is looping — or, by ear, the passage being learned — and
                the way back to the whole piece. */}
            <LoopChip />

            {/* Set once, rather than played with: sound, tempo, count-in, scrolling, the visual metronome. */}
            <SettingsButton />

            {/* Hand Selection — piano only, at the right, the modes' mirror. Drums never
                see this control. By ear it gives way to the ear panel's own treble / bass choice. */}
            {instrument === 'piano' && !byEar && (
                <div style={{
                    display: 'flex',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '20px',
                    padding: '4px',
                    marginLeft: '1rem',
                }}>
                    {(['left', 'both', 'right'] as const).map(hand => {
                        const active = handSelection === hand;
                        const label = hand === 'left' ? 'L' : hand === 'right' ? 'R' : 'L+R';
                        const title = hand === 'left' ? 'Left hand only' : hand === 'right' ? 'Right hand only' : 'Both hands';
                        return (
                            <button
                                key={hand}
                                onClick={() => setHandSelection(hand)}
                                title={title}
                                style={{
                                    background: active ? 'var(--color-accent)' : 'transparent',
                                    color: active ? 'white' : 'var(--color-text-secondary)',
                                    border: 'none',
                                    borderRadius: '16px',
                                    padding: '0.5rem 0.9rem',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    minWidth: '2.5rem',
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

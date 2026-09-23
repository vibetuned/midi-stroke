import React, { useCallback, useEffect, useRef } from 'react';
import { TEMPO_MAX, TEMPO_MIN } from '../context/game';
import type { TempoMap } from '../utils/tempo';
import { useGame } from '../context/game';
import { useStats } from '../context/stats';
import * as Tone from 'tone';
import { LoopChip } from './LoopRangeSelector';

export const PlayControls: React.FC = () => {
    const { isPlaying, setIsPlaying, tempo, setTempo, scoreTempo, isMetronomeMuted, setMetronomeMuted, gameMode, setGameMode, setPlayPosition, setWaitingForNotes, seek, instrument, handSelection, setHandSelection, loopRange } = useGame();
    const { resetSession } = useStats();

    // Fix 10: stable refs so the keydown closure never captures stale values
    const isPlayingRef = useRef(isPlaying);
    const tempoRef = useRef(tempo);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { tempoRef.current = tempo; }, [tempo]);
    const byEar = gameMode === 'ear';
    const byEarRef = useRef(byEar);
    useEffect(() => { byEarRef.current = byEar; }, [byEar]);

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
                    {
                        const next = !isPlayingRef.current;
                        setIsPlaying(next);
                        if (next) {
                            Tone.start()
                                .then(() => Tone.getTransport().start())
                                .catch(console.error);
                        } else {
                            Tone.getTransport().pause();
                        }
                    }
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
                    setTempo(Math.min(TEMPO_MAX, tempoRef.current + 5));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
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

            {/* Hand Selection — piano only. Drums never see this control. By ear
                it gives way to the ear panel's own treble / bass choice. */}
            {instrument === 'piano' && !byEar && (
                <div style={{
                    display: 'flex',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '20px',
                    padding: '4px',
                    marginRight: '1rem',
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
                onClick={async () => {
                    const nextState = !isPlaying;
                    console.log("Toggling Play state. New state:", nextState);
                    setIsPlaying(nextState);

                    if (nextState) {
                        try {
                            await Tone.start();
                            Tone.getTransport().start();
                        } catch (e) {
                            console.error("Audio Context blocked:", e);
                            setIsPlaying(false);
                        }
                    } else {
                        Tone.getTransport().pause();
                    }
                }}
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
                {isPlaying ? '⏸' : '▶'}
            </button>
            </>)}
            {/* What is looping — or, by ear, the passage being learned — and
                the way back to the whole piece. */}
            <LoopChip />

            <button
                onClick={() => setMetronomeMuted(!isMetronomeMuted)}
                title={isMetronomeMuted ? "Unmute audio" : "Mute audio (metronome + instrument)"}
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '1px solid var(--color-text-secondary)',
                    background: isMetronomeMuted ? 'transparent' : 'rgba(255,255,255,0.1)',
                    color: 'var(--color-text-primary)',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                }}
                className="hover-scale"
            >
                {isMetronomeMuted ? '🔇' : '🔊'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '240px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 'bold' }}>
                        Tempo: {tempo} BPM
                    </span>
                    <ScoreTempoBadge scoreTempo={scoreTempo} tempo={tempo} onReset={setTempo} />
                </div>
                <input
                    type="range"
                    min={TEMPO_MIN}
                    max={TEMPO_MAX}
                    step="1"
                    value={tempo}
                    onChange={(e) => setTempo(Number(e.target.value))}
                    title="Quarter notes per minute — for a score that states its tempo, this is its opening tempo, and later changes keep their proportion"
                    style={{
                        flex: 1,
                        cursor: 'pointer',
                        accentColor: 'var(--color-accent)'
                    }}
                />
            </div>
        </div>
    );
};

/**
 * What the score says about its tempo: its marking, whether it changes tempo
 * along the way, and — when the slider has moved off the marking — how far off
 * it is and a way back.
 */
const ScoreTempoBadge: React.FC<{
    scoreTempo: TempoMap | null;
    tempo: number;
    onReset: (bpm: number) => void;
}> = ({ scoreTempo, tempo, onReset }) => {
    const initial = scoreTempo?.initial;
    if (!initial) return null;
    const marked = Math.round(initial.bpm);
    const changes = scoreTempo.marks.length - 1;
    const off = tempo !== marked;
    const percent = Math.round((tempo / initial.bpm) * 100);
    const label = initial.text && !/\d/.test(initial.text) ? `${initial.text} · ` : '';
    return (
        <span
            title={`The score marks ♩ = ${marked} (from @${initial.source === 'text' ? 'its tempo text' : initial.source})`
                + (changes ? `, and changes tempo ${changes} time${changes > 1 ? 's' : ''} — each change keeps its proportion to the slider` : '')}
            style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary, #8a8a98)', display: 'flex', gap: '0.35rem', alignItems: 'center' }}
        >
            {label}score ♩ = {marked}{changes ? ` · ${changes} change${changes > 1 ? 's' : ''}` : ''}
            {off && (
                <>
                    <span>· {percent}%</span>
                    {/* Words, not a glyph: the transport already has a ↺ that means
                        "restart", and two of them side by side read as one. */}
                    <button
                        onClick={() => onReset(initial.bpm)}
                        title="Back to the score's tempo"
                        style={{
                            fontSize: '0.66rem', padding: '0 0.4rem', borderRadius: '8px', cursor: 'pointer',
                            background: 'transparent', color: 'var(--color-accent)',
                            border: '1px solid var(--color-accent)',
                        }}
                    >
                        use {marked}
                    </button>
                </>
            )}
        </span>
    );
};

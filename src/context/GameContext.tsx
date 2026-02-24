import React, { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import * as Tone from 'tone';

import { Midi } from '@tonejs/midi';

interface GameState {
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    tempo: number;
    setTempo: (tempo: number) => void;
    currentMeasure: number;
    setCurrentMeasure: (measure: number) => void;
    isAudioStarted: boolean;
    setAudioStarted: (started: boolean) => void;
    isMetronomeMuted: boolean;
    setMetronomeMuted: (muted: boolean) => void;
    pianoRange: { min: number; max: number } | null;
    setPianoRange: (range: { min: number; max: number } | null) => void;
    playSize: number;
    setPlaySize: (size: number) => void;
    playSizeTicks: number;
    setPlaySizeTicks: (ticks: number) => void;
    playPosition: number;
    setPlayPosition: (pos: number) => void;
    loadMidiData: (base64: string) => void;
    midiData: Midi | null;
    ppqRatio: number;
    gameMode: 'standard' | 'practice';
    setGameMode: (mode: 'standard' | 'practice') => void;
    waitingForNotes: number[];
    setWaitingForNotes: (notes: number[]) => void;
    removeWaitingNote: (note: number) => void;
    resumePractice: () => void;
    seek: (ticks: number) => void;
    waitingForNotesRef: React.MutableRefObject<number[]>;
    selectedSong: string | null;
    setSelectedSong: (song: string | null) => void;
    instrument: 'piano' | 'drums';
}

const GameContext = createContext<GameState | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode, instrument?: 'piano' | 'drums' }> = ({ children, instrument = 'piano' }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [tempo, setTempo] = useState(120);
    const [currentMeasure, setCurrentMeasure] = useState(1);
    const [isAudioStarted, setAudioStarted] = useState(false);
    const [isMetronomeMuted, setMetronomeMuted] = useState(false);
    const [pianoRange, setPianoRange] = useState<{ min: number; max: number } | null>(null);
    const [playSize, setPlaySize] = useState(0);
    const [playSizeTicks, setPlaySizeTicks] = useState(0);
    const [playPosition, setPlayPosition] = useState(0);
    const [midiData, setMidiData] = useState<Midi | null>(null);
    const [ppqRatio, setPpqRatio] = useState(1);
    const [gameMode, setGameMode] = useState<'standard' | 'practice'>('standard');
    const [waitingForNotes, setWaitingForNotesState] = useState<number[]>([]);
    const waitingForNotesRef = React.useRef<number[]>([]);
    const [selectedSong, setSelectedSong] = useState<string | null>(null);

    const setWaitingForNotes = useCallback((notes: number[]) => {
        waitingForNotesRef.current = notes;
        setWaitingForNotesState(notes);
    }, []);

    const resumePractice = useCallback(() => {
        setWaitingForNotes([]);
        waitingForNotesRef.current = [];
        Tone.getTransport().ticks += 1;
        Tone.getTransport().start();
    }, [setWaitingForNotes]);

    const seek = useCallback((ticks: number) => {
        setWaitingForNotes([]);
        waitingForNotesRef.current = [];
        Tone.getTransport().ticks = ticks;
        setPlayPosition(ticks);
    }, [setWaitingForNotes]);

    const removeWaitingNote = useCallback((note: number) => {
        setWaitingForNotesState(prev => {
            const next = prev.filter(n => n !== note);
            waitingForNotesRef.current = next; // Sync ref manually

            // If we cleared all notes we were waiting for, resume!
            if (next.length === 0 && prev.length > 0) {
                console.log("All waiting notes cleared. Resuming!");
                Tone.getTransport().start();
            }
            return next;
        });
    }, []);

    const loadMidiData = useCallback((base64: string) => {
        import('@tonejs/midi').then(({ Midi }) => {
            try {
                const binaryString = window.atob(base64);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const midi = new Midi(bytes);

                const tonePPQ = Tone.getTransport().PPQ;
                const midiPPQ = midi.header.ppq;
                const ppqRatio = tonePPQ / midiPPQ;
                const adjustedTicks = midi.durationTicks * ppqRatio;

                console.log(`Midi Loaded. PPQ[Tone/Midi]: ${tonePPQ}/${midiPPQ}. DurationTicks: ${midi.durationTicks} -> ${adjustedTicks}`);

                setPlaySize(midi.duration);
                setPlaySizeTicks(adjustedTicks);
                setMidiData(midi);
                setPpqRatio(ppqRatio);
            } catch (error) {
                console.error("Error parsing MIDI data:", error);
            }
        });
    }, []);

    return (
        <GameContext.Provider value={{
            isPlaying,
            setIsPlaying,
            tempo,
            setTempo,
            currentMeasure,
            setCurrentMeasure,
            isAudioStarted,
            setAudioStarted,
            isMetronomeMuted,
            setMetronomeMuted,
            pianoRange,
            setPianoRange,
            playSize,
            setPlaySize,
            playSizeTicks,
            setPlaySizeTicks,
            playPosition,
            setPlayPosition,
            loadMidiData,
            midiData,
            ppqRatio,
            gameMode,
            setGameMode,
            waitingForNotes,
            setWaitingForNotes,
            removeWaitingNote,
            resumePractice,
            seek,
            waitingForNotesRef,
            selectedSong,
            setSelectedSong,
            instrument
        }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = () => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};

// Hook to manage MIDI File Duration and Limits
export const useMidiFile = () => {
    const { playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, midiData, ppqRatio, setWaitingForNotes, waitingForNotes } = useGame();

    const { waitingForNotesRef } = useGame();

    useEffect(() => {
        if (!playSizeTicks || !isPlaying) return;

        const interval = setInterval(() => {
            const now = Tone.Transport.ticks;
            setPlayPosition(now);

            // END OF SONG CHECK
            if (now >= playSizeTicks) {
                Tone.getTransport().pause();
                setIsPlaying(false);
                Tone.getTransport().ticks = 0;
                setPlayPosition(0);
                setWaitingForNotes([]);
                return;
            }

            // PRACTICE MODE CHECK
            if (gameMode === 'practice' && midiData) {

                if (waitingForNotesRef.current.length > 0) {
                    if (Tone.getTransport().state !== 'paused') {
                        Tone.getTransport().pause();
                    }
                    return;
                }

                // Lookahead Calculation based on Tempo and Poll Interval

                const intervalSec = 0.050; // 50ms
                const currentBpm = Tone.getTransport().bpm.value;
                const ppq = Tone.getTransport().PPQ;
                const ticksPerSecond = (currentBpm / 60) * ppq;
                const ticksPerPoll = ticksPerSecond * intervalSec;

                // Safety factor of 1.5 to ensure overlap between checks
                const dynamicCheckAhead = Math.max(20, ticksPerPoll * 1.5);

                const OFFSET_TICKS = 0 * 192; // 4 beats count-in

                // 1. Find the Closest Next Target Time
                let closestTick = Infinity;

                midiData.tracks.forEach(track => {
                    track.notes.forEach(note => {
                        const start = (note.ticks * ppqRatio) + OFFSET_TICKS;
                        // Determine if this note is in the future
                        if (start > now && start < closestTick) {
                            closestTick = start;
                        }
                    });
                });

                // 2. If closest tick is imminent, Gather ALL notes at that tick
                if (closestTick !== Infinity && (closestTick - now) < dynamicCheckAhead) {
                    // Tolerance for "At that tick" since floating point math
                    // Increased to 15 ticks (~30-40ms) to group humanized chords
                    const TICK_EPSILON = 15;

                    // Anti-bounce handled by resumePractice jumping forward +16 ticks
                    const notesAtTick: number[] = [];

                    midiData.tracks.forEach(track => {
                        track.notes.forEach(note => {
                            const start = (note.ticks * ppqRatio) + OFFSET_TICKS;
                            if (Math.abs(start - closestTick) < TICK_EPSILON) {
                                notesAtTick.push(note.midi);
                            }
                        });
                    });

                    // Remove duplicates
                    const uniqueNotes = Array.from(new Set(notesAtTick));

                    if (uniqueNotes.length > 0) {
                        console.log(`Pausing for notes [${uniqueNotes.join(', ')}] at ${closestTick} (Lookahead: ${dynamicCheckAhead.toFixed(1)})`);
                        Tone.getTransport().pause();
                        Tone.getTransport().ticks = closestTick;
                        setPlayPosition(closestTick);
                        setWaitingForNotes(uniqueNotes);
                    }
                }
            }

        }, 50); // 50ms interval

        return () => clearInterval(interval);
    }, [playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, midiData, ppqRatio, waitingForNotes, setWaitingForNotes]);
};

// Hook to manage Drum Loop Duration and Limits
export const useDrumsMidiFile = () => {
    const { playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, midiData, ppqRatio, setWaitingForNotes, waitingForNotes, seek } = useGame();

    const { waitingForNotesRef } = useGame();

    useEffect(() => {
        if (!playSizeTicks || !isPlaying) return;

        const interval = setInterval(() => {
            const now = Tone.Transport.ticks;
            setPlayPosition(now);

            // END OF SONG CHECK
            if (now >= playSizeTicks) {
                // Instantly loop back to the start of the pattern (skipping intro measure)
                seek(192);
                return;
            }

            // PRACTICE MODE CHECK
            if (gameMode === 'practice' && midiData) {

                if (waitingForNotesRef.current.length > 0) {
                    if (Tone.getTransport().state !== 'paused') {
                        Tone.getTransport().pause();
                    }
                    return;
                }

                // Lookahead Calculation based on Tempo and Poll Interval

                const intervalSec = 0.050; // 50ms
                const currentBpm = Tone.getTransport().bpm.value;
                const ppq = Tone.getTransport().PPQ;
                const ticksPerSecond = (currentBpm / 60) * ppq;
                const ticksPerPoll = ticksPerSecond * intervalSec;

                // Safety factor of 1.5 to ensure overlap between checks
                const dynamicCheckAhead = Math.max(20, ticksPerPoll * 1.5);

                const OFFSET_TICKS = 0 * 192; // 4 beats count-in

                // 1. Find the Closest Next Target Time
                let closestTick = Infinity;

                midiData.tracks.forEach(track => {
                    track.notes.forEach(note => {
                        const start = (note.ticks * ppqRatio) + OFFSET_TICKS;
                        // Determine if this note is in the future
                        if (start > now && start < closestTick) {
                            closestTick = start;
                        }
                    });
                });

                // 2. If closest tick is imminent, Gather ALL notes at that tick
                if (closestTick !== Infinity && (closestTick - now) < dynamicCheckAhead) {
                    // Tolerance for "At that tick" since floating point math
                    // Increased to 15 ticks (~30-40ms) to group humanized chords
                    const TICK_EPSILON = 15;

                    // Anti-bounce handled by resumePractice jumping forward +16 ticks
                    const notesAtTick: number[] = [];

                    midiData.tracks.forEach(track => {
                        track.notes.forEach(note => {
                            const start = (note.ticks * ppqRatio) + OFFSET_TICKS;
                            if (Math.abs(start - closestTick) < TICK_EPSILON) {
                                notesAtTick.push(note.midi);
                            }
                        });
                    });

                    // Remove duplicates
                    const uniqueNotes = Array.from(new Set(notesAtTick));

                    if (uniqueNotes.length > 0) {
                        console.log(`Pausing for notes [${uniqueNotes.join(', ')}] at ${closestTick} (Lookahead: ${dynamicCheckAhead.toFixed(1)})`);
                        Tone.getTransport().pause();
                        Tone.getTransport().ticks = closestTick;
                        setPlayPosition(closestTick);
                        setWaitingForNotes(uniqueNotes);
                    }
                }
            }

        }, 50); // 50ms interval

        return () => clearInterval(interval);
    }, [playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, midiData, ppqRatio, waitingForNotes, setWaitingForNotes, seek]);
};


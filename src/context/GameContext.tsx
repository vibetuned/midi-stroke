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
}

const GameContext = createContext<GameState | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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
        // Epsilon is 15. We must jump just enough to escape strict equality checks if any.
        // Actually, reducing to +1 tick to verify if it solves "Skipping Note" issue.
        // Logic: If closestTick was X. Now is X.
        // Loop finds next note > X.
        // If we jump +1, Now is X+1.
        // Notes at X are ignored. Notes at X+0.something are ignored.
        // Notes at X+2 are found.
        Tone.getTransport().ticks += 1;
        Tone.getTransport().start();
    }, [setWaitingForNotes]);

    const seek = useCallback((ticks: number) => {
        setWaitingForNotes([]);
        waitingForNotesRef.current = [];
        Tone.getTransport().ticks = ticks;
        setPlayPosition(ticks);
        // If we were paused for a note, we should probably stay paused transport-wise
        // until user plays or hits play, but clearing waitingForNotes allows the loop to find the *new* next note.
    }, []);

    const removeWaitingNote = useCallback((note: number) => {
        // We use setWaitingForNotesState directly here because we need previous state calculation
        // But we must also update the ref!
        // Actually, removeWaitingNote is NO LONGER USED in the new logic (separate split).
        // It was used when we removed notes one by one.
        // We can keep it for safety or remove it.
        // If we keep it, we need to fix the type error.
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
            setSelectedSong
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
    // We access the context via useGame inside the hook if needed, but here we can just pull what we need.
    const { playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, midiData, ppqRatio, setWaitingForNotes, waitingForNotes } = useGame();

    // We need to access the Ref directly from the context if exposed, OR we can't fully fix the race condition
    // unless the Ref is exposed via the Context Value.
    // However, we didn't expose the Ref in the Interface. 
    // BUT: setWaitingForNotes updates the ref inside the GameProvider.
    // AND: We effectively need the LOOP to read the Ref.
    // The LOOP is defined inside useMidiFile.

    // PROBLEM: useMidiFile DOES NOT have access to 'waitingForNotesRef' from GameContext because it's not in the context value.
    // We must expose it or move the logic.
    // Let's modify the Context Interface to expose a way to check if we are waiting synchronously? Or just expose the ref?
    // Exposing Ref directly in context is fine.

    // For now, let's assume we update the Context Interface below this block.
    // Wait, I can't update interface in this tool call block effectively if I don't see it.
    // usage: const { waitingForNotesRef } = useGame();

    // Actually, I should probably split this tool call to update interface first?
    // No, I can do it in one file.

    // Let's just fix the loop assuming we expose it.
    const { waitingForNotesRef } = useGame();

    // Use Tone.Transport.ticks to track progress.
    // Removed lastPausedTick as it conflicts with seek/reset operations.
    // Instead we rely on 'resumePractice' advancing the cursor past the current event.

    // Check Limits Loop & Practice Mode Pausing
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
                // If we are already waiting, ensure we are paused
                // Use Ref for synchronous check to avoid race conditions with Interval
                if (waitingForNotesRef.current.length > 0) {
                    if (Tone.getTransport().state !== 'paused') {
                        Tone.getTransport().pause();
                    }
                    return;
                }

                // Look ahead
                const CHECK_AHEAD = 20; // ticks
                const OFFSET_TICKS = 1 * 192; // 4 beats count-in

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
                if (closestTick !== Infinity && (closestTick - now) < CHECK_AHEAD) {
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
                        console.log(`Pausing for notes [${uniqueNotes.join(', ')}] at ${closestTick}`);
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

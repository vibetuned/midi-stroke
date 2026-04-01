import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode, useCallback } from 'react';
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

// Fix 2: pre-sort all notes into a flat array once per MIDI load so the
// practice-mode interval can use a forward-advancing cursor instead of
// scanning every note on every 50 ms tick (O(1) amortised vs O(n)).
function buildSortedNotes(midi: Midi, ratio: number): Array<{ tick: number; midi: number }> {
    const flat: Array<{ tick: number; midi: number }> = [];
    midi.tracks.forEach(track => {
        track.notes.forEach(note => {
            flat.push({ tick: note.ticks * ratio, midi: note.midi });
        });
    });
    return flat.sort((a, b) => a.tick - b.tick);
}

// Hook to manage MIDI File Duration and Limits
export const useMidiFile = () => {
    const { playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, midiData, ppqRatio, setWaitingForNotes, waitingForNotes } = useGame();

    const { waitingForNotesRef } = useGame();

    // Fix 2: sorted notes cache + forward cursor (rebuilt whenever midiData changes)
    const sortedNotesRef = useRef<Array<{ tick: number; midi: number }>>([]);
    const noteCursorRef = useRef(0);
    const prevNowRef = useRef(0);

    useEffect(() => {
        if (!midiData) { sortedNotesRef.current = []; return; }
        sortedNotesRef.current = buildSortedNotes(midiData, ppqRatio);
        noteCursorRef.current = 0;
    }, [midiData, ppqRatio]);

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

                const sorted = sortedNotesRef.current;

                // Fix 2: reset cursor on backward seek (e.g. user dragged back)
                if (now < prevNowRef.current - 50) {
                    let lo = 0, hi = sorted.length;
                    while (lo < hi) {
                        const mid = (lo + hi) >> 1;
                        if (sorted[mid].tick <= now) lo = mid + 1;
                        else hi = mid;
                    }
                    noteCursorRef.current = lo;
                }
                prevNowRef.current = now;

                // Advance cursor past notes we have already passed
                while (noteCursorRef.current < sorted.length && sorted[noteCursorRef.current].tick <= now) {
                    noteCursorRef.current++;
                }

                const cursorPos = noteCursorRef.current;
                const closestTick = cursorPos < sorted.length ? sorted[cursorPos].tick : Infinity;

                // If closest tick is imminent, gather ALL notes at that tick
                if (closestTick !== Infinity && (closestTick - now) < dynamicCheckAhead) {
                    // Fix 6: scale epsilon with tempo so difficulty feels consistent
                    // at 120 BPM = 15 ticks; at 60 BPM = 30 ticks; at 180 BPM = 10 ticks
                    const TICK_EPSILON = Math.round((120 / currentBpm) * 15);

                    const notesAtTick: number[] = [];
                    let i = cursorPos;
                    while (i < sorted.length && sorted[i].tick - closestTick < TICK_EPSILON) {
                        notesAtTick.push(sorted[i].midi);
                        i++;
                    }

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

// MEI pitch-based MIDI note → primary pad MIDI note
// Verovio renders drum notes as pitched MIDI (f4=65, c5=72, etc.)
const MEI_TO_PAD: Record<number, number> = {
    65: 36, // BassDrum    (f4)
    72: 38, // SnareDrum   (c5)
    79: 42, // ClosedHiHat (g5)
    81: 49, // Cymbal      (a5)
    69: 41, // LowTom      (a4)
    74: 45, // MediumTom   (d5)
    76: 48, // HighTom     (e5)
};

// Hook to manage Drum Loop Duration and Limits
export const useDrumsMidiFile = () => {
    const { playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, midiData, ppqRatio, setWaitingForNotes, waitingForNotes, seek } = useGame();

    const { waitingForNotesRef } = useGame();

    // Fix 2: sorted notes cache + forward cursor
    const sortedNotesRef = useRef<Array<{ tick: number; midi: number }>>([]);
    const noteCursorRef = useRef(0);
    const prevNowRef = useRef(0);

    useEffect(() => {
        if (!midiData) { sortedNotesRef.current = []; return; }
        sortedNotesRef.current = buildSortedNotes(midiData, ppqRatio);
        noteCursorRef.current = 0;
    }, [midiData, ppqRatio]);

    useEffect(() => {
        if (!playSizeTicks || !isPlaying) return;

        const interval = setInterval(() => {
            const now = Tone.Transport.ticks;
            setPlayPosition(now);

            // END OF SONG CHECK
            if (now >= playSizeTicks) {
                // Instantly loop back to the start of the pattern (skipping intro measure)
                seek(144);
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

                const sorted = sortedNotesRef.current;

                // Fix 2: reset cursor on backward seek
                if (now < prevNowRef.current - 50) {
                    let lo = 0, hi = sorted.length;
                    while (lo < hi) {
                        const mid = (lo + hi) >> 1;
                        if (sorted[mid].tick <= now) lo = mid + 1;
                        else hi = mid;
                    }
                    noteCursorRef.current = lo;
                }
                prevNowRef.current = now;

                // Advance cursor past notes we have already passed
                while (noteCursorRef.current < sorted.length && sorted[noteCursorRef.current].tick <= now) {
                    noteCursorRef.current++;
                }

                const cursorPos = noteCursorRef.current;
                const closestTick = cursorPos < sorted.length ? sorted[cursorPos].tick : Infinity;

                // If closest tick is imminent, gather ALL notes at that tick
                if (closestTick !== Infinity && (closestTick - now) < dynamicCheckAhead) {
                    // Fix 6: tempo-adaptive epsilon
                    const TICK_EPSILON = Math.round((120 / currentBpm) * 15);

                    const notesAtTick: number[] = [];
                    let i = cursorPos;
                    while (i < sorted.length && sorted[i].tick - closestTick < TICK_EPSILON) {
                        const padNote = MEI_TO_PAD[sorted[i].midi];
                        if (padNote !== undefined) notesAtTick.push(padNote);
                        i++;
                    }

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


import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode, useCallback } from 'react';
import * as Tone from 'tone';

import type { TimemapData } from '../utils/timemap';

export type HandSelection = 'right' | 'left' | 'both';

/** Piano-only: which hand(s) should be played. Track 0 = right (treble), track 1 = left (bass). */
export function isTrackActiveForHand(trackIndex: number, hand: HandSelection): boolean {
    if (hand === 'both') return true;
    if (hand === 'right') return trackIndex === 0;
    return trackIndex === 1; // left
}

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
    playSizeTicks: number;
    setPlaySizeTicks: (ticks: number) => void;
    playPosition: number;
    setPlayPosition: (pos: number) => void;
    /** Verovio timemap for the loaded song — the single source of truth for
     *  note onsets, durations, measure ticks and song length. */
    timemap: TimemapData | null;
    loadTimemap: (data: TimemapData) => void;
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
    instrument: 'piano' | 'drums' | 'saxo' | 'theory';
    /** Base URL of the connected score server (see server/README.md), or null when using bundled files. */
    serverBase: string | null;
    setServerBase: (base: string | null) => void;
    songCompleted: boolean;
    setSongCompleted: (v: boolean) => void;
    handSelection: HandSelection;
    setHandSelection: (h: HandSelection) => void;
}

const GameContext = createContext<GameState | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode, instrument?: 'piano' | 'drums' | 'saxo' | 'theory' }> = ({ children, instrument = 'piano' }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [tempo, setTempo] = useState(120);
    const [currentMeasure, setCurrentMeasure] = useState(1);
    const [isAudioStarted, setAudioStarted] = useState(false);
    const [isMetronomeMuted, setMetronomeMuted] = useState(false);
    const [pianoRange, setPianoRange] = useState<{ min: number; max: number } | null>(null);
    const [playSizeTicks, setPlaySizeTicks] = useState(0);
    const [playPosition, setPlayPosition] = useState(0);
    const [timemap, setTimemap] = useState<TimemapData | null>(null);
    const [gameMode, setGameMode] = useState<'standard' | 'practice'>('standard');
    const [waitingForNotes, setWaitingForNotesState] = useState<number[]>([]);
    const waitingForNotesRef = React.useRef<number[]>([]);
    const [selectedSong, setSelectedSong] = useState<string | null>(null);
    const [serverBase, setServerBase] = useState<string | null>(null);
    const [songCompleted, setSongCompleted] = useState(false);
    const [handSelection, setHandSelection] = useState<HandSelection>('both');

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
                // Nudge past the pause point so the transport-scheduled pause
                // event at this exact tick doesn't immediately re-fire.
                Tone.getTransport().ticks += 1;
                Tone.getTransport().start();
            }
            return next;
        });
    }, []);

    const loadTimemap = useCallback((data: TimemapData) => {
        console.log(`Timemap loaded. Onsets: ${data.onsets.length}, totalTicks: ${data.totalTicks}`);
        setTimemap(data);
        // Song length: end of the last measure.
        setPlaySizeTicks(data.totalTicks);
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
            playSizeTicks,
            setPlaySizeTicks,
            playPosition,
            setPlayPosition,
            timemap,
            loadTimemap,
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
            instrument,
            serverBase,
            setServerBase,
            songCompleted,
            setSongCompleted,
            handSelection,
            setHandSelection,
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

/**
 * Practice pause points are scheduled directly on the Tone transport at the
 * exact onset ticks from the Verovio timemap. Unlike the previous 50 ms
 * polling lookahead, a scheduled event cannot be jumped over by a late timer
 * tick — which is what made 16th/32nd notes skip at higher tempi. The timemap
 * also pre-groups chords (one entry per musical moment), so no epsilon-based
 * note gathering is needed.
 *
 * `mapNotes` turns an onset's notes into the MIDI numbers to wait for
 * (hand filtering for piano, pad mapping for drums); returning [] skips the
 * pause point entirely.
 */
function usePracticePauseSchedule(
    mapNotes: (notes: TimemapData['onsets'][number]['notes']) => number[],
) {
    const { timemap, gameMode, setPlayPosition, setWaitingForNotes } = useGame();

    // Read via refs inside transport callbacks so a mode/handler change never
    // forces a full reschedule of every event.
    const gameModeRef = useRef(gameMode);
    useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
    const mapNotesRef = useRef(mapNotes);
    useEffect(() => { mapNotesRef.current = mapNotes; }, [mapNotes]);

    useEffect(() => {
        if (!timemap) return;
        const transport = Tone.getTransport();
        const ids: number[] = [];

        for (const onset of timemap.onsets) {
            const id = transport.schedule(() => {
                if (gameModeRef.current !== 'practice') return;
                const notes = Array.from(new Set(mapNotesRef.current(onset.notes)));
                if (notes.length === 0) return;
                console.log(`Pausing for notes [${notes.join(', ')}] at ${onset.tick}`);
                transport.pause();
                // The callback fires within the audio lookahead window, so the
                // transport is a hair before the onset — snap to the exact tick.
                transport.ticks = onset.tick;
                setPlayPosition(onset.tick);
                setWaitingForNotes(notes);
            }, `${onset.tick}i`);
            ids.push(id);
        }

        return () => { ids.forEach(id => transport.clear(id)); };
    }, [timemap, setPlayPosition, setWaitingForNotes]);
}

// Hook to manage MIDI File Duration and Limits
export const useMidiFile = () => {
    const { playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, setWaitingForNotes, setSongCompleted, handSelection } = useGame();

    const { waitingForNotesRef } = useGame();

    // Piano hand selection: staff 1 = right hand, staff 2 = left hand — same
    // ordering as the MIDI tracks used elsewhere (track 0 = right, 1 = left).
    usePracticePauseSchedule(
        useCallback(
            notes => notes
                .filter(n => isTrackActiveForHand(n.staff - 1, handSelection))
                .map(n => n.midi),
            [handSelection],
        ),
    );

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
                setSongCompleted(true);
                return;
            }

            // While waiting for notes in practice mode, keep the transport
            // paused even if the user hits play.
            if (gameMode === 'practice' && waitingForNotesRef.current.length > 0) {
                if (Tone.getTransport().state !== 'paused') {
                    Tone.getTransport().pause();
                }
            }

        }, 50); // 50ms interval

        return () => clearInterval(interval);
    }, [playSizeTicks, isPlaying, setIsPlaying, setPlayPosition, gameMode, setWaitingForNotes, setSongCompleted, waitingForNotesRef]);
};

// MEI pitch-based MIDI note → primary pad MIDI note
// Verovio renders drum notes as pitched MIDI (f4=65, c5=72, etc.)
const MEI_TO_PAD: Record<number, number> = {
    65: 36, // BassDrum    (f4)
    72: 38, // SnareDrum   (c5)
    79: 42, // ClosedHiHat (g5)
    81: 49, // Cymbal      (a5)
    69: 43, // LowTom      (a4)
    74: 47, // MediumTom   (d5)
    76: 48, // HighTom     (e5)
};

// Hook to manage Drum Loop Duration and Limits
export const useDrumsMidiFile = () => {
    const { playSizeTicks, isPlaying, setPlayPosition, gameMode, seek, setSongCompleted } = useGame();

    const { waitingForNotesRef } = useGame();

    // Drums wait on pad notes: map Verovio's pitched rendering to pads and
    // drop anything without a pad (no hand filtering for drums).
    usePracticePauseSchedule(
        useCallback(
            notes => notes
                .map(n => MEI_TO_PAD[n.midi])
                .filter((pad): pad is number => pad !== undefined),
            [],
        ),
    );

    useEffect(() => {
        if (!playSizeTicks || !isPlaying) return;

        const interval = setInterval(() => {
            const now = Tone.Transport.ticks;
            setPlayPosition(now);

            // END OF SONG CHECK
            if (now >= playSizeTicks) {
                setSongCompleted(true);
                seek(144);
                return;
            }

            // While waiting for notes in practice mode, keep the transport
            // paused even if the user hits play.
            if (gameMode === 'practice' && waitingForNotesRef.current.length > 0) {
                if (Tone.getTransport().state !== 'paused') {
                    Tone.getTransport().pause();
                }
            }

        }, 50); // 50ms interval

        return () => clearInterval(interval);
    }, [playSizeTicks, isPlaying, setPlayPosition, gameMode, seek, setSongCompleted, waitingForNotesRef]);
};


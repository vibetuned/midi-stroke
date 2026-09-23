import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode, useCallback } from 'react';
import { padForScoreNote } from '../utils/drumKit';
import * as Tone from 'tone';

import type { TimemapData } from '../utils/timemap';
import { effectiveBpm, type TempoMap } from '../utils/tempo';
import type { PlaybackTarget } from '../utils/playback';
import type { LoopRange } from '../utils/loopRange';

/** Where playback sends notes; remembered across sessions. */
const PLAYBACK_TARGET_KEY = 'midi-stroke-playback-target';

export type GameMode = 'standard' | 'practice' | 'ear';

/** Slider limits, wide enough for real scores (Bartók's Mikrokosmos marks 160). */
export const TEMPO_MIN = 20;
export const TEMPO_MAX = 240;

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
    /** The slider: the piece's opening tempo in quarter notes per minute.
     *  Set by the user; loading a score that states a tempo moves it there. */
    setTempo: (tempo: number) => void;
    /** What the loaded score says about its own tempo (null when nothing). */
    scoreTempo: TempoMap | null;
    currentMeasure: number;
    setCurrentMeasure: (measure: number) => void;
    isAudioStarted: boolean;
    setAudioStarted: (started: boolean) => void;
    isMetronomeMuted: boolean;
    setMetronomeMuted: (muted: boolean) => void;
    /** Where a played score goes: 'off', 'audio', or a MIDI output port name.
     *  Shared by the transport and the exercise builders' audition button. */
    playbackTarget: PlaybackTarget;
    setPlaybackTarget: (target: PlaybackTarget) => void;
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
    /** Rhythm (`standard`), Practice, or Learn by ear (`ear`, piano and saxo). */
    gameMode: GameMode;
    setGameMode: (mode: GameMode) => void;
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
    /** Bars chosen on the minimap (null = the whole piece): looped in rhythm
     *  and practice, the melody to learn by ear. Cleared by a new score. */
    loopRange: LoopRange | null;
    setLoopRange: (range: LoopRange | null) => void;
}

const GameContext = createContext<GameState | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode, instrument?: 'piano' | 'drums' | 'saxo' | 'theory' }> = ({ children, instrument = 'piano' }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [tempo, setTempoState] = useState(120);
    // The tempo the user picked for pieces that state none, so a score's own
    // tempo never leaks into the next unmarked piece: marked pieces open at
    // their marking, unmarked ones at your last choice.
    const manualTempoRef = useRef(120);
    const scoreTempoRef = useRef<TempoMap | null>(null);
    const setTempo = useCallback((bpm: number) => {
        const clamped = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(bpm)));
        setTempoState(clamped);
        if (!scoreTempoRef.current?.initial) manualTempoRef.current = clamped;
    }, []);
    const [currentMeasure, setCurrentMeasure] = useState(1);
    const [isAudioStarted, setAudioStarted] = useState(false);
    const [isMetronomeMuted, setMetronomeMuted] = useState(false);
    // Remembered across sessions: picking your synth again every time is a chore.
    const [playbackTarget, setPlaybackTargetState] = useState<PlaybackTarget>(
        () => localStorage.getItem(PLAYBACK_TARGET_KEY) ?? 'off',
    );
    const setPlaybackTarget = useCallback((target: PlaybackTarget) => {
        setPlaybackTargetState(target);
        try { localStorage.setItem(PLAYBACK_TARGET_KEY, target); } catch { /* private mode */ }
    }, []);
    const [pianoRange, setPianoRange] = useState<{ min: number; max: number } | null>(null);
    const [playSizeTicks, setPlaySizeTicks] = useState(0);
    const [playPosition, setPlayPosition] = useState(0);
    const [timemap, setTimemap] = useState<TimemapData | null>(null);
    const [gameMode, setGameMode] = useState<GameMode>('standard');
    const [waitingForNotes, setWaitingForNotesState] = useState<number[]>([]);
    const waitingForNotesRef = React.useRef<number[]>([]);
    const [selectedSong, setSelectedSong] = useState<string | null>(null);
    const [serverBase, setServerBase] = useState<string | null>(null);
    const [songCompleted, setSongCompleted] = useState(false);
    const [handSelection, setHandSelection] = useState<HandSelection>('both');
    const [loopRange, setLoopRangeState] = useState<LoopRange | null>(null);

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

    // Choosing a range puts the playhead inside it, rather than leaving it
    // wherever it was — possibly bars away from what is about to loop.
    const setLoopRange = useCallback((range: LoopRange | null) => {
        setLoopRangeState(range);
        const ticks = Tone.getTransport().ticks;
        if (range && (ticks < range.start || ticks >= range.end)) seek(range.start);
    }, [seek]);

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
        setLoopRangeState(null);
        // Song length: end of the last measure.
        setPlaySizeTicks(data.totalTicks);
        // A score that states its tempo opens at it; one that does not opens
        // at whatever the user last chose for such pieces.
        const map = data.tempo?.initial ? data.tempo : null;
        scoreTempoRef.current = map;
        setTempoState(map
            ? Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(map.initial!.bpm)))
            : manualTempoRef.current);
    }, []);

    // The transport's BPM is owned here, because it depends on the slider, the
    // score's tempo map and where the playhead is. A score with tempo changes
    // is followed as it plays — polling, not scheduled events, so seeking back
    // across a change restores the earlier tempo too.
    const scoreTempo = timemap?.tempo?.initial ? timemap.tempo : null;
    useEffect(() => {
        const transport = Tone.getTransport();
        const apply = () => {
            const bpm = effectiveBpm(scoreTempo, transport.ticks, tempo);
            if (Math.abs(transport.bpm.value - bpm) > 1e-3) transport.bpm.value = bpm;
        };
        apply();
        if (!scoreTempo || scoreTempo.marks.length < 2) return;
        const id = setInterval(apply, 40);
        return () => clearInterval(id);
    }, [tempo, scoreTempo]);

    // The loop is the transport's own: Tone wraps from the end of the range
    // back to its start on the audio clock, and events at the start tick fire
    // again on each pass — so the practice pauses and score playback, both
    // scheduled on the transport, simply happen again. By ear the transport
    // is not used; the range picks the melody instead (EarTrainingProvider).
    useEffect(() => {
        const transport = Tone.getTransport();
        if (!loopRange || gameMode === 'ear') {
            transport.loop = false;
            return;
        }
        transport.setLoopPoints(`${loopRange.start}i`, `${loopRange.end}i`);
        transport.loop = true;
        return () => { transport.loop = false; };
    }, [loopRange, gameMode]);

    return (
        <GameContext.Provider value={{
            isPlaying,
            setIsPlaying,
            tempo,
            setTempo,
            scoreTempo,
            currentMeasure,
            setCurrentMeasure,
            isAudioStarted,
            setAudioStarted,
            isMetronomeMuted,
            playbackTarget,
            setPlaybackTarget,
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
            loopRange,
            setLoopRange,
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

// Hook to manage Drum Loop Duration and Limits
export const useDrumsMidiFile = () => {
    const { playSizeTicks, isPlaying, setPlayPosition, gameMode, seek, setSongCompleted } = useGame();

    const { waitingForNotesRef } = useGame();

    // Drums wait on pad notes: map Verovio's pitched rendering to pads and
    // drop anything without a pad (no hand filtering for drums).
    usePracticePauseSchedule(
        useCallback(
            notes => notes
                // Verovio renders drum notes as pitches; the notehead separates
                // the voices that share a staff position (see drumKit.ts).
                .map(n => padForScoreNote(n.midi, n.head))
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


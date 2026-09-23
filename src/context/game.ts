import { createContext, useContext } from 'react';
import type { TimemapData } from '../utils/timemap';
import type { TempoMap } from '../utils/tempo';
import type { PlaybackTarget } from '../utils/playback';
import type { LoopRange } from '../utils/loopRange';

/**
 * The game state every app shares — transport, tempo, mode, the loaded
 * score — as the rest of the app sees it: its types, the context, and
 * useGame(). Provided by GameProvider (context/GameContext.tsx); kept apart
 * from it so that file exports only a component and hot reload keeps working.
 */

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

export interface GameState {
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    /** The piece's opening tempo in quarter notes per minute, as the
     *  transport plays it: the slider's, or the accompaniment's (tempoLock). */
    tempo: number;
    /** The slider. Set by the user; loading a score that states a tempo moves
     *  it there. Ignored while tempoLock holds. */
    setTempo: (tempo: number) => void;
    /** In rhythm mode, a song with an accompaniment plays at the tempo its
     *  recording was synced to (hooks/useAccompaniment.ts); null otherwise. */
    tempoLock: number | null;
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

export const GameContext = createContext<GameState | undefined>(undefined);

export const useGame = () => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};

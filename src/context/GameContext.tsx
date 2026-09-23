import React, { useState, useEffect, useRef, type ReactNode, useCallback } from 'react';
import * as Tone from 'tone';

import type { TimemapData } from '../utils/timemap';
import { effectiveBpm, type TempoMap } from '../utils/tempo';
import type { PlaybackTarget } from '../utils/playback';
import type { LoopRange } from '../utils/loopRange';
import { GameContext, TEMPO_MAX, TEMPO_MIN, type GameMode, type HandSelection } from './game';
import { useAccompanimentFor } from '../hooks/useAccompaniment';

/** Where playback sends notes; remembered across sessions. */
const PLAYBACK_TARGET_KEY = 'midi-stroke-playback-target';

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
    // A recording plays at one tempo: while it accompanies the piece (rhythm
    // mode, piano and saxo), the transport follows it, not the slider.
    const accompaniment = useAccompanimentFor(instrument === 'piano' || instrument === 'saxo' ? selectedSong : null);
    const tempoLock = gameMode === 'standard' && accompaniment ? accompaniment.bpm : null;
    const transportTempo = tempoLock ?? tempo;
    useEffect(() => {
        const transport = Tone.getTransport();
        const apply = () => {
            const bpm = effectiveBpm(scoreTempo, transport.ticks, transportTempo);
            if (Math.abs(transport.bpm.value - bpm) > 1e-3) transport.bpm.value = bpm;
        };
        apply();
        if (!scoreTempo || scoreTempo.marks.length < 2) return;
        const id = setInterval(apply, 40);
        return () => clearInterval(id);
    }, [transportTempo, scoreTempo]);

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
            tempo: transportTempo,
            setTempo,
            tempoLock,
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

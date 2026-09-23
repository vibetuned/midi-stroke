import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useGame } from '../context/GameContext';
import { useMidi } from '../hooks/useMidi';
import { EarTrainingContext, type EarTrainingValue } from '../context/earTraining';
import {
    callTimemap, earReducer, extractMelody, initialEarState, stavesWithNotes,
    type EarAction, type EarRhythm, type EarStaff, type EarState, type MelodyNote,
} from '../utils/earTraining';
import { playTimemap } from '../utils/playback';

/** The pause between a completed response and the longer call. */
const BREATH_MS = 500;

/**
 * Runs a Learn by ear session: sounds each call, listens to the keyboard on
 * the student's turn, plays the error cue, and keeps the page scrolled to the
 * frontier. The rules themselves live in utils/earTraining.ts.
 */
export const EarTrainingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        gameMode, setGameMode, timemap, handSelection, setHandSelection, tempo,
        playbackTarget, seek, isPlaying, setIsPlaying, isMetronomeMuted,
    } = useGame();
    const { lastNote } = useMidi();

    const active = gameMode === 'ear' && !!timemap;
    const staff: EarStaff = handSelection === 'left' ? 2 : 1;
    const staves = useMemo(() => (timemap ? stavesWithNotes(timemap) : []), [timemap]);
    const melody: MelodyNote[] = useMemo(
        () => (active && timemap ? extractMelody(timemap, staff) : []),
        [active, timemap, staff],
    );
    const targets = useMemo(() => melody.map(m => m.midi), [melody]);

    const [rhythm, setRhythm] = useState<EarRhythm>('written');
    const [exactOctave, setExactOctave] = useState(true);

    // A new melody — another piece, the other staff, the mode switched — is a
    // new session. Reset while rendering rather than in an effect, so there is
    // never a frame showing the old session over the new score.
    const [store, setStore] = useState<{ melody: MelodyNote[]; state: EarState }>(
        () => ({ melody, state: initialEarState(melody.length) }),
    );
    let state = store.state;
    if (store.melody !== melody) {
        state = initialEarState(melody.length);
        setStore({ melody, state });
    }

    const send = useCallback((action: EarAction) => {
        setStore(st => ({ ...st, state: earReducer(st.state, action, targets, exactOctave) }));
    }, [targets, exactOctave]);

    // Entering the mode stops the transport: the session drives itself.
    useEffect(() => {
        if (gameMode === 'ear' && isPlaying) setIsPlaying(false);
    }, [gameMode, isPlaying, setIsPlaying]);

    // The call. Always audible: with playback off it still plays in sound; with
    // a MIDI output chosen, the call goes there like any other playback.
    const tempoRef = useRef(tempo);
    useEffect(() => { tempoRef.current = tempo; }, [tempo]);
    useEffect(() => {
        if (state.phase !== 'call' || melody.length === 0) return;
        const data = callTimemap(melody, state.k, rhythm, timemap?.tempo);
        let settled = false;
        const handle = playTimemap(data, {
            bpm: tempoRef.current,
            target: playbackTarget === 'off' ? 'audio' : playbackTarget,
            onDone: () => {
                if (settled) return;
                settled = true;
                send({ type: 'callDone' });
            },
        });
        return () => {
            // Leaving the call early (restart, exit, another piece) must not
            // count as having heard it.
            settled = true;
            handle.stop();
        };
        // callId, not phase alone: a restart during a call is a new call.
    }, [state.callId]); // eslint-disable-line react-hooks/exhaustive-deps

    // The breath between rounds.
    useEffect(() => {
        if (state.phase !== 'breath') return;
        const t = setTimeout(() => send({ type: 'breathDone' }), BREATH_MS);
        return () => clearTimeout(t);
    }, [state.phase, state.k, send]);

    // The student's turn: only keys struck after the call finished count.
    const turnStartedAt = useRef(0);
    const lastSeen = useRef(0);
    useEffect(() => {
        if (state.phase === 'response') turnStartedAt.current = performance.now();
    }, [state.phase, state.callId]);
    useEffect(() => {
        if (!lastNote || lastNote.timestamp <= lastSeen.current) return;
        lastSeen.current = lastNote.timestamp;
        if (state.phase !== 'response' || lastNote.timestamp < turnStartedAt.current) return;
        // useMidi hands key presses over as state rather than as an event to
        // subscribe to, so reacting to one has to happen in an effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        send({ type: 'note', midi: lastNote.note });
    }, [lastNote, state.phase, send]);

    // A wrong note: a short, clearly unmusical buzz, distinct from the piece.
    const cueRef = useRef<Tone.PolySynth | null>(null);
    useEffect(() => {
        if (state.phase !== 'error' || isMetronomeMuted) return;
        if (!cueRef.current) {
            cueRef.current = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'square' },
                envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.05 },
                volume: -20,
            }).toDestination();
        }
        cueRef.current.triggerAttackRelease(['A2', 'A#2'], 0.18);
    }, [state.phase, state.stats.attempts, isMetronomeMuted]);
    useEffect(() => () => { cueRef.current?.dispose(); cueRef.current = null; }, []);

    // Where the page sits. On the student's turn it follows them, note by
    // note. Otherwise it shows the phrase from its first note: everything
    // learned so far, then the veil. (Parking the frontier under the cursor
    // instead scrolls the learned notes away under the clef strip — exactly
    // what the spec says stays visible.)
    useEffect(() => {
        if (!active || melody.length === 0) return;
        const at = state.phase === 'response' ? Math.min(state.i, melody.length - 1) : 0;
        seek(melody[at].tick);
    }, [active, melody, state.phase, state.i, seek]);

    const value: EarTrainingValue = useMemo(() => ({
        active,
        state,
        melody,
        staff,
        staves,
        setStaff: (s: EarStaff) => setHandSelection(s === 2 ? 'left' : 'right'),
        rhythm,
        setRhythm,
        exactOctave,
        setExactOctave,
        start: () => send({ type: 'start' }),
        retry: () => send({ type: 'retry' }),
        restart: () => send({ type: 'restart' }),
        exit: () => setGameMode('practice'),
    }), [active, state, melody, staff, staves, setHandSelection, rhythm, exactOctave, send, setGameMode]);

    return <EarTrainingContext.Provider value={value}>{children}</EarTrainingContext.Provider>;
};

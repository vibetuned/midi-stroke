import { useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { padForScoreNote } from '../utils/drumKit';
import type { TimemapData } from '../utils/timemap';
import { isTrackActiveForHand, useGame } from '../context/game';

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

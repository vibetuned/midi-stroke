import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGame, isTrackActiveForHand } from '../context/game';
import { useStats } from '../context/stats';
import { useMidiNotes } from './useMidi';
import { getMidiState, type MidiNote } from '../utils/midiInput';
import { useDrumMap } from './useDrumMap';
import { inputAnswersPad, inputScorePitch } from '../utils/drumMap';

// Tolerance in ticks (approx 100ms at 120bpm is ~192 ticks, but depends on PPQ)
// Let's assume standard PPQ 192 (Tone default).
// 120 BPM = 0.5s per beat.
// 192 ticks per beat.
// 100ms = 0.1s.
// Ticks = (0.1 / 0.5) * 192 = 38.4 ticks.
// Let's use a generous tolerance for now, say 10 ticks.
const TOLERANCE_TICKS = 10;

// Saxo input domain: baked saxo scores are in WRITTEN (transposed) pitch, so
// incoming notes are shifted into that domain before matching. Measured against
// a TravelSax: it sends the written pitch CLASS but one octave below the staff,
// so +12. (Alternatively raise the controller's octave by one and set this to 0.)
// See docs/saxo-app.md §3.
export const SAXO_INPUT_TRANSPOSE_SEMITONES = 12;

export interface ExpectedNote {
    note: number;
    trackIndex: number;
}

export interface GameLogicState {
    expectedNotes: ExpectedNote[];
}

export function useGameLogic() {
    const { timemap, playPosition, gameMode, waitingForNotes, waitingForNotesRef, resumePractice, isPlaying, selectedSong, instrument, handSelection } = useGame();
    // Drums never filter by hand; piano uses the user's L/R/Both selection.
    const activeHand = instrument === 'piano' ? handSelection : 'both';
    // Saxo: shift incoming controller notes into the written score domain before
    // matching (both rhythm and practice). 0 for piano/drums. A written note W is
    // produced by device note (W - inputOffset). See SAXO_INPUT_TRANSPOSE_SEMITONES.
    const inputOffset = instrument === 'saxo' ? SAXO_INPUT_TRANSPOSE_SEMITONES : 0;
    // Drums: what each controller note is (utils/drumMap.ts, editable).
    const drumMap = useDrumMap();
    const { recordHit, recordWrong, recordGood } = useStats();

    const lastProcessedTimeRef = useRef<number>(0);
    // Tracks the last wrong-note timestamp in practice mode.
    // Gated against lastProcessedTimeRef so notes that were part of a
    // successful "Good!" can never be re-counted as wrong on the next pause.
    const lastWrongTimeRef = useRef<number>(0);
    // True when the current practice note group received at least one wrong
    // before the correct note — prevents that group from counting toward n/total.
    const groupWrongedRef = useRef<boolean>(false);

    // Rhythm-mode miss detection: track which note-groups (keyed by source
    // MIDI tick — chords across tracks share a tick) have been resolved either
    // by a hit or by their window expiring. Also track the previous playback
    // position so we can detect seeks and only count misses on natural advance.
    const resolvedTicksRef = useRef<Set<number>>(new Set());
    const prevPlayPositionRef = useRef<number>(0);

    // Derive a stable display name from the song path
    const songName = selectedSong ? (selectedSong.split('/').pop() ?? selectedSong) : '';

    // Precomputed note groups for miss detection: the timemap onsets are
    // already one entry per musical moment (chords pre-grouped, tie
    // continuations erased), with `end` being the latest end across the chord.
    const noteGroups = useMemo(() => {
        if (!timemap) return [] as Array<{ tick: number; end: number; sourceTick: number }>;
        const groups: Array<{ tick: number; end: number; sourceTick: number }> = [];
        for (const onset of timemap.onsets) {
            let end = -1;
            for (const n of onset.notes) {
                if (!isTrackActiveForHand(n.staff - 1, activeHand)) continue;
                if (n.endTick > end) end = n.endTick;
            }
            if (end >= 0) groups.push({ tick: onset.tick, end, sourceTick: onset.tick });
        }
        return groups.sort((a, b) => a.end - b.end);
    }, [timemap, activeHand]);

    // Clear resolved set when the song changes OR when the hand selection
    // changes (active groups differ, so old "resolved" markers shouldn't carry over).
    useEffect(() => {
        resolvedTicksRef.current = new Set();
        prevPlayPositionRef.current = 0;
    }, [timemap, activeHand]);

    // Calculate expected notes based on current play position
    const expectedNotes = useMemo(() => {
        // Learn by ear shows no landing targets at all — this is also what
        // keeps the keyboard glow and the ROLI key lights dark.
        if (!timemap || gameMode === 'ear') return [];

        const currentTicks = playPosition;
        const notes: ExpectedNote[] = [];

        // Helper to check if a note is valid
        const isNoteValid = (noteStart: number, noteEnd: number, noteMidi: number) => {
            // Strict match for practice mode waiting notes
            if (gameMode === 'practice' && waitingForNotes.length > 0) {
                const TICK_EPSILON = 20;
                return waitingForNotes.includes(noteMidi) && Math.abs(noteStart - currentTicks) < TICK_EPSILON;
            }

            // Standard mode: note is hittable from slightly before start until it ends
            return currentTicks >= noteStart - TOLERANCE_TICKS && currentTicks <= noteEnd;
        };

        for (const onset of timemap.onsets) {
            for (const n of onset.notes) {
                const trackIndex = n.staff - 1;
                if (!isTrackActiveForHand(trackIndex, activeHand)) continue;
                if (isNoteValid(onset.tick, n.endTick, n.midi)) {
                    notes.push({ note: n.midi, trackIndex });
                }
            }
        }

        if (gameMode === 'practice' && waitingForNotes.length > 0) {
            const result = notes.filter(n => waitingForNotes.includes(n.note));
            // Dedup by note+track
            return result.filter((n, i, self) =>
                i === self.findIndex(t => t.note === n.note && t.trackIndex === n.trackIndex)
            );
        }

        return notes.filter((n, i, self) =>
            i === self.findIndex(t => t.note === n.note && t.trackIndex === n.trackIndex)
        );

    }, [timemap, playPosition, gameMode, waitingForNotes, activeHand]);


    // ------------------------------------------------------------ judging
    // Every key is judged as it arrives (useMidiNotes: one call per note-on,
    // however fast they come), against the keys held at that moment.

    /**
     * Practice mode: does the pause get its answer? `hit` is the key just
     * struck — or, when the pause itself has just arrived, the last key
     * struck, so one played a moment early and still held counts.
     */
    const judgePractice = (waiting: number[], hit: MidiNote | null) => {
        const { activeNotes } = getMidiState();
        // Drums wait for General MIDI pads (the score's drums); the
        // controller's notes go through its pad map. Voices notated in the
        // same place count for each other — rim for snare, open hi-hat for
        // closed — exactly as in rhythm mode: a score's noteheads say which
        // one is *written*, not a reason to reject the other. Everywhere
        // else this is plain equality.
        const answers = (expected: number, input: number) =>
            instrument === 'drums' ? inputAnswersPad(drumMap, expected, input) : expected === input;
        const heldFor = (expected: number) => {
            if (instrument !== 'drums') return activeNotes.get(expected - inputOffset);
            for (const [note, data] of activeNotes) if (answers(expected, note)) return data;
            return undefined;
        };

        // Wrong note while waiting — count it but don't block resumption.
        // Must be newer than BOTH the wrong-gate AND the last successful
        // interaction so held/lingering correct notes from the previous
        // "Good!" don't get miscounted on the next pause.
        if (hit && selectedSong
            && hit.timestamp > lastWrongTimeRef.current
            && hit.timestamp > lastProcessedTimeRef.current) {
            if (!waiting.some(w => answers(w, hit.note + inputOffset))) {
                lastWrongTimeRef.current = hit.timestamp;
                groupWrongedRef.current = true;
                recordWrong(selectedSong, songName, 'practice');
            }
        }

        // A single note needs a fresh strike; a chord needs every note held
        // with at least one of them fresh. Fresh = struck after the last
        // answer, so keys still down from the previous pause never count.
        const held = waiting.map(heldFor);
        if (!held.every(Boolean)) return;
        const fresh = held.filter(d => d!.timestamp > lastProcessedTimeRef.current);
        if (fresh.length === 0) return;
        lastProcessedTimeRef.current = Math.max(lastProcessedTimeRef.current, ...held.map(d => d!.timestamp));

        const firstAttempt = !groupWrongedRef.current;
        groupWrongedRef.current = false;
        if (selectedSong) recordGood(selectedSong, songName, firstAttempt);
        resumePractice();
    };

    /** Rhythm mode: is this key a note that is sounding now? */
    const judgeRhythm = (hit: MidiNote) => {
        // Only score when the transport is actually playing
        if (!timemap || !isPlaying || !selectedSong) return;

        const hitTime = playPosition;
        let hitSourceTick: number | null = null;
        // Drums: where the pad map says this note is notated; a note it does
        // not assign matches nothing, and counts as a miss.
        const noteToMatch =
            instrument === 'drums' ? inputScorePitch(drumMap, hit.note)
            : hit.note + inputOffset;

        if (noteToMatch !== undefined) {
            for (const onset of timemap.onsets) {
                // Onsets are tick-sorted — everything past the hit window is future.
                if (onset.tick - TOLERANCE_TICKS > hitTime) break;
                const match = onset.notes.some(n =>
                    n.midi === noteToMatch
                    && isTrackActiveForHand(n.staff - 1, activeHand)
                    && hitTime >= onset.tick - TOLERANCE_TICKS && hitTime <= n.endTick);
                if (match) { hitSourceTick = onset.tick; break; }
            }
        }

        if (hitSourceTick !== null) {
            resolvedTicksRef.current.add(hitSourceTick);
            recordHit(selectedSong, songName);
        } else {
            recordWrong(selectedSong, songName, 'rhythm');
        }
    };

    useMidiNotes({
        onNoteOn: hit => {
            // Practice reads the waiting notes from the ref, which a pause
            // sets at once — a key can land before the render that follows.
            if (gameMode === 'practice') {
                const waiting = waitingForNotesRef.current;
                if (waiting.length > 0) judgePractice(waiting, hit);
            } else if (gameMode === 'standard') {
                judgeRhythm(hit);
            }
            // Learn by ear judges keys itself (EarTrainingProvider).
        },
    });

    // A pause has just arrived: the key may already be down. (The latest
    // judge through a ref, for the same reason as in useMidiNotes: this hook
    // runs inside memo() components.)
    const latestPractice = useRef({ judgePractice, gameMode });
    useLayoutEffect(() => { latestPractice.current = { judgePractice, gameMode }; });
    useEffect(() => {
        const { judgePractice, gameMode } = latestPractice.current;
        if (gameMode === 'practice' && waitingForNotes.length > 0) judgePractice(waitingForNotes, getMidiState().lastNote);
    }, [waitingForNotes]);

    // Reset the wronged-flag whenever a new note group arrives so each group
    // starts with a clean first-attempt slate.
    useEffect(() => {
        groupWrongedRef.current = false;
    }, [waitingForNotes]);

    // Rhythm-mode miss detection: as playPosition advances, any chord whose
    // hit window has fully expired without being resolved counts as a wrong.
    // A backward jump (reset / rewind / drag-back) clears the resolved set so
    // the player can re-attempt the section; a large forward jump (seek) is
    // skipped so seeking over a passage doesn't fabricate misses.
    useEffect(() => {
        if (gameMode !== 'standard' || !isPlaying || !selectedSong) {
            prevPlayPositionRef.current = playPosition;
            return;
        }
        const prev = prevPlayPositionRef.current;
        prevPlayPositionRef.current = playPosition;

        if (playPosition < prev) {
            resolvedTicksRef.current = new Set();
            return;
        }
        // 50ms poll at 120 BPM ≈ 19 ticks; anything past ~300 is a seek.
        if (playPosition > prev + 300) return;

        for (const group of noteGroups) {
            if (group.end <= prev) continue;
            if (group.end > playPosition) break; // sorted by end → rest are future
            if (!resolvedTicksRef.current.has(group.sourceTick)) {
                resolvedTicksRef.current.add(group.sourceTick);
                recordWrong(selectedSong, songName, 'rhythm');
            }
        }
    }, [playPosition, gameMode, isPlaying, selectedSong, songName, noteGroups, recordWrong]);

    return { expectedNotes };
}

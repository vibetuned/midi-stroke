import { useEffect, useMemo, useState, useRef } from 'react';
import { useGame, isTrackActiveForHand } from '../context/GameContext';
import { useStats } from '../context/StatsContext';
import { useMidi, MIDI_PAD_MAP } from './useMidi';

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
    feedback: string | null;
}

export function useGameLogic() {
    const { midiData, playPosition, ppqRatio, gameMode, waitingForNotes, resumePractice, isPlaying, selectedSong, instrument, handSelection } = useGame();
    // Drums never filter by hand; piano uses the user's L/R/Both selection.
    const activeHand = instrument === 'piano' ? handSelection : 'both';
    // Saxo: shift incoming controller notes into the written score domain before
    // matching (both rhythm and practice). 0 for piano/drums. A written note W is
    // produced by device note (W - inputOffset). See SAXO_INPUT_TRANSPOSE_SEMITONES.
    const inputOffset = instrument === 'saxo' ? SAXO_INPUT_TRANSPOSE_SEMITONES : 0;
    const { lastNote, activeNotes } = useMidi();
    const { recordHit, recordWrong, recordGood } = useStats();

    const [feedback, setFeedback] = useState<string | null>(null);
    const lastProcessedTimeRef = useRef<number>(0);
    // Tracks the last wrong-note timestamp in practice mode.
    // Gated against lastProcessedTimeRef so notes that were part of a
    // successful "Good!" can never be re-counted as wrong on the next pause.
    const lastWrongTimeRef = useRef<number>(0);
    // Deduplicates standard-mode events: activeNotes dep causes the effect to
    // re-fire on every note-off, but lastNote stays the same → without this
    // guard a single key press would score once per subsequent note release.
    const lastProcessedStandardRef = useRef<number>(0);
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

    // Precomputed note groups for miss detection: one entry per source MIDI tick
    // (chord notes share a tick), with `end` being the latest end across the chord.
    const noteGroups = useMemo(() => {
        if (!midiData) return [] as Array<{ tick: number; end: number; sourceTick: number }>;
        const map = new Map<number, { tick: number; end: number; sourceTick: number }>();
        midiData.tracks.forEach((track, trackIndex) => {
            if (!isTrackActiveForHand(trackIndex, activeHand)) return;
            track.notes.forEach(note => {
                const start = note.ticks * ppqRatio;
                const end = start + note.durationTicks * ppqRatio;
                const existing = map.get(note.ticks);
                if (existing) {
                    if (end > existing.end) existing.end = end;
                } else {
                    map.set(note.ticks, { tick: start, end, sourceTick: note.ticks });
                }
            });
        });
        return Array.from(map.values()).sort((a, b) => a.end - b.end);
    }, [midiData, ppqRatio, activeHand]);

    // Clear resolved set when the song changes OR when the hand selection
    // changes (active groups differ, so old "resolved" markers shouldn't carry over).
    useEffect(() => {
        resolvedTicksRef.current = new Set();
        prevPlayPositionRef.current = 0;
    }, [midiData, activeHand]);

    // Calculate expected notes based on current play position
    const expectedNotes = useMemo(() => {
        if (!midiData) return [];

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

        midiData.tracks.forEach((track, trackIndex) => {
            if (!isTrackActiveForHand(trackIndex, activeHand)) return;
            track.notes.forEach(note => {
                const OFFSET_TICKS = 0 * 192;
                const start = (note.ticks * ppqRatio) + OFFSET_TICKS;
                const end = start + (note.durationTicks * ppqRatio);
                if (isNoteValid(start, end, note.midi)) {
                    notes.push({ note: note.midi, trackIndex });
                }
            });
        });

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

    }, [midiData, playPosition, ppqRatio, gameMode, waitingForNotes, activeHand]);


    // Validation Logic
    useEffect(() => {
        // Practice Mode Validation
        if (gameMode === 'practice' && waitingForNotes.length > 0) {

            // Wrong note while waiting — count it but don't block resumption.
            // Must be newer than BOTH the wrong-gate AND the last successful
            // interaction so held/lingering correct notes from the previous
            // "Good!" don't get miscounted on the next pause.
            if (lastNote && selectedSong
                && lastNote.timestamp > lastWrongTimeRef.current
                && lastNote.timestamp > lastProcessedTimeRef.current) {
                if (!waitingForNotes.includes(lastNote.note + inputOffset)) {
                    lastWrongTimeRef.current = lastNote.timestamp;
                    groupWrongedRef.current = true;
                    recordWrong(selectedSong, songName, 'practice');
                }
            }

            // Scenario A: Single Note -> Responsive "Hit" Logic (Don't need to hold)
            if (waitingForNotes.length === 1) {
                const target = waitingForNotes[0];
                const noteData = activeNotes.get(target - inputOffset);

                if (noteData) {
                    // Check freshness: event timestamp must be > last processed success
                    if (noteData.timestamp > lastProcessedTimeRef.current) {
                        lastProcessedTimeRef.current = Math.max(lastProcessedTimeRef.current, noteData.timestamp);

                        const firstAttempt = !groupWrongedRef.current;
                        groupWrongedRef.current = false;
                        if (selectedSong) recordGood(selectedSong, songName, firstAttempt);
                        setFeedback("Good!");
                        resumePractice();
                        setTimeout(() => setFeedback(null), 500);
                    }
                }
            }
            else {
                // Check if ALL waiting notes are currently present
                const allNotesHeld = waitingForNotes.every(note => activeNotes.has(note - inputOffset));

                if (allNotesHeld) {
                    const hasFreshAttack = waitingForNotes.some(note => {
                        const data = activeNotes.get(note - inputOffset);
                        return data && data.timestamp > lastProcessedTimeRef.current;
                    });

                    if (hasFreshAttack) {
                        let maxTimestamp = lastProcessedTimeRef.current;
                        waitingForNotes.forEach(note => {
                            const data = activeNotes.get(note - inputOffset);
                            if (data && data.timestamp > maxTimestamp) {
                                maxTimestamp = data.timestamp;
                            }
                        });
                        lastProcessedTimeRef.current = maxTimestamp;

                        const firstAttempt = !groupWrongedRef.current;
                        groupWrongedRef.current = false;
                        if (selectedSong) recordGood(selectedSong, songName, firstAttempt);
                        setFeedback("Good!");
                        resumePractice();
                        setTimeout(() => setFeedback(null), 500);
                    }
                }
            }
            return;
        }

        // Practice mode: don't fall through to standard mode scoring
        if (gameMode === 'practice') return;

        // Standard Mode Validation (event-based via lastNote)
        if (!lastNote) return;
        if (!midiData) return;
        // Only score when the transport is actually playing
        if (!isPlaying) return;
        if (!selectedSong) return;
        // activeNotes is a dep so the effect re-fires on every note-off while
        // lastNote stays the same — skip if we already scored this key press.
        if (lastNote.timestamp <= lastProcessedStandardRef.current) return;
        lastProcessedStandardRef.current = lastNote.timestamp;

        const hitTime = playPosition;
        let hit = false;
        let hitSourceTick: number | null = null;
        const noteToMatch =
            instrument === 'drums' ? (MIDI_PAD_MAP[lastNote.note] ?? lastNote.note)
            : lastNote.note + inputOffset;

        for (let trackIndex = 0; trackIndex < midiData.tracks.length; trackIndex++) {
            if (!isTrackActiveForHand(trackIndex, activeHand)) continue;
            const track = midiData.tracks[trackIndex];
            for (const note of track.notes) {
                if (note.midi !== noteToMatch) continue;
                const OFFSET_TICKS = 0 * 192;
                const start = (note.ticks * ppqRatio) + OFFSET_TICKS;
                const end = start + (note.durationTicks * ppqRatio);

                if (hitTime >= start - TOLERANCE_TICKS && hitTime <= end) {
                    hit = true;
                    hitSourceTick = note.ticks;
                    break;
                }
            }
            if (hit) break;
        }

        if (hit) {
            if (hitSourceTick !== null) resolvedTicksRef.current.add(hitSourceTick);
            recordHit(selectedSong, songName);
            setFeedback("Hit!");
            setTimeout(() => setFeedback(null), 1000);
        } else {
            recordWrong(selectedSong, songName, 'rhythm');
            setFeedback("Miss!");
            setTimeout(() => setFeedback(null), 500);
        }

    }, [lastNote, activeNotes, midiData, playPosition, gameMode, waitingForNotes, resumePractice, ppqRatio,
        isPlaying, selectedSong, songName, instrument, recordHit, recordWrong, recordGood]);

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

    return { expectedNotes, feedback };
}

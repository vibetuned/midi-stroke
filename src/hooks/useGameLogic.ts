import { useEffect, useMemo, useState, useRef } from 'react';
import { useGame } from '../context/GameContext';
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

export interface ExpectedNote {
    note: number;
    trackIndex: number;
}

export interface GameLogicState {
    expectedNotes: ExpectedNote[];
    feedback: string | null;
}

export function useGameLogic() {
    const { midiData, playPosition, ppqRatio, gameMode, waitingForNotes, resumePractice, isPlaying, selectedSong, instrument } = useGame();
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

    // Derive a stable display name from the song path
    const songName = selectedSong ? (selectedSong.split('/').pop() ?? selectedSong) : '';

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

    }, [midiData, playPosition, ppqRatio, gameMode, waitingForNotes]);


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
                if (!waitingForNotes.includes(lastNote.note)) {
                    lastWrongTimeRef.current = lastNote.timestamp;
                    recordWrong(selectedSong, songName, 'practice');
                }
            }

            // Scenario A: Single Note -> Responsive "Hit" Logic (Don't need to hold)
            if (waitingForNotes.length === 1) {
                const target = waitingForNotes[0];
                const noteData = activeNotes.get(target);

                if (noteData) {
                    // Check freshness: event timestamp must be > last processed success
                    if (noteData.timestamp > lastProcessedTimeRef.current) {
                        lastProcessedTimeRef.current = Math.max(lastProcessedTimeRef.current, noteData.timestamp);

                        if (selectedSong) recordGood(selectedSong, songName);
                        setFeedback("Good!");
                        resumePractice();
                        setTimeout(() => setFeedback(null), 500);
                    }
                }
            }
            else {
                // Check if ALL waiting notes are currently present
                const allNotesHeld = waitingForNotes.every(note => activeNotes.has(note));

                if (allNotesHeld) {
                    const hasFreshAttack = waitingForNotes.some(note => {
                        const data = activeNotes.get(note);
                        return data && data.timestamp > lastProcessedTimeRef.current;
                    });

                    if (hasFreshAttack) {
                        let maxTimestamp = lastProcessedTimeRef.current;
                        waitingForNotes.forEach(note => {
                            const data = activeNotes.get(note);
                            if (data && data.timestamp > maxTimestamp) {
                                maxTimestamp = data.timestamp;
                            }
                        });
                        lastProcessedTimeRef.current = maxTimestamp;

                        if (selectedSong) recordGood(selectedSong, songName);
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
        const noteToMatch = instrument === 'drums' ? (MIDI_PAD_MAP[lastNote.note] ?? lastNote.note) : lastNote.note;

        for (const track of midiData.tracks) {
            for (const note of track.notes) {
                if (note.midi !== noteToMatch) continue;
                const OFFSET_TICKS = 0 * 192;
                const start = (note.ticks * ppqRatio) + OFFSET_TICKS;
                const end = start + (note.durationTicks * ppqRatio);

                if (hitTime >= start - TOLERANCE_TICKS && hitTime <= end) {
                    hit = true;
                    break;
                }
            }
            if (hit) break;
        }

        if (hit) {
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

    return { expectedNotes, feedback };
}

import { useEffect, useMemo, useState, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { useMidi } from './useMidi';

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
    const { midiData, playPosition, ppqRatio, gameMode, waitingForNotes, resumePractice } = useGame();
    const { lastNote, activeNotes } = useMidi();
    const [feedback, setFeedback] = useState<string | null>(null);
    const lastProcessedTimeRef = useRef<number>(0);


    // Calculate expected notes based on current play position
    const expectedNotes = useMemo(() => {
        if (!midiData) return [];

        const currentTicks = playPosition;
        const notes: ExpectedNote[] = [];

        // Helper to check if a note is valid
        const isNoteValid = (noteStart: number, noteMidi: number) => {
            // Strict match for practice mode waiting notes
            if (gameMode === 'practice' && waitingForNotes.length > 0) {
                const TICK_EPSILON = 20;
                return waitingForNotes.includes(noteMidi) && Math.abs(noteStart - currentTicks) < TICK_EPSILON;
            }

            // Standard mode tolerance
            return noteStart >= currentTicks - TOLERANCE_TICKS && noteStart <= currentTicks + TOLERANCE_TICKS;
        };

        midiData.tracks.forEach((track, trackIndex) => {
            track.notes.forEach(note => {
                const OFFSET_TICKS = 1 * 192;
                const start = (note.ticks * ppqRatio) + OFFSET_TICKS;

                if (isNoteValid(start, note.midi)) {
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

            // Scenario A: Single Note -> Responsive "Hit" Logic (Don't need to hold)
            if (waitingForNotes.length === 1) {
                const target = waitingForNotes[0];
                const noteData = activeNotes.get(target);

                if (noteData) {
                    // Check freshness: event timestamp must be > last processed success
                    if (noteData.timestamp > lastProcessedTimeRef.current) {
                        console.log(`Single Note Hit: ${target}. Resuming.`);
                        lastProcessedTimeRef.current = Math.max(lastProcessedTimeRef.current, noteData.timestamp);

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

                        console.log(`Chord Satisfied! [${waitingForNotes.join(', ')}]. Resuming.`);

                        let maxTimestamp = lastProcessedTimeRef.current;
                        waitingForNotes.forEach(note => {
                            const data = activeNotes.get(note);
                            if (data && data.timestamp > maxTimestamp) {
                                maxTimestamp = data.timestamp;
                            }
                        });
                        lastProcessedTimeRef.current = maxTimestamp;

                        setFeedback("Good!");
                        resumePractice();
                        setTimeout(() => setFeedback(null), 500);
                    }
                }
            }
            return;
            return;
        }

        // Standard Mode Validation (stays event-based via lastNote)
        if (!lastNote) return;

        // Standard Mode Validation
        if (!midiData) return;

        const hitTime = playPosition;
        let hit = false;

        // Check all tracks
        for (const track of midiData.tracks) {
            for (const note of track.notes) {
                // Check pitch
                if (note.midi !== lastNote.note) continue;
                const OFFSET_TICKS = 1 * 192;
                const start = (note.ticks * ppqRatio) + OFFSET_TICKS;

                if (Math.abs(start - hitTime) <= TOLERANCE_TICKS) {
                    hit = true;
                    break;
                }
            }
            if (hit) break;
        }

        if (hit) {
            console.log(`Hit! Note: ${lastNote.note} at Ticks: ${hitTime}`);
            setFeedback("Hit!");
            setTimeout(() => setFeedback(null), 1000);
        } else {
            //console.log(`Miss! Note: ${lastNote.note} at Ticks: ${hitTime}`);
            // Optional: setFeedback("Miss");
        }

    }, [lastNote, activeNotes, midiData, playPosition, gameMode, waitingForNotes, resumePractice, ppqRatio]);

    return { expectedNotes, feedback };
}

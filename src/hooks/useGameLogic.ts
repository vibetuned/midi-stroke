import { useEffect, useMemo, useState, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { useMidi } from './useMidi';

// Tolerance in ticks (approx 100ms at 120bpm is ~192 ticks, but depends on PPQ)
// Let's assume standard PPQ 192 (Tone default).
// 120 BPM = 0.5s per beat.
// 192 ticks per beat.
// 100ms = 0.1s.
// Ticks = (0.1 / 0.5) * 192 = 38.4 ticks.
// Let's use a generous tolerance for now, say 50 ticks.
const TOLERANCE_TICKS = 100;

export interface GameLogicState {
    expectedNotes: number[]; // Array of MIDI note numbers
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

        // In Practice Mode, if we are waiting for notes, strictly return those notes.
        if (gameMode === 'practice' && waitingForNotes.length > 0) {
            return waitingForNotes;
        }

        const currentTicks = playPosition;
        const notes: number[] = [];

        midiData.tracks.forEach(track => {
            track.notes.forEach(note => {
                // Check if note overlaps with current time window
                // Note ticks are in MIDI PPQ. playPosition is in Tone PPQ.
                // We must scale MIDI ticks to Tone ticks.
                // Also apply the 4-beat offset (silence at start).
                // The MIDI file starts at 0, but playback includes 4 beats of silence.
                // So a note at MIDI 0 should play when Transport is at 4 * 192.
                // AdjustedStart = (NoteTicks * Ratio) + Offset

                // Assuming Tone default PPQ is 192.
                const OFFSET_TICKS = 1 * 192;
                const start = (note.ticks * ppqRatio) + OFFSET_TICKS;

                // Let's define "Expected to be pressed" as "Starts within tolerance window"
                if (start >= currentTicks - TOLERANCE_TICKS && start <= currentTicks + TOLERANCE_TICKS) {
                    notes.push(note.midi);
                }
            });
        });

        // Dedup
        return Array.from(new Set(notes));
    }, [midiData, playPosition, ppqRatio, gameMode, waitingForNotes]);


    // Validation Logic
    useEffect(() => {
        // Practice Mode Validation
        if (gameMode === 'practice' && waitingForNotes.length > 0) {

            // Scenario A: Single Note -> Responsive "Hit" Logic (Don't need to hold)
            if (waitingForNotes.length === 1) {
                const target = waitingForNotes[0];
                if (lastNote && lastNote.note === target) {
                    // Check freshness: effectively if this note event happened AFTER we processed the last one?
                    // Or just if it's "recent" enough? lastNote.timestamp is performance.now()
                    // We can just check if we already processed this exact timestamp.
                    if (lastNote.timestamp > lastProcessedTimeRef.current) {
                        console.log(`Single Note Hit: ${target}. Resuming.`);
                        lastProcessedTimeRef.current = lastNote.timestamp;
                        setFeedback("Good!");
                        resumePractice();
                        setTimeout(() => setFeedback(null), 500);
                    }
                }
            }
            // Scenario B: Chord -> Strict "Hold" Logic (Must hold all notes)
            else {
                // Check if ALL waiting notes are currently present in activeNotes
                const allNotesHeld = waitingForNotes.every(note => activeNotes.has(note));

                if (allNotesHeld) {
                    console.log(`Chord Satisfied! [${waitingForNotes.join(', ')}]. Resuming.`);
                    // We don't necessarily update lastProcessedTimeRef for chords since it's state-based,
                    // but we might want to prevent double-triggering if effect runs twice?
                    // usually resumePractice() clears waitingForNotes promptly.
                    setFeedback("Good!");
                    resumePractice();
                    setTimeout(() => setFeedback(null), 500);
                }
            }
            return;
        }

        // Standard Mode Validation (stays event-based via lastNote)
        if (!lastNote) return;

        // Standard Mode Validation
        // Check if lastNote matches any note in the data at this time
        // We re-calculate specifically for the hit to be precise
        if (!midiData) return;

        const hitTime = playPosition;
        let hit = false;

        // Check all tracks
        for (const track of midiData.tracks) {
            for (const note of track.notes) {
                // Check pitch
                if (note.midi !== lastNote.note) continue;

                // Check timing
                // start is in MIDI Ticks. hitTime is in Tone Ticks.
                // Scale start to Tone Ticks and add Offset
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
            // Clear feedback after a short delay
            setTimeout(() => setFeedback(null), 1000);
        } else {
            //console.log(`Miss! Note: ${lastNote.note} at Ticks: ${hitTime}`);
            // Optional: setFeedback("Miss");
        }

    }, [lastNote, activeNotes, midiData, playPosition, gameMode, waitingForNotes, resumePractice, ppqRatio]);

    return { expectedNotes, feedback };
}

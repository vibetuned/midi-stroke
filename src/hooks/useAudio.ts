import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useMidi } from './useMidi';
import { useGame } from '../context/GameContext';

export function useAudio() {
    const synthRef = useRef<Tone.PolySynth | null>(null);
    const { lastNote, activeNotes } = useMidi();
    const { isAudioStarted } = useGame();

    // Initialize Synth
    useEffect(() => {
        if (!isAudioStarted) return;

        const synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' },
            envelope: {
                attack: 0.005,
                decay: 0.1,
                sustain: 0.3,
                release: 1
            }
        }).toDestination();

        synthRef.current = synth;
        console.log("Synth created (Audio Context running)");

        return () => {
            synth.dispose();
            synthRef.current = null;
        };
    }, [isAudioStarted]);

    // Handle Incoming MIDI Notes (Input Sound)
    useEffect(() => {
        if (!synthRef.current || !lastNote) return;

    }, [lastNote]);

    // Better: Expose a direct callback in useMidi or handle previous vs current activeNotes in this hook.
    const prevNotesRef = useRef<Set<number>>(new Set());

    useEffect(() => {
        if (!synthRef.current) return;

        const prev = prevNotesRef.current;

        // Find newly added notes
        activeNotes.forEach(note => {
            if (!prev.has(note)) {
                // Note On
                if (Tone.context.state === 'running') {
                    const freq = Tone.Frequency(note, "midi").toFrequency();
                    synthRef.current?.triggerAttack(freq);
                }
            }
        });

        // Find removed notes
        prev.forEach(note => {
            if (!activeNotes.has(note)) {
                // Note Off
                const freq = Tone.Frequency(note, "midi").toFrequency();
                synthRef.current?.triggerRelease(freq);
            }
        });

        prevNotesRef.current = new Set(activeNotes);
    }, [activeNotes]);

    return { synth: synthRef.current };
}

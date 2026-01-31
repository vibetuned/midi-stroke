import { useState, useEffect, useCallback } from 'react';

export interface MidiNote {
    note: number;
    velocity: number;
    channel: number;
    timestamp: number;
}

export function useMidi() {
    const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
    const [inputs, setInputs] = useState<MIDIInput[]>([]);
    const [activeNotes, setActiveNotes] = useState<Map<number, { velocity: number, timestamp: number }>>(new Map());
    const [lastNote, setLastNote] = useState<MidiNote | null>(null);

    const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
        const data = event.data;
        if (!data) return;

        const [status, note, velocity] = data;
        const command = status & 0xf0;
        const channel = status & 0x0f;

        // Note On
        if (command === 144 && velocity > 0) {
            setActiveNotes(prev => {
                const next = new Map(prev);
                next.set(note, { velocity, timestamp: performance.now() });
                return next;
            });
            setLastNote({ note, velocity, channel, timestamp: performance.now() });
        }
        // Note Off (or Note On with velocity 0)
        else if (command === 128 || (command === 144 && velocity === 0)) {
            setActiveNotes(prev => {
                const next = new Map(prev);
                next.delete(note);
                return next;
            });
        }
    }, []);

    useEffect(() => {
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API not supported in this browser.');
            return;
        }

        navigator.requestMIDIAccess().then((access) => {
            setMidiAccess(access);

            const updateInputs = () => {
                const inputsList: MIDIInput[] = [];
                access.inputs.forEach((input) => inputsList.push(input));
                setInputs(inputsList);

                // Re-attach listeners
                inputsList.forEach(input => {
                    input.onmidimessage = handleMidiMessage;
                });
            };

            updateInputs();
            access.onstatechange = updateInputs;

        }, (err) => {
            console.error('Could not access MIDI devices.', err);
        });
    }, [handleMidiMessage]);

    return { midiAccess, inputs, activeNotes, lastNote };
}

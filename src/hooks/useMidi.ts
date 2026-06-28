import { useState, useEffect, useCallback } from 'react';

export interface MidiNote {
    note: number;
    velocity: number;
    channel: number;
    timestamp: number;
}

// Maps pad MIDI note → MEI-derived MIDI note (from pname+oct in DRUM_MAP)
// Formula: (oct + 1) * 12 + semitone, where C=0 D=2 E=4 F=5 G=7 A=9 B=11
export const MIDI_PAD_MAP: Record<number, number> = {
    36: 65, // BassDrum    f4
    38: 72, // SnareDrum   c5
    37: 72, // RimShot     c5
    40: 72, // SnareDrum   c5
    42: 79, // ClosedHiHat g5
    46: 79, // OpenHiHat   g5
    49: 81, // Cymbal      a5
    57: 81, // Cymbal      a5
    53: 81, // Cymbal      a5
    51: 81, // Cymbal      a5
    55: 81, // Cymbal      a5
    41: 69, // LowTom      a4
    43: 69, // LowTom      a4
    45: 74, // MediumTom   d5
    47: 74, // MediumTom   d5
    48: 76, // HighTom     e5
    50: 76, // HighTom     e5
};

export function useMidi() {
    const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
    const [inputs, setInputs] = useState<MIDIInput[]>([]);
    const [activeNotes, setActiveNotes] = useState<Map<number, { velocity: number, timestamp: number }>>(new Map());
    const [lastNote, setLastNote] = useState<MidiNote | null>(null);
    // Breath-controller level (0–127) from a wind controller: CC#2 (breath),
    // CC#11 (expression), or channel pressure. Only updated when the value
    // actually changes, so instruments that send no breath trigger no re-renders.
    const [breath, setBreath] = useState(0);

    const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
        const data = event.data;
        if (!data) return;

        const [status, note, velocity] = data;
        const command = status & 0xf0;
        const channel = status & 0x0f;

        //const mappedNote = MIDI_PAD_MAP[note];
        //if (mappedNote === undefined) return;

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
        // Control Change — breath. CC#7 is the TravelSax default (nominally
        // "Channel Volume"); CC#2 (breath) / CC#11 (expression) are the
        // MIDI-standard alternatives. `note` here is the controller number.
        else if (command === 176 && (note === 2 || note === 7 || note === 11)) {
            setBreath(prev => (prev === velocity ? prev : velocity));
        }
        // Channel Pressure (aftertouch) — some wind controllers send breath here.
        // For 0xD0 the second data byte (`note`) carries the pressure value.
        else if (command === 208) {
            setBreath(prev => (prev === note ? prev : note));
        }
    }, []);

    useEffect(() => {
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API not supported in this browser.');
            return;
        }

        navigator.requestMIDIAccess().then((access) => {
            setMidiAccess(access);

            const attachedInputs: MIDIInput[] = [];

            const updateInputs = () => {
                // Remove old listeners
                attachedInputs.forEach(input => {
                    input.removeEventListener('midimessage', handleMidiMessage as EventListener);
                });
                attachedInputs.length = 0;

                const inputsList: MIDIInput[] = [];
                access.inputs.forEach((input) => inputsList.push(input));
                setInputs(inputsList);

                inputsList.forEach(input => {
                    input.addEventListener('midimessage', handleMidiMessage as EventListener);
                    attachedInputs.push(input);
                });
            };

            updateInputs();
            access.onstatechange = updateInputs;

        }, (err) => {
            console.error('Could not access MIDI devices.', err);
        });
    }, [handleMidiMessage]);

    return { midiAccess, inputs, activeNotes, lastNote, breath };
}

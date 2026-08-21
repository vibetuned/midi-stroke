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

// Tauri desktop shell: the webview (WKWebView/WebKitGTK) has no Web MIDI API,
// so the Rust side bridges midir → Tauri events (see src-tauri/src/main.rs):
//   "midi-message": [status, data1, data2] raw bytes per channel-voice message
//   "midi-devices": string[] of connected input port names (re-emitted ~2s)
interface TauriEventApi {
    event: {
        listen<T>(name: string, cb: (e: { payload: T }) => void): Promise<() => void>;
    };
}

function tauriApi(): TauriEventApi | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: TauriEventApi };
    return ('__TAURI_INTERNALS__' in w || w.__TAURI__) ? (w.__TAURI__ ?? null) : null;
}

export function useMidi() {
    const [isMidiActive, setIsMidiActive] = useState(false);
    const [deviceNames, setDeviceNames] = useState<string[]>([]);
    const [activeNotes, setActiveNotes] = useState<Map<number, { velocity: number, timestamp: number }>>(new Map());
    const [lastNote, setLastNote] = useState<MidiNote | null>(null);
    // Breath-controller level (0–127) from a wind controller: CC#2 (breath),
    // CC#11 (expression), or channel pressure. Only updated when the value
    // actually changes, so instruments that send no breath trigger no re-renders.
    const [breath, setBreath] = useState(0);

    // Shared message decoding — fed raw bytes by both the Web MIDI path and
    // the Tauri native bridge.
    const handleMidiBytes = useCallback((status: number, data1: number, data2: number) => {
        const command = status & 0xf0;
        const channel = status & 0x0f;

        // Note On
        if (command === 144 && data2 > 0) {
            const note = data1;
            const velocity = data2;
            setActiveNotes(prev => {
                const next = new Map(prev);
                next.set(note, { velocity, timestamp: performance.now() });
                return next;
            });
            setLastNote({ note, velocity, channel, timestamp: performance.now() });
        }
        // Note Off (or Note On with velocity 0)
        else if (command === 128 || (command === 144 && data2 === 0)) {
            setActiveNotes(prev => {
                const next = new Map(prev);
                next.delete(data1);
                return next;
            });
        }
        // Control Change — breath. CC#7 is the TravelSax default (nominally
        // "Channel Volume"); CC#2 (breath) / CC#11 (expression) are the
        // MIDI-standard alternatives. `data1` here is the controller number.
        else if (command === 176 && (data1 === 2 || data1 === 7 || data1 === 11)) {
            setBreath(prev => (prev === data2 ? prev : data2));
        }
        // Channel Pressure (aftertouch) — some wind controllers send breath here.
        // For 0xD0 the second byte (`data1`) carries the pressure value.
        else if (command === 208) {
            setBreath(prev => (prev === data1 ? prev : data1));
        }
    }, []);

    const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
        const data = event.data;
        if (!data || data.length === 0) return;
        handleMidiBytes(data[0], data[1] ?? 0, data[2] ?? 0);
    }, [handleMidiBytes]);

    useEffect(() => {
        // --- Tauri desktop shell: native MIDI bridged over events ---
        const tauri = tauriApi();
        if (tauri) {
            let disposed = false;
            const unlisteners: Array<() => void> = [];
            const keep = (p: Promise<() => void>) => p.then(un => {
                if (disposed) un(); else unlisteners.push(un);
            }).catch(err => console.error('Tauri MIDI listen failed:', err));

            keep(tauri.event.listen<[number, number, number]>('midi-message', (e) => {
                const [status, d1, d2] = e.payload;
                handleMidiBytes(status, d1, d2);
            }));
            keep(tauri.event.listen<string[]>('midi-devices', (e) => {
                // First device list = the native bridge is alive (re-emitted ~2s).
                setIsMidiActive(true);
                setDeviceNames(prev =>
                    prev.length === e.payload.length && prev.every((n, i) => n === e.payload[i])
                        ? prev
                        : e.payload
                );
            }));
            return () => {
                disposed = true;
                unlisteners.forEach(un => un());
            };
        }

        // --- Browser: Web MIDI API ---
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API not supported in this browser.');
            return;
        }

        navigator.requestMIDIAccess().then((access) => {
            setIsMidiActive(true);

            const attachedInputs: MIDIInput[] = [];

            const updateInputs = () => {
                // Remove old listeners
                attachedInputs.forEach(input => {
                    input.removeEventListener('midimessage', handleMidiMessage as EventListener);
                });
                attachedInputs.length = 0;

                const inputsList: MIDIInput[] = [];
                access.inputs.forEach((input) => inputsList.push(input));
                setDeviceNames(inputsList.map(i => i.name ?? 'MIDI input'));

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
    }, [handleMidiBytes, handleMidiMessage]);

    return { isMidiActive, deviceNames, activeNotes, lastNote, breath };
}

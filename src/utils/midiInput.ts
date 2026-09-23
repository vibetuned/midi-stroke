/**
 * The app's one connection to MIDI input: a store every consumer shares.
 *
 * It used to be a hook that each consumer called for itself, so the app
 * opened a MIDI connection per caller (ten of them), each stamping the same
 * key press with its own time, and handed key presses over only as React
 * state. That lost notes: React merges state updates that land in the same
 * frame, so two note-ons in quick succession — a chord, a fast run, a drum
 * roll — arrived as one, and a pad struck again within a frame of its
 * release made no sound at all.
 *
 * Now there is one connection, opened on first use, and two ways to listen:
 *   - the state (held notes, last note, devices, breath, sax keys), for
 *     display — hooks/useMidi.ts useMidi();
 *   - note-on / note-off events, one call per message, for anything that
 *     must react to every key — hooks/useMidi.ts useMidiNotes().
 *
 * Messages arrive from Web MIDI in a browser, or from the Tauri desktop
 * shell's native bridge, whose webviews have no Web MIDI (src-tauri main.rs):
 *   "midi-message": [status, data1, data2] raw bytes per channel-voice message
 *   "midi-devices": string[] of connected input port names (re-emitted ~2 s)
 */

export interface MidiNote {
    note: number;
    velocity: number;
    channel: number;
    /** performance.now() when the message arrived — the same for every listener. */
    timestamp: number;
}

export interface MidiState {
    /** A MIDI system answered (Web MIDI access granted, or the native bridge is up). */
    isMidiActive: boolean;
    deviceNames: string[];
    /** Keys held right now → how they were struck. */
    activeNotes: ReadonlyMap<number, { velocity: number; timestamp: number }>;
    lastNote: MidiNote | null;
    /** Breath-controller level, 0–127: CC#2 (breath), CC#7 (the TravelSax's
     *  default), CC#11 (expression) or channel pressure. */
    breath: number;
    /** TravelSax physical key state, breath-independent: each key press on
     *  CC#14 (value = key index), each release on CC#15. See docs/saxo-app.md. */
    saxKeys: number[];
}

export interface MidiNoteListener {
    onNoteOn?(note: MidiNote): void;
    onNoteOff?(note: number): void;
}

let state: MidiState = {
    isMidiActive: false,
    deviceNames: [],
    activeNotes: new Map(),
    lastNote: null,
    breath: 0,
    saxKeys: [],
};
const stateListeners = new Set<() => void>();
const noteListeners = new Set<MidiNoteListener>();

function update(patch: Partial<MidiState>): void {
    state = { ...state, ...patch };
    stateListeners.forEach(fn => fn());
}

/** Decode one channel-voice message. Exported for the tests. */
export function handleMidiBytes(status: number, data1: number, data2: number): void {
    const command = status & 0xf0;
    const channel = status & 0x0f;

    if (command === 0x90 && data2 > 0) {
        const hit: MidiNote = { note: data1, velocity: data2, channel, timestamp: performance.now() };
        const activeNotes = new Map(state.activeNotes);
        activeNotes.set(hit.note, { velocity: hit.velocity, timestamp: hit.timestamp });
        // State first, so a listener reading it sees this key held.
        update({ activeNotes, lastNote: hit });
        noteListeners.forEach(l => l.onNoteOn?.(hit));
    } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
        if (state.activeNotes.has(data1)) {
            const activeNotes = new Map(state.activeNotes);
            activeNotes.delete(data1);
            update({ activeNotes });
        }
        noteListeners.forEach(l => l.onNoteOff?.(data1));
    } else if (command === 0xb0 && (data1 === 2 || data1 === 7 || data1 === 11)) {
        // Control Change — breath. `data1` is the controller number.
        if (state.breath !== data2) update({ breath: data2 });
    } else if (command === 0xd0) {
        // Channel pressure: some wind controllers send breath here, in data1.
        if (state.breath !== data1) update({ breath: data1 });
    } else if (command === 0xb0 && data1 === 14) {
        if (!state.saxKeys.includes(data2)) update({ saxKeys: [...state.saxKeys, data2].sort((a, b) => a - b) });
    } else if (command === 0xb0 && data1 === 15) {
        if (state.saxKeys.includes(data2)) update({ saxKeys: state.saxKeys.filter(k => k !== data2) });
    }
}

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

let started = false;

/** Open the connection, once, for the life of the app. */
function start(): void {
    if (started || typeof window === 'undefined') return;
    started = true;

    const tauri = tauriApi();
    if (tauri) {
        tauri.event.listen<[number, number, number]>('midi-message', e => {
            const [status, d1, d2] = e.payload;
            handleMidiBytes(status, d1, d2);
        }).catch(err => console.error('Tauri MIDI listen failed:', err));
        tauri.event.listen<string[]>('midi-devices', e => {
            // The first device list says the native bridge is alive.
            const same = state.deviceNames.length === e.payload.length
                && state.deviceNames.every((n, i) => n === e.payload[i]);
            if (!state.isMidiActive || !same) update({ isMidiActive: true, deviceNames: same ? state.deviceNames : e.payload });
        }).catch(err => console.error('Tauri MIDI listen failed:', err));
        return;
    }

    if (!navigator.requestMIDIAccess) {
        console.warn('Web MIDI API not supported in this browser.');
        return;
    }
    const onMessage = (event: MIDIMessageEvent) => {
        const data = event.data;
        if (!data || data.length === 0) return;
        handleMidiBytes(data[0], data[1] ?? 0, data[2] ?? 0);
    };
    navigator.requestMIDIAccess().then(access => {
        const attached: MIDIInput[] = [];
        const attach = () => {
            attached.forEach(input => input.removeEventListener('midimessage', onMessage as EventListener));
            attached.length = 0;
            access.inputs.forEach(input => {
                input.addEventListener('midimessage', onMessage as EventListener);
                attached.push(input);
            });
            update({ isMidiActive: true, deviceNames: attached.map(i => i.name ?? 'MIDI input') });
        };
        attach();
        access.onstatechange = attach;
    }, err => {
        console.error('Could not access MIDI devices.', err);
    });
}

export function getMidiState(): MidiState {
    return state;
}

/** For useSyncExternalStore: called after every change of state. */
export function subscribeMidiState(fn: () => void): () => void {
    start();
    stateListeners.add(fn);
    return () => { stateListeners.delete(fn); };
}

/** Called for every note-on and note-off, in order, one message at a time. */
export function subscribeMidiNotes(listener: MidiNoteListener): () => void {
    start();
    noteListeners.add(listener);
    return () => { noteListeners.delete(listener); };
}

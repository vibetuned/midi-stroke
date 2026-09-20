/**
 * MIDI output, shared by the key-light guide and score playback.
 *
 * Two transports, one interface: Web MIDI in browsers, and the Rust midir
 * shim in the Tauri shell (`midi_outputs` / `midi_send`), because the desktop
 * webviews have no Web MIDI API.
 *
 * Web MIDI can schedule a message for a future timestamp, which is what keeps
 * played notes tight; the Tauri bridge sends immediately, so timed sends there
 * are queued with a timer instead. Both are accurate enough for playing a
 * score — the audio path is the one that has to be sample-accurate.
 */

interface TauriInvokeApi {
    core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
}

function tauriInvoke(): TauriInvokeApi['core']['invoke'] | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { __TAURI__?: TauriInvokeApi };
    return w.__TAURI__?.core ? w.__TAURI__.core.invoke.bind(w.__TAURI__.core) : null;
}

/** Send raw bytes, optionally at a `performance.now()` timestamp. */
export type MidiSender = (bytes: number[], atMs?: number) => void;

/**
 * An open output. `clear()` drops whatever was queued but not yet sent, which
 * is what makes a Stop button honest: without it, messages already handed to
 * the port with a future timestamp still arrive after the panic.
 */
export interface MidiPort {
    send: MidiSender;
    clear(): void;
}

/** Every MIDI output port currently present, by name. */
export async function listMidiOutputs(): Promise<string[]> {
    const invoke = tauriInvoke();
    if (invoke) {
        try {
            return await invoke<string[]>('midi_outputs');
        } catch (err) {
            console.warn('[midi] listing outputs failed:', err);
            return [];
        }
    }
    if (!navigator.requestMIDIAccess) return [];
    try {
        const access = await navigator.requestMIDIAccess();
        const names: string[] = [];
        access.outputs.forEach(o => { if (o.name) names.push(o.name); });
        return names;
    } catch (err) {
        console.warn('[midi] Web MIDI access denied:', err);
        return [];
    }
}

/**
 * Open a sender for the output whose name contains `portName`. Resolves to
 * null when no such port exists, so callers can fall back to audio.
 */
export async function openMidiOutput(portName: string): Promise<MidiPort | null> {
    const invoke = tauriInvoke();
    if (invoke) {
        const outputs = await invoke<string[]>('midi_outputs').catch(() => [] as string[]);
        if (!outputs.some(n => n.toLowerCase().includes(portName.toLowerCase()))) return null;
        // The shim sends immediately, so timed sends are held in timers here —
        // and those timers are what `clear()` cancels.
        const pending = new Set<ReturnType<typeof setTimeout>>();
        return {
            send(bytes, atMs) {
                const fire = () => { invoke('midi_send', { portMatch: portName, data: bytes }).catch(() => undefined); };
                const delay = atMs === undefined ? 0 : atMs - performance.now();
                if (delay <= 1) { fire(); return; }
                const t = setTimeout(() => { pending.delete(t); fire(); }, delay);
                pending.add(t);
            },
            clear() { pending.forEach(clearTimeout); pending.clear(); },
        };
    }

    if (!navigator.requestMIDIAccess) return null;
    const access = await navigator.requestMIDIAccess().catch(() => null);
    if (!access) return null;
    const ports: MIDIOutput[] = [];
    access.outputs.forEach(o => {
        if ((o.name ?? '').toLowerCase().includes(portName.toLowerCase())) ports.push(o);
    });
    if (ports.length === 0) return null;
    return {
        send(bytes, atMs) {
            for (const port of ports) {
                try { port.send(bytes, atMs); } catch { /* port went away mid-send */ }
            }
        },
        clear() {
            for (const port of ports) {
                // clear() is in the Web MIDI spec but missing from the DOM
                // typings, and a few implementations skip it.
                const maybe = port as MIDIOutput & { clear?: () => void };
                try { maybe.clear?.(); } catch { /* nothing queued, or unsupported */ }
            }
        },
    };
}

/** Channel-voice status bytes. Channel 10 (index 9) is the percussion channel. */
export const NOTE_ON = 0x90;
export const NOTE_OFF = 0x80;
export const DRUM_CHANNEL = 9;

/**
 * All notes off, everywhere it could be sounding: the explicit controller on
 * every channel, then note-offs across the range on the channels we use. Some
 * synths ignore CC 123, and a hung note outlives the app.
 */
export function panic(port: MidiPort): void {
    // Drop anything still queued first, or it lands after the silence.
    port.clear();
    for (let ch = 0; ch < 16; ch++) {
        port.send([0xb0 | ch, 123, 0]); // all notes off
        port.send([0xb0 | ch, 120, 0]); // all sound off
    }
    for (const ch of [0, DRUM_CHANNEL]) {
        for (let note = 0; note < 128; note++) port.send([NOTE_OFF | ch, note, 0]);
    }
}

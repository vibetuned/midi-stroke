/**
 * Hardware key lights for ROLI LUMI / Piano keyboards.
 *
 * Verified on a real ROLI Piano: the device lights a key when it RECEIVES a
 * MIDI note-on for it, and clears it on note-off — per key, octave-accurate,
 * chords included, and it works in the device's own colors. So the light
 * guide simply mirrors the expected notes as note-on/off messages to the
 * device's MIDI input. (The reverse-engineered SysEx protocol was a dead end
 * for this: it can only move the ROOT pitch class, which drags the whole
 * scale highlight around with it. True per-LED SysEx control would need a
 * LittleFoot program upload. See src-tauri/examples/lumi_probe.rs for the
 * hardware probe used to establish all this.)
 *
 * Transport: Web MIDI in browsers (no sysex permission needed); the Rust
 * midir shim in the Tauri shell (`midi_outputs` / `midi_send` commands).
 */

const LUMI_NAME = /lumi|roli|piano m/i;

const LIGHT_VELOCITY = 100;

// --- Tauri shim ---------------------------------------------------------

interface TauriInvokeApi {
    core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
}

function tauriInvoke(): TauriInvokeApi['core']['invoke'] | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { __TAURI__?: TauriInvokeApi };
    return w.__TAURI__?.core ? w.__TAURI__.core.invoke.bind(w.__TAURI__.core) : null;
}

// --- The light driver ----------------------------------------------------

type Sender = (bytes: number[]) => void;

let senderPromise: Promise<Sender | null> | null = null;

async function connectWeb(sysex: boolean): Promise<Sender | null> {
    if (!navigator.requestMIDIAccess) {
        console.log('[keylights] no Web MIDI API in this browser');
        return null;
    }
    const access = await navigator.requestMIDIAccess(sysex ? { sysex: true } : undefined);
    const names: string[] = [];
    access.outputs.forEach(o => names.push(o.name ?? '?'));
    console.log(`[keylights] MIDI outputs (sysex=${sysex}):`, names.length ? names : '(none)');
    if (!names.some(n => LUMI_NAME.test(n))) {
        console.log('[keylights] no ROLI/LUMI-like output — lights off');
        return null;
    }
    return (bytes: number[]) => {
        access.outputs.forEach(o => {
            if (LUMI_NAME.test(o.name ?? '')) o.send(bytes);
        });
    };
}

async function connectTauri(invoke: TauriInvokeApi['core']['invoke']): Promise<Sender | null> {
    const outputs = await invoke<string[]>('midi_outputs');
    if (!outputs.some(name => LUMI_NAME.test(name))) return null;
    return (bytes: number[]) => {
        invoke('midi_send', { portMatch: 'lumi|roli|piano m', data: bytes })
            .catch(err => console.error('midi_send failed:', err));
    };
}

/**
 * Lazily connect to a LUMI-like MIDI output. Resolves to null when no such
 * device is present (the light guide then simply stays off). The connection
 * attempt runs once per page load; a device plugged in later is picked up on
 * the next app mount.
 */
function getSender(): Promise<Sender | null> {
    if (!senderPromise) {
        const invoke = tauriInvoke();
        senderPromise = (invoke ? connectTauri(invoke) : connectWeb(false))
            .catch(err => { console.warn('[keylights] note guide unavailable:', err); return null; });
    }
    return senderPromise;
}

// --- Scale-exercise key highlight (SysEx) ---------------------------------
//
// For generated scale exercises the ROOT+SCALE config is exactly right: the
// device paints the exercise's key across the whole keyboard in its own
// colors (verified on a ROLI Piano with the broadcast device byte 0x00).
// Protocol: benob/LUMI-lights SYSEX.txt.

const ROLI_HEADER = [0xf0, 0x00, 0x21, 0x10, 0x77, 0x00];

function lumiChecksum(command: number[]): number {
    let c = command.length;
    for (const b of command) c = (c * 3 + b) & 0xff;
    return c & 0x7f;
}

function lumiFrame(command: number[]): number[] {
    return [...ROLI_HEADER, ...command, lumiChecksum(command), 0xf7];
}

/** Set-root-key command for a pitch class (0=C … 11=B); verified against
 *  the documented examples (C=03 00, C#=23 00, D=43 00, F=23 01, B=63 02). */
function setRootKeySysex(pc: number): number[] {
    return lumiFrame([0x10, 0x30, 0x03 | ((pc & 3) << 5), pc >> 2, 0, 0, 0, 0]);
}

const SCALE_COMMANDS = {
    major: [0x10, 0x60, 0x02, 0x00, 0, 0, 0, 0],
    minor: [0x10, 0x60, 0x22, 0x00, 0, 0, 0, 0],
    harmonicMinor: [0x10, 0x60, 0x42, 0x00, 0, 0, 0, 0],
} as const;
export type HardwareScale = keyof typeof SCALE_COMMANDS;

// "C" / "F#" / "Eb" → pitch class.
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function tonicPitchClass(tonic: string): number | null {
    const base = LETTER_PC[tonic[0]?.toUpperCase() ?? ''];
    if (base === undefined) return null;
    const alter = tonic[1] === '#' ? 1 : tonic[1] === 'b' ? -1 : 0;
    return ((base + alter) % 12 + 12) % 12;
}

// SysEx needs its own Web MIDI grant — requested lazily, so the prompt only
// ever appears for LUMI owners loading a scale exercise. Tauri reuses midi_send.
let sysexSenderPromise: Promise<Sender | null> | null = null;

function getSysexSender(): Promise<Sender | null> {
    if (!sysexSenderPromise) {
        const invoke = tauriInvoke();
        sysexSenderPromise = (invoke ? connectTauri(invoke) : connectWeb(true))
            .catch(err => { console.warn('[keylights] scale highlight unavailable:', err); return null; });
    }
    return sysexSenderPromise;
}

/**
 * Kick off the SysEx permission/connection from inside a user gesture (the
 * scale builder's Start click): Chrome may suppress permission prompts that
 * aren't gesture-driven, and the actual painting happens later in an effect.
 * No-op when already connected or no ROLI device is present.
 */
export function prewarmScaleLights(): void {
    getSysexSender();
}

/** Paint a key across the hardware: root pitch class + scale kind. */
export function configureHardwareScale(tonicPc: number, scale: HardwareScale): void {
    getSysexSender().then(send => {
        if (!send) { console.log('[keylights] no sysex sender — scale paint skipped'); return; }
        console.log(`[keylights] painting scale pc=${tonicPc} ${scale}`);
        send(setRootKeySysex(tonicPc));
        send(lumiFrame([...SCALE_COMMANDS[scale]]));
    });
}

// --- Per-note light guide (note-on/off) -----------------------------------

/** Keys currently lit on the hardware, so updates only send the diff. */
const lit = new Set<number>();

/**
 * Drop keys from the lit-model without sending anything: the device wipes a
 * guide light by itself when the player presses and releases that key (the
 * local key animation overrides our received note-on). Report released keys
 * here so the next lightHardwareKeys() re-sends the note-on when the same
 * note is expected again (repeated notes) instead of diffing it away.
 */
export function forgetHardwareKeys(notes: number[]): void {
    notes.forEach(n => lit.delete(n));
}

/**
 * Light exactly this set of MIDI notes on the hardware — notes no longer in
 * the set are turned off, new ones on. Pass [] to clear everything.
 */
export function lightHardwareKeys(notes: number[]): void {
    const target = new Set(notes.filter(n => n >= 0 && n <= 127));
    const off = [...lit].filter(n => !target.has(n));
    const on = [...target].filter(n => !lit.has(n));
    if (off.length === 0 && on.length === 0) return;
    off.forEach(n => lit.delete(n));
    on.forEach(n => lit.add(n));
    getSender().then(send => {
        if (!send) return;
        for (const n of off) send([0x80, n, 0]);
        for (const n of on) send([0x90, n, LIGHT_VELOCITY]);
    });
}

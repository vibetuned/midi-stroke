/**
 * Which kit piece each incoming MIDI note is: the drum controller's pad map.
 *
 * General MIDI fixes the percussion notes (38 snare, 42 closed hi-hat...), but
 * drum modules only start there. Roland sends hi-hat edge hits on 22 and 26 and
 * a third tom's rim on 58, where GM has a vibraslap; kits differ on the rim and
 * cross-stick; many let every pad be re-assigned. So the app keeps one map from
 * the note a controller sends to the voice it means, defaulting to General MIDI
 * and editable in the drums app (components/drums/DrumMapEditor.tsx).
 *
 * Everything that hears the controller goes through it: the kit sound a hit
 * makes, rhythm-mode scoring and practice-mode waiting. Notes the score and
 * playback produce do not — those are the app's own General MIDI numbers
 * (drumPads.ts), whatever the controller.
 *
 * Pure apart from the small localStorage-backed store at the bottom, so the
 * node checks can run it.
 */

import { PAD_TO_VOICE, type DrumVoiceKey } from './drumPads';

export type DrumMap = Readonly<Record<number, DrumVoiceKey>>;

export interface DrumVoiceInfo {
    key: DrumVoiceKey;
    label: string;
    /** The two-letter name the drum grid uses. */
    short: string;
    /**
     * Where the voice is notated, as the pitch Verovio gives the note. Scoring
     * compares here, so voices sharing a staff position count for each other —
     * rim for snare, open hi-hat for closed, ride for crash — as they always
     * have in rhythm mode: the chart says which to play, both are the drum.
     */
    scorePitch: number;
}

/** The kit, top of the grid to bottom. */
export const DRUM_VOICES: readonly DrumVoiceInfo[] = [
    { key: 'crash', label: 'Crash', short: 'CY', scorePitch: 81 },
    { key: 'ride', label: 'Ride', short: 'CY', scorePitch: 81 },
    { key: 'hatOpen', label: 'Hi-hat, open', short: 'OH', scorePitch: 79 },
    { key: 'hatClosed', label: 'Hi-hat, closed / pedal', short: 'CH', scorePitch: 79 },
    { key: 'tambourine', label: 'Tambourine', short: 'TB', scorePitch: 77 },
    { key: 'cowbell', label: 'Cowbell', short: 'CB', scorePitch: 77 },
    { key: 'tomHigh', label: 'High tom', short: 'HT', scorePitch: 76 },
    { key: 'tomMid', label: 'Mid tom', short: 'MT', scorePitch: 74 },
    { key: 'rim', label: 'Rim shot / cross-stick', short: 'RS', scorePitch: 72 },
    { key: 'snare', label: 'Snare', short: 'SD', scorePitch: 72 },
    { key: 'clap', label: 'Clap', short: 'CP', scorePitch: 64 },
    { key: 'tomLow', label: 'Low / floor tom', short: 'LT', scorePitch: 69 },
    { key: 'kick', label: 'Bass drum', short: 'BD', scorePitch: 65 },
];

const VOICE_INFO = new Map(DRUM_VOICES.map(v => [v.key, v]));
const VOICE_KEYS = new Set<string>(DRUM_VOICES.map(v => v.key));

/** The General MIDI percussion names, to say what a note is "supposed" to be. */
export const GM_PERCUSSION: Readonly<Record<number, string>> = {
    35: 'Acoustic Bass Drum', 36: 'Bass Drum 1', 37: 'Side Stick', 38: 'Acoustic Snare',
    39: 'Hand Clap', 40: 'Electric Snare', 41: 'Low Floor Tom', 42: 'Closed Hi-Hat',
    43: 'High Floor Tom', 44: 'Pedal Hi-Hat', 45: 'Low Tom', 46: 'Open Hi-Hat',
    47: 'Low-Mid Tom', 48: 'Hi-Mid Tom', 49: 'Crash Cymbal 1', 50: 'High Tom',
    51: 'Ride Cymbal 1', 52: 'Chinese Cymbal', 53: 'Ride Bell', 54: 'Tambourine',
    55: 'Splash Cymbal', 56: 'Cowbell', 57: 'Crash Cymbal 2', 58: 'Vibraslap',
    59: 'Ride Cymbal 2', 60: 'Hi Bongo', 61: 'Low Bongo', 62: 'Mute Hi Conga',
    63: 'Open Hi Conga', 64: 'Low Conga', 65: 'High Timbale', 66: 'Low Timbale',
    67: 'High Agogo', 68: 'Low Agogo', 69: 'Cabasa', 70: 'Maracas',
    71: 'Short Whistle', 72: 'Long Whistle', 73: 'Short Guiro', 74: 'Long Guiro',
    75: 'Claves', 76: 'Hi Wood Block', 77: 'Low Wood Block', 78: 'Mute Cuica',
    79: 'Open Cuica', 80: 'Mute Triangle', 81: 'Open Triangle',
};

/** The default: General MIDI, alternates folded in (drumPads.ts). */
export const GM_DRUM_MAP: DrumMap = Object.freeze({ ...PAD_TO_VOICE });

export function voiceInfo(key: DrumVoiceKey): DrumVoiceInfo {
    return VOICE_INFO.get(key)!;
}

/** The voice a controller note plays, if it is assigned. */
export function voiceForInput(map: DrumMap, note: number): DrumVoiceKey | undefined {
    return map[note];
}

/** Where a controller note is notated, if it is assigned. */
export function inputScorePitch(map: DrumMap, note: number): number | undefined {
    const voice = map[note];
    return voice ? voiceInfo(voice).scorePitch : undefined;
}

/**
 * Practice mode waits for General MIDI pads (the score's drums, via
 * padForScoreNote). Does this controller note answer that pad?
 */
export function inputAnswersPad(map: DrumMap, pad: number, note: number): boolean {
    const want = PAD_TO_VOICE[pad];
    const got = inputScorePitch(map, note);
    return want !== undefined && got !== undefined && voiceInfo(want).scorePitch === got;
}

/** The controller notes assigned to a voice, low to high. */
export function notesForVoice(map: DrumMap, voice: DrumVoiceKey): number[] {
    return Object.entries(map)
        .filter(([, v]) => v === voice)
        .map(([n]) => Number(n))
        .sort((a, b) => a - b);
}

/** Assign a note to a voice (moving it off any other), or unassign it (null). */
export function assignNote(map: DrumMap, note: number, voice: DrumVoiceKey | null): DrumMap {
    const next: Record<number, DrumVoiceKey> = { ...map };
    if (voice) next[note] = voice;
    else delete next[note];
    return next;
}

export function sameMap(a: DrumMap, b: DrumMap): boolean {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every(k => a[+k] === b[+k]);
}

/** Read a stored map, dropping anything that is not a note and a known voice. */
export function parseDrumMap(json: string | null): DrumMap | null {
    if (!json) return null;
    try {
        const raw = JSON.parse(json) as { map?: Record<string, unknown> };
        if (!raw || typeof raw !== 'object' || !raw.map || typeof raw.map !== 'object') return null;
        const out: Record<number, DrumVoiceKey> = {};
        for (const [k, v] of Object.entries(raw.map)) {
            const note = Number(k);
            if (Number.isInteger(note) && note >= 0 && note <= 127 && typeof v === 'string' && VOICE_KEYS.has(v)) {
                out[note] = v as DrumVoiceKey;
            }
        }
        return out;
    } catch {
        return null;
    }
}

export function serializeDrumMap(map: DrumMap): string {
    return JSON.stringify({ version: 1, map });
}

// ------------------------------------------------------------------- store

const STORAGE_KEY = 'midi-stroke-drum-map';

function load(): DrumMap {
    try {
        return parseDrumMap(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null) ?? GM_DRUM_MAP;
    } catch {
        return GM_DRUM_MAP;
    }
}

let current: DrumMap = load();
const listeners = new Set<() => void>();

export function getDrumMap(): DrumMap {
    return current;
}

/** Replace the map, remember it on this device, and tell every listener. */
export function setDrumMap(map: DrumMap): void {
    current = map;
    try {
        if (sameMap(map, GM_DRUM_MAP)) globalThis.localStorage?.removeItem(STORAGE_KEY);
        else globalThis.localStorage?.setItem(STORAGE_KEY, serializeDrumMap(map));
    } catch { /* private mode: still applies for this session */ }
    listeners.forEach(fn => fn());
}

export function subscribeDrumMap(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

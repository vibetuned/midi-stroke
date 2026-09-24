import * as Tone from 'tone';
import { createDrumKit, PAD_TO_VOICE, type DrumKit, type DrumVoiceKey } from '../../utils/drumKit';

/**
 * The games' sampled sounds (public/games/sounds/, built by
 * scripts/build-game-sounds.py): the Slingshot's NASA pad, the Conductor's
 * Spellsinger, Rhythm echo's space voices, and the Groove Builder's kit cut
 * from Perseverance on Mars. Each file is fetched and decoded once a
 * session. A game asks for its instrument when it starts; if the files
 * cannot be had it keeps the synthesized voice it had before, so a game
 * always has sound.
 */

const BASE = `${import.meta.env.BASE_URL}games/sounds/`;

/** A sampled instrument: a file for each MIDI note it was recorded at; others are pitched from the nearest. */
export type SampleSet = Record<number, string>;

export const SOUNDS = {
    /** Nasa Space Pad: the sonar ping, pitched, and the take-off rumble under it. */
    slingshot: { 59: 'slingshot/sonar-59.mp3' } as SampleSet,
    slingshotTexture: { 61: 'slingshot/takeoff-61.mp3' } as SampleSet,
    /** The Spellsinger, six notes G♯3–D5. */
    choir: { 56: 'conductor/voice-56.mp3', 61: 'conductor/voice-61.mp3', 64: 'conductor/voice-64.mp3', 67: 'conductor/voice-67.mp3', 71: 'conductor/voice-71.mp3', 74: 'conductor/voice-74.mp3' } as SampleSet,
    /** Space Voices: the whistle is the star's, the hums are Earth's. */
    star: { 56: 'echo/star-56.mp3' } as SampleSet,
    earth: { 48: 'echo/earth-48.mp3', 55: 'echo/earth-55.mp3' } as SampleSet,
    /** Perseverance and InSight: the parts the grooves use; the rest come from the drums app's kit. */
    kit: {
        kick: 'groove/kick.mp3', snare: 'groove/snare.mp3', rim: 'groove/rim.mp3', hatClosed: 'groove/hat-closed.mp3', hatOpen: 'groove/hat-open.mp3',
        cowbell: 'groove/cowbell.mp3', tomLow: 'groove/tom-low.mp3', tomMid: 'groove/tom-mid.mp3', tomHigh: 'groove/tom-high.mp3',
    } as Partial<Record<DrumVoiceKey, string>>,
};

const decoded = new Map<string, Promise<Tone.ToneAudioBuffer | null>>();

/**
 * A file, decoded once, with the silence before its first sound cut off: an
 * MP3 begins with its encoder's padding (tens of milliseconds, kept or not
 * by the browser), and a drum hit that late would miss its step.
 */
export function loadSample(file: string): Promise<Tone.ToneAudioBuffer | null> {
    let p = decoded.get(file);
    if (!p) {
        p = new Promise(resolve => {
            const buffer = new Tone.ToneAudioBuffer(BASE + file, () => resolve(trimLead(buffer)), () => resolve(null));
        });
        decoded.set(file, p);
    }
    return p;
}

function trimLead(buffer: Tone.ToneAudioBuffer): Tone.ToneAudioBuffer {
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const threshold = Math.max(peak * 0.02, 1e-4);
    let i = 0;
    while (i < data.length && Math.abs(data[i]) < threshold) i++;
    const start = Math.max(0, i - Math.round(buffer.sampleRate * 0.0005)) / buffer.sampleRate;
    return start > 0.0005 ? buffer.slice(start) : buffer;
}

/** Start fetching a game's sounds early (as its screen opens), so they are ready by the first press. */
export function preload(...sets: Array<SampleSet | Partial<Record<string, string>>>): void {
    for (const set of sets) for (const file of Object.values(set)) if (file) void loadSample(file);
}

/** Wait for something, but not forever: after `ms`, go on without it. */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([p, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))]);
}

/** A sampler from a set, or null when a file cannot be had in time. */
export async function sampler(set: SampleSet, options: { release?: number; attack?: number; volume?: number } = {}): Promise<Tone.Sampler | null> {
    const entries = await within(Promise.all(Object.entries(set).map(async ([midi, file]) => [midi, await loadSample(file)] as const)), 4000);
    if (!entries || entries.some(([, b]) => !b)) return null;
    const urls: Record<string, Tone.ToneAudioBuffer> = {};
    for (const [midi, b] of entries) urls[midi] = b!;
    return new Tone.Sampler({ urls, release: options.release ?? 0.25, attack: options.attack ?? 0.005, volume: options.volume ?? 0 });
}

/** Octaves to move a line by so its middle sits in [lo, hi] — where its samples sound best. */
export function octavesInto(pitches: number[], lo: number, hi: number): number {
    const sorted = pitches.filter(p => Number.isFinite(p)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    let mid = sorted[Math.floor(sorted.length / 2)], shift = 0;
    while (mid > hi) { mid -= 12; shift -= 12; }
    while (mid < lo) { mid += 12; shift += 12; }
    return shift;
}

/** The note each Mars voice is kept under in its sampler. */
const KIT_NOTE: Partial<Record<DrumVoiceKey, number>> = {
    kick: 36, snare: 38, rim: 37, hatClosed: 42, hatOpen: 46, cowbell: 56, tomLow: 43, tomMid: 47, tomHigh: 50,
};

/**
 * The Mars kit, as a DrumKit: the parts cut from Perseverance, each played
 * as recorded; any other part from the drums app's synthesized kit. Falls
 * back to that kit whole if the samples cannot be had.
 */
export async function marsKit(): Promise<DrumKit> {
    const synth = createDrumKit();
    const set: SampleSet = {};
    for (const [voice, file] of Object.entries(SOUNDS.kit)) if (file) set[KIT_NOTE[voice as DrumVoiceKey]!] = file;
    const s = await sampler(set, { release: 0.05, attack: 0 });
    if (!s) return synth;
    const out = new Tone.Volume(-2).toDestination();
    s.connect(out);
    const play = (voice: DrumVoiceKey, velocity = 0.8, time?: number) => {
        const note = KIT_NOTE[voice];
        const at = time ?? Tone.now();
        if (note === undefined) { synth.play(voice, velocity, at); return; }
        // A closed hat shuts the open one, the way the pedal does.
        if (voice === 'hatClosed' || voice === 'hatOpen') s.triggerRelease(Tone.Frequency(KIT_NOTE.hatOpen!, 'midi').toFrequency(), at);
        s.triggerAttack(Tone.Frequency(note, 'midi').toFrequency(), at, Math.max(0.05, Math.min(1, velocity)));
    };
    return {
        trigger(pad, velocity = 0.8, time) {
            const voice = PAD_TO_VOICE[pad];
            if (!voice) return false;
            play(voice, velocity, time);
            return true;
        },
        play,
        get volume() { return out.volume; },
        voices: synth.voices,
        allOff() { s.releaseAll(); synth.allOff(); },
        dispose() { s.dispose(); out.dispose(); synth.dispose(); },
    };
}

/** A voice held while a key is: one note at a time, the Slingshot's and Earth's. */
export interface HeldVoice {
    attack(freq: number, time: number, velocity?: number): void;
    release(time: number): void;
    dispose(): void;
}

/** Sampled layers sounding together as one held voice, into `out`; null when the samples cannot be had. */
export async function heldSampler(layers: Array<{ set: SampleSet; volume?: number; release?: number }>, out: Tone.InputNode): Promise<HeldVoice | null> {
    const samplers = await Promise.all(layers.map(l => sampler(l.set, { volume: l.volume ?? 0, release: l.release ?? 0.2 })));
    if (samplers.some(s => !s)) { samplers.forEach(s => s?.dispose()); return null; }
    const ss = samplers as Tone.Sampler[];
    ss.forEach(s => s.connect(out));
    let sounding: number | null = null;
    return {
        attack(freq, time, velocity = 1) {
            if (sounding !== null) ss.forEach(s => s.triggerRelease(sounding!, time));
            sounding = freq;
            ss.forEach(s => s.triggerAttack(freq, time, velocity));
        },
        release(time) {
            if (sounding === null) return;
            ss.forEach(s => s.triggerRelease(sounding!, time));
            sounding = null;
        },
        dispose() { ss.forEach(s => s.dispose()); },
    };
}

/** A synthesized voice as a held voice: what a game falls back to. */
export function heldSynth(synth: Tone.Synth): HeldVoice {
    return {
        attack: (freq, time, velocity = 1) => synth.triggerAttack(freq, time, velocity),
        release: time => synth.triggerRelease(time),
        dispose: () => synth.dispose(),
    };
}

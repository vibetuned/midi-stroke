/**
 * A synthesized drum kit for the Drums app.
 *
 * The piano sampler was never right here: a pad hit came out as a piano note
 * at whatever pitch the pad happened to map to. This gives every pad its own
 * voice, built the way the saxo reed tone is — from oscillators, noise and
 * envelopes rather than a sample library.
 *
 * Why synthesis and not samples: the app notates twelve voices (kick, snare,
 * rim, closed and open hi-hat, ride/crash, three toms, clap, cowbell,
 * tambourine), and the sample kits on the Tone.js CDN carry six — kick, snare,
 * hi-hat and three toms. Half the kit would have been silent or wrong.
 * Synthesis covers all of it in one coherent character, needs no download, and
 * works offline in the desktop app, where the piano samples do not.
 *
 * Each voice is velocity-sensitive and one-shot: drums have no note-off, so
 * `trigger()` plays the whole sound. Closed hi-hat chokes the open one, as a
 * real pedal does.
 *
 * Pad numbers are General MIDI percussion, matching MIDI_PAD_MAP in useMidi:
 * alternates are folded in (both snare pads, all the cymbal pads, both pads
 * per tom), so every pad on a GM controller makes the sound it is labelled.
 */

import * as Tone from 'tone';

export type DrumVoiceKey =
    | 'kick' | 'snare' | 'rim' | 'hatClosed' | 'hatOpen' | 'ride' | 'crash'
    | 'tomLow' | 'tomMid' | 'tomHigh' | 'clap' | 'cowbell' | 'tambourine';

/** General MIDI percussion note → voice. */
export const PAD_TO_VOICE: Record<number, DrumVoiceKey> = {
    35: 'kick', 36: 'kick',
    37: 'rim',
    38: 'snare', 40: 'snare',
    39: 'clap',
    41: 'tomLow', 43: 'tomLow', 45: 'tomMid', 47: 'tomMid', 48: 'tomHigh', 50: 'tomHigh',
    42: 'hatClosed', 44: 'hatClosed',
    46: 'hatOpen',
    49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash',
    51: 'ride', 53: 'ride', 59: 'ride',
    54: 'tambourine',
    56: 'cowbell',
};

export interface DrumKit {
    /** Play a pad. Returns false when the note maps to no voice. */
    trigger(pad: number, velocity?: number, time?: number): boolean;
    /** Master volume in dB, same shape as a Tone instrument's. */
    readonly volume: Tone.Param<'decibels'>;
    /** Voice keys, for diagnostics and tests. */
    readonly voices: DrumVoiceKey[];
    dispose(): void;
}

interface Voice {
    play(time: number, velocity: number): void;
    /** Cut this voice short — the hi-hat pedal closing on an open hat. */
    choke?(time: number): void;
    dispose(): void;
}

/** Noise through an envelope and a filter: hats, snare wash, clap, tambourine. */
function noiseVoice(opts: {
    destination: Tone.InputNode;
    type: Tone.NoiseType;
    filter: { type: BiquadFilterType; frequency: number; Q?: number };
    envelope: { attack: number; decay: number; sustain?: number; release: number };
    hold?: number;
    gain: number;
}): Voice {
    const noise = new Tone.Noise(opts.type).start();
    const env = new Tone.AmplitudeEnvelope({
        attack: opts.envelope.attack,
        decay: opts.envelope.decay,
        sustain: opts.envelope.sustain ?? 0,
        release: opts.envelope.release,
    });
    const filter = new Tone.Filter({
        type: opts.filter.type,
        frequency: opts.filter.frequency,
        Q: opts.filter.Q ?? 1,
    });
    const gain = new Tone.Gain(opts.gain);
    noise.connect(env);
    env.connect(filter);
    filter.connect(gain);
    gain.connect(opts.destination);
    return {
        play(time, velocity) {
            env.triggerAttackRelease(opts.hold ?? 0.001, time, velocity);
        },
        choke(time) {
            env.triggerRelease(time);
        },
        dispose() {
            noise.stop().dispose(); env.dispose(); filter.dispose(); gain.dispose();
        },
    };
}

/** A tuned membrane: kick and toms. */
function membraneVoice(opts: {
    destination: Tone.InputNode;
    note: Tone.Unit.Frequency;
    pitchDecay: number;
    octaves: number;
    decay: number;
    duration: Tone.Unit.Time;
    gain: number;
}): Voice {
    const gain = new Tone.Gain(opts.gain).connect(opts.destination);
    const synth = new Tone.MembraneSynth({
        pitchDecay: opts.pitchDecay,
        octaves: opts.octaves,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: opts.decay, sustain: 0, release: 0.06 },
    }).connect(gain);
    return {
        play(time, velocity) {
            synth.triggerAttackRelease(opts.note, opts.duration, time, velocity);
        },
        dispose() { synth.dispose(); gain.dispose(); },
    };
}

/**
 * Cymbals, built as an oscillator bank rather than with Tone's MetalSynth:
 * a bare MetalSynth in this version stays silent for about a second after it
 * is triggered and then bursts, which is useless for a drum pad (measured in
 * the offline probe, every configuration, including the default).
 *
 * This is the classic analog recipe instead — six square waves at inharmonic
 * ratios, plus a noise wash, through a high-pass. Two envelopes: a bright
 * short one for the stick, a long one for the body.
 */
function cymbalVoice(opts: {
    destination: Tone.InputNode;
    /** Ratios are the 808's; `base` moves the whole bank. */
    base: number;
    highpass: number;
    bodyDecay: number;
    /** How long the cymbal rings after the stick — its release, in seconds. */
    ring: number;
    stickDecay: number;
    noiseGain: number;
    gain: number;
}): Voice {
    const RATIOS = [1, 1.483, 1.8, 2.545, 2.63, 3.895];
    const gain = new Tone.Gain(opts.gain).connect(opts.destination);
    const highpass = new Tone.Filter({ type: 'highpass', frequency: opts.highpass, Q: 0.7 }).connect(gain);
    const shimmer = new Tone.Filter({ type: 'bandpass', frequency: opts.highpass * 1.6, Q: 0.6 }).connect(gain);

    const body = new Tone.AmplitudeEnvelope({
        attack: 0.001, decay: opts.bodyDecay, sustain: 0.25, release: opts.ring,
    }).connect(highpass);
    const stick = new Tone.AmplitudeEnvelope({ attack: 0.0005, decay: opts.stickDecay, sustain: 0, release: 0.05 }).connect(shimmer);

    const oscs = RATIOS.map(r => new Tone.Oscillator({ frequency: opts.base * r, type: 'square' }).start());
    oscs.forEach(o => { o.connect(body); o.connect(stick); });

    const noise = new Tone.Noise('white').start();
    const noiseGain = new Tone.Gain(opts.noiseGain);
    noise.connect(noiseGain);
    noiseGain.connect(body);
    noiseGain.connect(stick);

    return {
        play(time, velocity) {
            body.triggerAttackRelease(0.02, time, velocity);
            stick.triggerAttackRelease(0.01, time, velocity);
        },
        choke(time) { body.triggerRelease(time); stick.triggerRelease(time); },
        dispose() {
            oscs.forEach(o => o.stop().dispose());
            noise.stop().dispose(); noiseGain.dispose();
            body.dispose(); stick.dispose(); highpass.dispose(); shimmer.dispose(); gain.dispose();
        },
    };
}

/** Two detuned squares through a band-pass: the 808 cowbell. */
function cowbellVoice(destination: Tone.InputNode): Voice {
    const gain = new Tone.Gain(0.24).connect(destination);
    const filter = new Tone.Filter({ type: 'bandpass', frequency: 2640, Q: 1.2 }).connect(gain);
    const env = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.22, sustain: 0, release: 0.08 }).connect(filter);
    const oscA = new Tone.Oscillator({ frequency: 540, type: 'square' }).connect(env).start();
    const oscB = new Tone.Oscillator({ frequency: 800, type: 'square' }).connect(env).start();
    return {
        play(time, velocity) { env.triggerAttackRelease(0.02, time, velocity); },
        dispose() { oscA.stop().dispose(); oscB.stop().dispose(); env.dispose(); filter.dispose(); gain.dispose(); },
    };
}

/** Several noise bursts a few milliseconds apart, then a short tail. */
function clapVoice(destination: Tone.InputNode): Voice {
    const gain = new Tone.Gain(0.89).connect(destination);
    const filter = new Tone.Filter({ type: 'bandpass', frequency: 1100, Q: 1.1 }).connect(gain);
    const burst = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.012, sustain: 0, release: 0.01 }).connect(filter);
    const tail = new Tone.AmplitudeEnvelope({ attack: 0.002, decay: 0.16, sustain: 0, release: 0.05 }).connect(filter);
    const noise = new Tone.Noise('white').start();
    noise.connect(burst);
    noise.connect(tail);
    return {
        play(time, velocity) {
            // Three quick slaps, then the room.
            for (let i = 0; i < 3; i++) burst.triggerAttackRelease(0.008, time + i * 0.011, velocity);
            tail.triggerAttackRelease(0.01, time + 0.028, velocity * 0.7);
        },
        dispose() { noise.stop().dispose(); burst.dispose(); tail.dispose(); filter.dispose(); gain.dispose(); },
    };
}

/**
 * Build the kit. Every voice hangs off one Volume node, so muting and the
 * level control work exactly like the sampler they replace.
 */
export function createDrumKit(): DrumKit {
    // Voices → level → limiter → out. Kit pieces land on the same beat all the
    // time, and four full-velocity hits together summed past full scale before
    // the limiter went in.
    const limiter = new Tone.Limiter(-1).toDestination();
    const master = new Tone.Volume(-3).connect(limiter);
    const voices = {} as Record<DrumVoiceKey, Voice>;

    // Low and round, with a fast pitch drop for the beater.
    voices.kick = membraneVoice({
        destination: master, note: 'C1', pitchDecay: 0.045, octaves: 6,
        decay: 0.38, duration: '8n', gain: 0.54,
    });

    // Snare: a tuned body under a band of noise.
    const snareNoise = noiseVoice({
        destination: master, type: 'white',
        filter: { type: 'highpass', frequency: 1800, Q: 0.8 },
        envelope: { attack: 0.001, decay: 0.14, release: 0.04 },
        gain: 0.42,
    });
    const snareBody = membraneVoice({
        destination: master, note: 'G3', pitchDecay: 0.018, octaves: 1.5,
        decay: 0.10, duration: '32n', gain: 0.10,
    });
    voices.snare = {
        play(time, velocity) { snareBody.play(time, velocity); snareNoise.play(time, velocity); },
        dispose() { snareBody.dispose(); snareNoise.dispose(); },
    };

    // Rim: a sharp tick, nearly all transient.
    voices.rim = noiseVoice({
        destination: master, type: 'white',
        filter: { type: 'bandpass', frequency: 2400, Q: 2.4 },
        envelope: { attack: 0.0005, decay: 0.035, release: 0.02 },
        gain: 1.17,
    });

    // Hi-hats share a character; only the decay differs.
    voices.hatClosed = noiseVoice({
        destination: master, type: 'white',
        filter: { type: 'highpass', frequency: 8200, Q: 1.2 },
        envelope: { attack: 0.0005, decay: 0.045, release: 0.02 },
        gain: 0.31,
    });
    voices.hatOpen = noiseVoice({
        destination: master, type: 'white',
        filter: { type: 'highpass', frequency: 7200, Q: 1.2 },
        envelope: { attack: 0.001, decay: 0.42, release: 0.12 },
        hold: 0.18,
        gain: 0.22,
    });

    // Ride: tighter and more focused, with the stick "ping" on top.
    voices.ride = cymbalVoice({
        destination: master, base: 330, highpass: 5200,
        bodyDecay: 0.6, ring: 1.4, stickDecay: 0.10, noiseGain: 0.12, gain: 0.10,
    });
    // Crash: lower, wider, and much longer.
    voices.crash = cymbalVoice({
        destination: master, base: 290, highpass: 3400,
        bodyDecay: 0.8, ring: 2.6, stickDecay: 0.16, noiseGain: 0.3, gain: 0.084,
    });

    voices.tomLow = membraneVoice({
        destination: master, note: 'G1', pitchDecay: 0.03, octaves: 3,
        decay: 0.5, duration: '8n', gain: 0.41,
    });
    voices.tomMid = membraneVoice({
        destination: master, note: 'C2', pitchDecay: 0.028, octaves: 3,
        decay: 0.42, duration: '8n', gain: 0.41,
    });
    voices.tomHigh = membraneVoice({
        destination: master, note: 'F2', pitchDecay: 0.025, octaves: 3,
        decay: 0.34, duration: '8n', gain: 0.41,
    });

    voices.clap = clapVoice(master);
    voices.cowbell = cowbellVoice(master);

    voices.tambourine = noiseVoice({
        destination: master, type: 'white',
        filter: { type: 'bandpass', frequency: 7600, Q: 0.9 },
        envelope: { attack: 0.001, decay: 0.19, release: 0.08 },
        gain: 0.33,
    });

    return {
        trigger(pad, velocity = 0.8, time) {
            const key = PAD_TO_VOICE[pad];
            if (!key) return false;
            const at = time ?? Tone.now();
            // A closed hat shuts the open one, the way the pedal does.
            if (key === 'hatClosed' || key === 'hatOpen') voices.hatOpen.choke?.(at);
            voices[key].play(at, Math.max(0.05, Math.min(1, velocity)));
            return true;
        },
        get volume() { return master.volume; },
        voices: Object.keys(voices) as DrumVoiceKey[],
        dispose() {
            Object.values(voices).forEach(v => v.dispose());
            master.dispose();
            limiter.dispose();
        },
    };
}

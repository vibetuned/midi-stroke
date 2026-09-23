import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useMidiNotes } from './useMidi';
import { useGame } from '../context/game';
import { createDrumKit, padForScoreNote, type DrumKit } from '../utils/drumKit';
import { getDrumMap, voiceForInput } from '../utils/drumMap';
import { registerPlaybackVoice, schedulePlayback } from '../utils/playback';

export function useAudio() {
    // Piano sampler for piano/theory, a reed-ish PolySynth for saxo — both
    // pitched, both exposing triggerAttack(freq, time, vel) / triggerRelease().
    // Drums are different in kind: a pad is a one-shot voice, not a pitch, so
    // they get a synthesized kit (see utils/drumKit.ts) triggered by pad number.
    const samplerRef = useRef<Tone.Sampler | Tone.PolySynth | null>(null);
    const drumKitRef = useRef<DrumKit | null>(null);
    const extraNodesRef = useRef<Tone.ToneAudioNode[]>([]);
    const metronomeRef = useRef<Tone.MembraneSynth | null>(null);
    const { isAudioStarted, isMetronomeMuted, gameMode, instrument, timemap, playbackTarget, tempoLock } = useGame();
    // An accompaniment keeps the time itself; the click would only fight it.
    const accompaniedRef = useRef(tempoLock !== null);
    useEffect(() => { accompaniedRef.current = tempoLock !== null; }, [tempoLock]);
    // Only the piano samples take time to arrive; the drum kit and the saxo
    // synth are ready the moment the engine is built.
    const [samplesLoaded, setSamplesLoaded] = useState(false);
    const isLoaded = isAudioStarted && (instrument === 'drums' || instrument === 'saxo' || samplesLoaded);

    // Master mute: silences the metronome AND the player-input instrument.
    // Mirrored in a ref so the (re)init effect can apply the current state
    // when it recreates the engine without re-running on every toggle.
    const mutedRef = useRef(isMetronomeMuted);
    useEffect(() => { mutedRef.current = isMetronomeMuted; }, [isMetronomeMuted]);
    // Base (unmuted) volume of the player-input instrument.
    const instrumentBaseVolume = instrument === 'saxo' ? -10 : 0;

    // Initialize Audio Engine
    useEffect(() => {
        if (!isAudioStarted) return;

        // 1. Create the player-input instrument.
        if (instrument === 'drums') {
            // Nothing to download: the kit is ready on the first hit.
            const kit = createDrumKit();
            kit.volume.value = mutedRef.current ? -100 : 0;
            drumKitRef.current = kit;
        } else if (instrument === 'saxo') {
            // Reed-ish tone: sawtooth through a lowpass + gentle vibrato.
            const filter = new Tone.Filter({ type: 'lowpass', frequency: 2600, Q: 0.7 }).toDestination();
            const vibrato = new Tone.Vibrato({ frequency: 5, depth: 0.08 }).connect(filter);
            const synth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'sawtooth' },
                envelope: { attack: 0.04, decay: 0.18, sustain: 0.82, release: 0.3 },
                volume: mutedRef.current ? -100 : -10,
            }).connect(vibrato);
            samplerRef.current = synth;
            extraNodesRef.current = [vibrato, filter];
        } else {
        const sampler = new Tone.Sampler({
            urls: {
                "A0": "A0.mp3",
                "C1": "C1.mp3",
                "D#1": "Ds1.mp3",
                "F#1": "Fs1.mp3",
                "A1": "A1.mp3",
                "C2": "C2.mp3",
                "D#2": "Ds2.mp3",
                "F#2": "Fs2.mp3",
                "A2": "A2.mp3",
                "C3": "C3.mp3",
                "D#3": "Ds3.mp3",
                "F#3": "Fs3.mp3",
                "A3": "A3.mp3",
                "C4": "C4.mp3",
                "D#4": "Ds4.mp3",
                "F#4": "Fs4.mp3",
                "A4": "A4.mp3",
                "C5": "C5.mp3",
                "D#5": "Ds5.mp3",
                "F#5": "Fs5.mp3",
                "A5": "A5.mp3",
                "C6": "C6.mp3",
                "D#6": "Ds6.mp3",
                "F#6": "Fs6.mp3",
                "A6": "A6.mp3",
                "C7": "C7.mp3",
                "D#7": "Ds7.mp3",
                "F#7": "Fs7.mp3",
                "A7": "A7.mp3",
                "C8": "C8.mp3"
            },
            release: 1,
            volume: mutedRef.current ? -100 : 0,
            baseUrl: "https://tonejs.github.io/audio/salamander/",
            onload: () => {
                console.log("Sampler loaded");
                setSamplesLoaded(true);
            }
        }).toDestination();

        samplerRef.current = sampler;
        }

        // 2. Hand the instrument to playback (utils/playback.ts), so a played
        //    score sounds on the very voice the player hears themselves on
        //    rather than loading a second copy of it.
        registerPlaybackVoice({
            note(midi, durationSec, time, velocity, head) {
                const kit = drumKitRef.current;
                if (kit) {
                    const pad = padForScoreNote(midi, head);
                    if (pad !== undefined) kit.trigger(pad, velocity, time);
                    return;
                }
                const instrumentVoice = samplerRef.current;
                if (!instrumentVoice) return;
                // The piano samples come over the network: until they are in,
                // a note would throw inside playback's timer, not just be silent.
                if (instrumentVoice instanceof Tone.Sampler && !instrumentVoice.loaded) return;
                const freq = Tone.Frequency(midi, 'midi').toFrequency();
                instrumentVoice.triggerAttackRelease(freq, durationSec, time, velocity);
            },
            allOff() {
                drumKitRef.current?.allOff();
                const instrumentVoice = samplerRef.current;
                if (instrumentVoice instanceof Tone.PolySynth) instrumentVoice.releaseAll();
                else if (instrumentVoice instanceof Tone.Sampler) instrumentVoice.releaseAll();
            },
        });

        // 3. Create Metronome Synth
        const metro = new Tone.MembraneSynth({
            envelope: {
                attack: 0.001,
                decay: 0.1,
                sustain: 0,
                release: 0.1
            },
            volume: mutedRef.current ? -100 : -10
        }).toDestination();
        metronomeRef.current = metro;

        // 4. Setup Transport Loop
        const loopId = Tone.getTransport().scheduleRepeat((time) => {
            if (gameMode !== 'practice' && !accompaniedRef.current) {
                metro.triggerAttackRelease("C1", "8n", time);
            }
        }, "4n");

        console.log("Audio Engine Initialized");

        return () => {
            registerPlaybackVoice(null);
            samplerRef.current?.dispose();
            drumKitRef.current?.dispose();
            extraNodesRef.current.forEach(n => n.dispose());
            extraNodesRef.current = [];
            metro.dispose();
            Tone.getTransport().clear(loopId);
            samplerRef.current = null;
            drumKitRef.current = null;
            metronomeRef.current = null;
        };
    }, [isAudioStarted, gameMode, instrument]);

    // Handle Mute — master mute: metronome + player-input instrument
    useEffect(() => {
        if (metronomeRef.current) {
            metronomeRef.current.volume.value = isMetronomeMuted ? -100 : -10;
        }
        if (samplerRef.current) {
            samplerRef.current.volume.value = isMetronomeMuted ? -100 : instrumentBaseVolume;
        }
        if (drumKitRef.current) {
            drumKitRef.current.volume.value = isMetronomeMuted ? -100 : instrumentBaseVolume;
        }
    }, [isMetronomeMuted, instrumentBaseVolume]);

    // Sound the score itself as the playhead reaches it — on the app's own
    // instrument, or out to a MIDI port. Scheduling on the transport means it
    // follows the tempo slider, seeking and the practice-mode pauses for free.
    useEffect(() => {
        if (!isAudioStarted || !timemap || playbackTarget === 'off') return;
        return schedulePlayback(timemap, {
            target: playbackTarget,
            drums: instrument === 'drums',
        });
    }, [isAudioStarted, timemap, playbackTarget, instrument]);

    // The transport's BPM is set by GameProvider, which knows the score's own
    // tempo map as well as the slider (see utils/tempo.ts).

    // The player's own notes, as they arrive: one call per note-on and
    // note-off, so a pad struck again the moment it was released still
    // sounds, and the app is not re-rendered for every key.
    useMidiNotes({
        onNoteOn: hit => {
            if (!isLoaded || Tone.getContext().state !== 'running') return;
            const vel = hit.velocity / 127;
            if (drumKitRef.current) {
                // Drums are one-shots, so there is no frequency and nothing
                // to release. The pad map says which voice this controller's
                // note is (read at the hit, so an edit in the pad map editor
                // is heard at once).
                const voice = voiceForInput(getDrumMap(), hit.note);
                if (voice) drumKitRef.current.play(voice, vel);
            } else {
                samplerRef.current?.triggerAttack(Tone.Frequency(hit.note, 'midi').toFrequency(), Tone.now(), vel);
            }
        },
        onNoteOff: note => {
            if (drumKitRef.current) return;
            samplerRef.current?.triggerRelease(Tone.Frequency(note, 'midi').toFrequency());
        },
    });

    // A getter rather than the instrument itself: read at play time it is
    // always the live one, even after the engine has been rebuilt (a value
    // handed out during render would be the one from that render).
    const getSampler = useCallback(() => samplerRef.current, []);

    return {
        getSampler,
        isLoaded
    };
}

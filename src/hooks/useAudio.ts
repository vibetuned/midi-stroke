import { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useMidi } from './useMidi';
import { useGame } from '../context/GameContext';

export function useAudio() {
    const samplerRef = useRef<Tone.Sampler | null>(null);
    const metronomeRef = useRef<Tone.MembraneSynth | null>(null);
    const { activeNotes } = useMidi();
    const { isAudioStarted, isPlaying, tempo, isMetronomeMuted, gameMode } = useGame();
    const [isLoaded, setIsLoaded] = useState(false);

    // Initialize Audio Engine
    useEffect(() => {
        if (!isAudioStarted) return;

        // 1. Create Sampler
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
            baseUrl: "https://tonejs.github.io/audio/salamander/",
            onload: () => {
                console.log("Sampler loaded");
                setIsLoaded(true);
            }
        }).toDestination();

        samplerRef.current = sampler;

        // 2. Create Metronome Synth
        const metro = new Tone.MembraneSynth({
            envelope: {
                attack: 0.001,
                decay: 0.1,
                sustain: 0,
                release: 0.1
            },
            volume: -10
        }).toDestination();
        metronomeRef.current = metro;

        // 3. Setup Transport Loop
        const loopId = Tone.getTransport().scheduleRepeat((time) => {
            if (gameMode !== 'practice') {
                metro.triggerAttackRelease("C1", "8n", time);
            }
        }, "4n");

        console.log("Audio Engine Initialized");

        return () => {
            sampler.dispose();
            metro.dispose();
            Tone.getTransport().clear(loopId);
            samplerRef.current = null;
            metronomeRef.current = null;
        };
    }, [isAudioStarted, gameMode]);

    // Handle Metronome Mute
    useEffect(() => {
        if (metronomeRef.current) {
            metronomeRef.current.volume.value = isMetronomeMuted ? -100 : -10;
        }
    }, [isMetronomeMuted]);

    // Handle Transport Play/Pause & Tempo
    useEffect(() => {
        if (!isAudioStarted) return;

        Tone.getTransport().bpm.value = tempo;

        if (isPlaying) {
            if (Tone.getTransport().state !== 'started') {
                Tone.getTransport().start();
            }
        } else {
            if (Tone.getTransport().state !== 'stopped') {
                Tone.getTransport().pause();
            }
        }
    }, [isPlaying, tempo, isAudioStarted]);

    // Handle Incoming MIDI Notes (Active Notes)
    const prevNotesRef = useRef<Map<number, { velocity: number, timestamp: number }>>(new Map());

    useEffect(() => {
        if (!samplerRef.current || !isLoaded) return;

        const prev = prevNotesRef.current;

        // Find newly added or changed notes
        activeNotes.forEach((data, note) => {
            const { velocity } = data;
            if (!prev.has(note)) {
                // Note On
                if (Tone.getContext().state === 'running') {
                    const freq = Tone.Frequency(note, "midi").toFrequency();
                    // Normalize velocity (0-127) to (0-1)
                    const vel = velocity / 127;
                    samplerRef.current?.triggerAttack(freq, Tone.now(), vel);
                }
            }
        });

        // Find removed notes
        prev.forEach((_, note) => {
            if (!activeNotes.has(note)) {
                // Note Off
                const freq = Tone.Frequency(note, "midi").toFrequency();
                samplerRef.current?.triggerRelease(freq);
            }
        });

        prevNotesRef.current = new Map(activeNotes);
    }, [activeNotes, isLoaded]);

    return {
        sampler: samplerRef.current,
        isLoaded
    };
}

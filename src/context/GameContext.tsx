import React, { createContext, useContext, useState, useEffect, type ReactNode, useCallback } from 'react';
import * as Tone from 'tone';

interface GameState {
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    tempo: number;
    setTempo: (tempo: number) => void;
    currentMeasure: number;
    setCurrentMeasure: (measure: number) => void;
    isAudioStarted: boolean;
    setAudioStarted: (started: boolean) => void;
    isMetronomeMuted: boolean;
    setMetronomeMuted: (muted: boolean) => void;
    pianoRange: { min: number; max: number } | null;
    setPianoRange: (range: { min: number; max: number } | null) => void;
    playSize: number;
    setPlaySize: (size: number) => void;
    playSizeTicks: number;
    setPlaySizeTicks: (ticks: number) => void;
    playPosition: number;
    setPlayPosition: (pos: number) => void;
    loadMidiData: (base64: string) => void;
}

const GameContext = createContext<GameState | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [tempo, setTempo] = useState(120);
    const [currentMeasure, setCurrentMeasure] = useState(1);
    const [isAudioStarted, setAudioStarted] = useState(false);
    const [isMetronomeMuted, setMetronomeMuted] = useState(false);
    const [pianoRange, setPianoRange] = useState<{ min: number; max: number } | null>(null);
    const [playSize, setPlaySize] = useState(0);
    const [playSizeTicks, setPlaySizeTicks] = useState(0);
    const [playPosition, setPlayPosition] = useState(0);

    const loadMidiData = useCallback((base64: string) => {
        import('@tonejs/midi').then(({ Midi }) => {
            try {
                const binaryString = window.atob(base64);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const midi = new Midi(bytes);

                const tonePPQ = Tone.getTransport().PPQ;
                const midiPPQ = midi.header.ppq;
                const ppqRatio = tonePPQ / midiPPQ;
                const adjustedTicks = midi.durationTicks * ppqRatio;

                console.log(`Midi Loaded. PPQ[Tone/Midi]: ${tonePPQ}/${midiPPQ}. DurationTicks: ${midi.durationTicks} -> ${adjustedTicks}`);

                setPlaySize(midi.duration);
                setPlaySizeTicks(adjustedTicks);
            } catch (error) {
                console.error("Error parsing MIDI data:", error);
            }
        });
    }, []);

    return (
        <GameContext.Provider value={{
            isPlaying,
            setIsPlaying,
            tempo,
            setTempo,
            currentMeasure,
            setCurrentMeasure,
            isAudioStarted,
            setAudioStarted,
            isMetronomeMuted,
            setMetronomeMuted,
            pianoRange,
            setPianoRange,
            playSize,
            setPlaySize,
            playSizeTicks,
            setPlaySizeTicks,
            playPosition,
            setPlayPosition,
            loadMidiData
        }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = () => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};

// Hook to manage MIDI File Duration and Limits
export const useMidiFile = () => {
    const { playSizeTicks, isPlaying, setIsPlaying, setPlayPosition } = useGame();
    // Use Tone.Transport.ticks to track progress.

    // Check Limits Loop
    useEffect(() => {
        if (!playSizeTicks || !isPlaying) return;

        const interval = setInterval(() => {
            const now = Tone.Transport.ticks;
            setPlayPosition(now);

            if (now >= playSizeTicks) {
                Tone.Transport.pause();
                setIsPlaying(false);
                Tone.Transport.ticks = 0;
                setPlayPosition(0);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [playSizeTicks, isPlaying, setIsPlaying, setPlayPosition]);
};

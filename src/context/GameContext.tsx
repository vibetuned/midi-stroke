import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
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
    playPosition: number;
    setPlayPosition: (pos: number) => void;
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
    const [playPosition, setPlayPosition] = useState(0);

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
            playPosition,
            setPlayPosition
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
    const { setPlaySize, playSize, isPlaying, setIsPlaying, setPlayPosition } = useGame();
    // Use Tone.Transport.position or seconds to track progress.

    useEffect(() => {
        // Load Midi File metadata
        import('@tonejs/midi').then(({ Midi }) => {
            fetch('/sample.mid')
                .then(res => res.arrayBuffer())
                .then(arrayBuffer => {
                    const midi = new Midi(arrayBuffer);
                    console.log("Midi Loaded. Duration:", midi.duration);
                    setPlaySize(midi.duration);
                });
        });
    }, [setPlaySize]);

    // Check Limits Loop
    useEffect(() => {
        if (!playSize || !isPlaying) return;

        const interval = setInterval(() => {
            const now = Tone.Transport.seconds;
            setPlayPosition(now);

            if (now >= playSize) {
                Tone.Transport.pause();
                setIsPlaying(false);
                Tone.Transport.seconds = 0; // Reset or keep at end? usually reset or stop.
                setPlayPosition(0);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [playSize, isPlaying, setIsPlaying, setPlayPosition]);
};

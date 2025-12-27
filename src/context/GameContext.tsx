import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface GameState {
    isPlaying: boolean;
    setIsPlaying: (playing: boolean) => void;
    tempo: number;
    setTempo: (tempo: number) => void;
    currentMeasure: number;
    setCurrentMeasure: (measure: number) => void;
    isAudioStarted: boolean;
    setAudioStarted: (started: boolean) => void;
}

const GameContext = createContext<GameState | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [tempo, setTempo] = useState(120);
    const [currentMeasure, setCurrentMeasure] = useState(1);
    const [isAudioStarted, setAudioStarted] = useState(false);

    return (
        <GameContext.Provider value={{
            isPlaying,
            setIsPlaying,
            tempo,
            setTempo,
            currentMeasure,
            setCurrentMeasure,
            isAudioStarted,
            setAudioStarted
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

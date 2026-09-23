import { createContext, useContext } from 'react';
import type { EarRhythm, EarStaff, EarState, MelodyNote } from '../utils/earTraining';

/**
 * Learn by ear, as the rest of the app sees it: the score view reads it to
 * veil what has not been played yet, the keyboard to drop its hints and show
 * right and wrong, the controls to run the session. Provided by
 * components/EarTrainingProvider.tsx; null outside it, so every consumer can
 * simply ignore it.
 */
export interface EarTrainingValue {
    /** The ear mode is on (and a score is loaded). */
    active: boolean;
    state: EarState;
    melody: MelodyNote[];
    staff: EarStaff;
    /** Staves of this score that actually have notes. */
    staves: EarStaff[];
    setStaff: (staff: EarStaff) => void;
    rhythm: EarRhythm;
    setRhythm: (rhythm: EarRhythm) => void;
    exactOctave: boolean;
    setExactOctave: (exact: boolean) => void;
    start: () => void;
    retry: () => void;
    restart: () => void;
    /** Leave the session and go back to normal practice. */
    exit: () => void;
}

export const EarTrainingContext = createContext<EarTrainingValue | null>(null);

export function useEarTraining(): EarTrainingValue | null {
    return useContext(EarTrainingContext);
}

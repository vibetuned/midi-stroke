import { createContext, useContext } from 'react';

/**
 * Song statistics as the rest of the app sees them: the data model, the
 * context and useStats(). Provided by StatsProvider (context/StatsContext.tsx),
 * kept apart from it so that file exports only a component.
 */

// ── Data model ────────────────────────────────────────────────────────────────

export interface ModeStats {
    plays: number;
    hits: number;     // rhythm: note hit within tolerance
    wrongs: number;   // both modes: wrong/out-of-time note played
    goods: number;    // practice: note-group cleared correctly
    maxCombo: number; // highest combo streak recorded across all sessions
    scoreAccum: number; // sum of per-session (correct/totalNotes) ratios for precision avg
}

export interface SongRecord {
    songName: string;
    rhythm: ModeStats;
    practice: ModeStats;
}

/** Current-session counters — reset whenever the active song changes or song finishes. */
export interface SessionStats {
    hits: number;
    wrongs: number;
    goods: number;
    combo: number;
    maxCombo: number; // highest combo reached this session
    score: number;    // first-attempt correct notes only (used for n/total display)
}

// ── Context interface ─────────────────────────────────────────────────────────

export interface StatsContextType {
    // Recording (called from useGameLogic / app components)
    recordHit: (songPath: string, songName: string, firstAttempt?: boolean) => void;
    recordWrong: (songPath: string, songName: string, mode: 'rhythm' | 'practice') => void;
    recordGood: (songPath: string, songName: string, firstAttempt?: boolean) => void;
    recordPlay: (songPath: string, songName: string, mode: 'rhythm' | 'practice') => void;
    /** Called when a song finishes naturally. Persists session maxCombo and precision. */
    recordSessionEnd: (songPath: string, songName: string, mode: 'rhythm' | 'practice', precision: number, maxCombo: number) => void;
    // Reading
    getSongStats: (songPath: string) => SongRecord | null;
    getAllStats: () => Array<{ songPath: string; record: SongRecord }>;
    clearStats: (songPath?: string) => void;
    // Session (transient, not persisted)
    sessionStats: SessionStats;
    resetSession: () => void;
}

export const StatsContext = createContext<StatsContextType | undefined>(undefined);

export const useStats = (): StatsContextType => {
    const ctx = useContext(StatsContext);
    if (!ctx) throw new Error('useStats must be used within StatsProvider');
    return ctx;
};

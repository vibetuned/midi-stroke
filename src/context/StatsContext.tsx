import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ── Data model ────────────────────────────────────────────────────────────────

export interface ModeStats {
    plays: number;
    hits: number;     // rhythm: note hit within tolerance
    wrongs: number;   // both modes: wrong/out-of-time note played
    goods: number;    // practice: note-group cleared correctly
    maxCombo: number; // highest combo streak recorded across all sessions
    scoreAccum: number; // sum of per-session (correct/totalNotes) ratios for precision avg
}

const emptyMode = (): ModeStats => ({ plays: 0, hits: 0, wrongs: 0, goods: 0, maxCombo: 0, scoreAccum: 0 });

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

type StatsStore = Record<string, SongRecord>; // key = songPath

// ── Context interface ─────────────────────────────────────────────────────────

interface StatsContextType {
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

// ── localStorage helpers ──────────────────────────────────────────────────────

const STORAGE_KEY = 'midi-stroke-stats';

function loadStore(): StatsStore {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as StatsStore) : {};
    } catch {
        return {};
    }
}

function saveStore(store: StatsStore): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
        // private browsing / quota — stats are best-effort
    }
}

// ── Provider ──────────────────────────────────────────────────────────────────

const StatsContext = createContext<StatsContextType | undefined>(undefined);

const emptySession = (): SessionStats => ({ hits: 0, wrongs: 0, goods: 0, combo: 0, maxCombo: 0, score: 0 });

export const StatsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [store, setStore] = useState<StatsStore>(loadStore);
    const [sessionStats, setSessionStats] = useState<SessionStats>(emptySession);

    /** Mutate the persistent store and flush to localStorage. */
    const updateStore = useCallback((updater: (s: StatsStore) => StatsStore) => {
        setStore(prev => {
            const next = updater(prev);
            saveStore(next);
            return next;
        });
    }, []);

    /** Ensure a record exists for this song before mutating it. */
    const ensure = (s: StatsStore, songPath: string, songName: string): StatsStore => {
        if (s[songPath]) return s;
        return { ...s, [songPath]: { songName, rhythm: emptyMode(), practice: emptyMode() } };
    };

    const recordHit = useCallback((songPath: string, songName: string, firstAttempt = true) => {
        updateStore(s => {
            s = ensure(s, songPath, songName);
            return {
                ...s,
                [songPath]: {
                    ...s[songPath],
                    rhythm: { ...s[songPath].rhythm, hits: s[songPath].rhythm.hits + 1 },
                },
            };
        });
        setSessionStats(p => {
            const combo = p.combo + 1;
            return { ...p, hits: p.hits + 1, combo, maxCombo: Math.max(p.maxCombo, combo), score: p.score + (firstAttempt ? 1 : 0) };
        });
    }, [updateStore]);

    const recordWrong = useCallback((songPath: string, songName: string, mode: 'rhythm' | 'practice') => {
        updateStore(s => {
            s = ensure(s, songPath, songName);
            return {
                ...s,
                [songPath]: {
                    ...s[songPath],
                    [mode]: { ...s[songPath][mode], wrongs: s[songPath][mode].wrongs + 1 },
                },
            };
        });
        setSessionStats(p => ({ ...p, wrongs: p.wrongs + 1, combo: 0 }));
    }, [updateStore]);

    const recordGood = useCallback((songPath: string, songName: string, firstAttempt = true) => {
        updateStore(s => {
            s = ensure(s, songPath, songName);
            return {
                ...s,
                [songPath]: {
                    ...s[songPath],
                    practice: { ...s[songPath].practice, goods: s[songPath].practice.goods + 1 },
                },
            };
        });
        setSessionStats(p => {
            const combo = p.combo + 1;
            return { ...p, goods: p.goods + 1, combo, maxCombo: Math.max(p.maxCombo, combo), score: p.score + (firstAttempt ? 1 : 0) };
        });
    }, [updateStore]);

    const recordPlay = useCallback((songPath: string, songName: string, mode: 'rhythm' | 'practice') => {
        updateStore(s => {
            s = ensure(s, songPath, songName);
            return {
                ...s,
                [songPath]: {
                    ...s[songPath],
                    [mode]: { ...s[songPath][mode], plays: s[songPath][mode].plays + 1 },
                },
            };
        });
    }, [updateStore]);

    const recordSessionEnd = useCallback((
        songPath: string,
        songName: string,
        mode: 'rhythm' | 'practice',
        precision: number,
        maxCombo: number,
    ) => {
        updateStore(s => {
            s = ensure(s, songPath, songName);
            const m = s[songPath][mode];
            return {
                ...s,
                [songPath]: {
                    ...s[songPath],
                    [mode]: {
                        ...m,
                        maxCombo: Math.max(m.maxCombo, maxCombo),
                        scoreAccum: m.scoreAccum + precision,
                    },
                },
            };
        });
    }, [updateStore]);

    const getSongStats = useCallback((songPath: string): SongRecord | null => {
        return store[songPath] ?? null;
    }, [store]);

    const getAllStats = useCallback((): Array<{ songPath: string; record: SongRecord }> => {
        return Object.entries(store).map(([songPath, record]) => ({ songPath, record }));
    }, [store]);

    const clearStats = useCallback((songPath?: string) => {
        updateStore(s => {
            if (songPath) {
                const next = { ...s };
                delete next[songPath];
                return next;
            }
            return {};
        });
    }, [updateStore]);

    const resetSession = useCallback(() => {
        setSessionStats(emptySession());
    }, []);

    return (
        <StatsContext.Provider value={{
            recordHit, recordWrong, recordGood, recordPlay, recordSessionEnd,
            getSongStats, getAllStats, clearStats,
            sessionStats, resetSession,
        }}>
            {children}
        </StatsContext.Provider>
    );
};

export const useStats = (): StatsContextType => {
    const ctx = useContext(StatsContext);
    if (!ctx) throw new Error('useStats must be used within StatsProvider');
    return ctx;
};

import React from 'react';
import { useStats } from '../context/StatsContext';
import { useGame } from '../context/GameContext';

/** Accuracy colour: green ≥80 %, yellow ≥60 %, red <60 % */
function accColor(acc: number): string {
    if (acc >= 80) return '#4ade80';
    if (acc >= 60) return '#facc15';
    return '#f87171';
}

/**
 * Compact session counter shown in the app header while a song is loaded.
 *
 * Rhythm mode  →  ✓ hits   ✗ wrongs   acc%
 * Practice mode →  ✓ goods  ✗ wrongs   acc%
 */
export const LiveStats: React.FC = () => {
    const { selectedSong, gameMode } = useGame();
    const { sessionStats } = useStats();

    if (!selectedSong) return null;

    const { hits, wrongs, goods } = sessionStats;

    const correct = gameMode === 'practice' ? goods : hits;
    const total = correct + wrongs;
    const acc = total > 0 ? Math.round((correct / total) * 100) : null;

    // Don't render until at least one event happened
    if (total === 0) return null;

    const correctLabel = gameMode === 'practice' ? '✓' : '✓';
    const correctColor = '#4ade80';
    const wrongColor = '#f87171';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            userSelect: 'none',
        }}>
            <span style={{ color: correctColor, fontWeight: 600 }}>
                {correctLabel} {correct}
            </span>
            <span style={{ color: wrongColor, fontWeight: 600 }}>
                ✗ {wrongs}
            </span>
            {acc !== null && (
                <span style={{
                    color: accColor(acc),
                    fontWeight: 700,
                    minWidth: '3ch',
                    textAlign: 'right',
                }}>
                    {acc}%
                </span>
            )}
        </div>
    );
};

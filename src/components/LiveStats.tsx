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
 * Rhythm mode  →  combo streak  |  n/total  |  ✓ hits   ✗ wrongs   acc%
 * Practice mode →  combo streak  |  n/total  |  ✓ goods  ✗ wrongs   acc%
 */
export const LiveStats: React.FC = () => {
    const { selectedSong, gameMode, midiData } = useGame();
    const { sessionStats } = useStats();

    if (!selectedSong) return null;

    const { hits, wrongs, goods, combo, score } = sessionStats;

    const correct = gameMode === 'practice' ? goods : hits;
    const total = correct + wrongs;
    const acc = total > 0 ? Math.round((correct / total) * 100) : null;

    // Don't render until at least one event happened
    if (total === 0) return null;

    // Count unique tick positions — notes at the same tick form a chord and
    // are recorded as one hit/good, so they should count as one here too.
    const totalNotes = midiData
        ? new Set(midiData.tracks.flatMap(t => t.notes.map(n => n.ticks))).size
        : null;

    const comboColor = combo >= 10 ? '#facc15' : combo >= 5 ? '#fb923c' : '#e2e8f0';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            userSelect: 'none',
        }}>
            {/* Combo streak */}
            <span style={{ color: comboColor, fontWeight: 700, minWidth: '4ch', textAlign: 'right' }}
                title="Combo streak — resets on wrong note">
                ×{combo}
            </span>

            {/* n / total */}
            {totalNotes !== null && (
                <span style={{ color: '#94a3b8', fontWeight: 600 }}
                    title="Notes hit correctly / total notes in song">
                    {score}<span style={{ color: '#475569' }}>/{totalNotes}</span>
                </span>
            )}

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

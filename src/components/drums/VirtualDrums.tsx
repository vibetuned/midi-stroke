import React, { useMemo } from 'react';
import { useGame } from '../../context/game';
import { buildDrumGrid, drumGridView, type DrumGridRow } from '../../utils/drumGrid';

/**
 * The step grid under the drum score: a row per drum, a column per step — 16
 * sixteenths, 12 triplet eighths, 12 eighths in 12/8, 8 in 2/4 — and the hits
 * of the bar being played.
 *
 * It never moves. As the playhead leaves a column, the column turns to the
 * same step of the next bar, so the cells ahead of the cursor are what is left
 * of this bar and the ones behind it the start of the next: a looping pattern
 * reads round and round, a long groove reads as it goes. Built from the
 * timemap (utils/drumGrid.ts), so it shows whatever the app plays.
 */
export const VirtualDrums: React.FC = () => {
    const { playPosition, timemap, loopRange } = useGame();
    const grid = useMemo(() => (timemap ? buildDrumGrid(timemap) : null), [timemap]);
    const view = useMemo(() => (grid ? drumGridView(grid, playPosition, loopRange) : null), [grid, playPosition, loopRange]);

    if (!grid || !view || grid.rows.length === 0) return null;
    const { columns, beatColumns, rows, bars } = grid;

    return (
        <div style={{
            width: '100%',
            backgroundColor: 'var(--color-bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '10px 0',
            borderTop: '1px solid #333',
            overflowX: 'auto'
        }}>
            <div style={{
                display: 'grid',
                border: '1px solid #333',
                gridTemplateColumns: `50px repeat(${columns}, 40px)`,
                gridAutoRows: '40px',
                background: '#1A1A1A'
            }}>
                {rows.map(row => (
                    <React.Fragment key={row.id}>
                        <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 'bold', color: '#aaa',
                            borderRight: '1px solid #333', borderBottom: '1px solid #333'
                        }}>
                            {row.label}
                        </div>

                        {Array.from({ length: columns }).map((_, c) => {
                            const b = view.barOf[c];
                            const hit = b >= 0 && !!bars[b].hits.get(row.id)?.has(c);
                            const upcoming = c < view.column;
                            const current = c === view.column;
                            return (
                                <div key={c} style={{
                                    position: 'relative', width: '100%', height: '100%',
                                    borderRight: (c + 1) % beatColumns === 0 && c + 1 < columns ? '1px solid #555' : '1px solid #333',
                                    borderBottom: '1px solid #333',
                                    // The cursor's column; behind it, faintly, the next bar.
                                    background: current ? 'rgba(245, 87, 108, 0.25)' : upcoming ? 'rgba(255, 255, 255, 0.035)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {hit && <DrumShape type={row.shape} color={row.color} />}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

const DrumShape: React.FC<{ type: DrumGridRow['shape'], color: string }> = ({ type, color }) => {
    switch (type) {
        case 'circle':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="7" fill={color} />
                </svg>
            );
        case 'cross':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <line x1="4" y1="4" x2="16" y2="16" stroke={color} strokeWidth="3" strokeLinecap="round" />
                    <line x1="16" y1="4" x2="4" y2="16" stroke={color} strokeWidth="3" strokeLinecap="round" />
                </svg>
            );
        case 'plus':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <line x1="10" y1="3" x2="10" y2="17" stroke={color} strokeWidth="3" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="17" y2="10" stroke={color} strokeWidth="3" strokeLinecap="round" />
                </svg>
            );
        case 'diamond':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <polygon points="10,2 18,10 10,18 2,10" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
                </svg>
            );
        case 'slash':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <line x1="16" y1="4" x2="4" y2="16" stroke={color} strokeWidth="3" strokeLinecap="round" />
                </svg>
            );
        default:
            return null;
    }
};

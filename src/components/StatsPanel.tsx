import React, { useEffect } from 'react';
import { useStats, type ModeStats } from '../context/StatsContext';

interface StatsPanelProps {
    onClose: () => void;
}

function accuracy(s: ModeStats): string {
    const correct = s.hits + s.goods;
    const total = correct + s.wrongs;
    if (total === 0) return '—';
    return `${Math.round((correct / total) * 100)}%`;
}

function accColor(s: ModeStats): string {
    const correct = s.hits + s.goods;
    const total = correct + s.wrongs;
    if (total === 0) return '#666';
    const pct = correct / total;
    if (pct >= 0.8) return '#4ade80';
    if (pct >= 0.6) return '#facc15';
    return '#f87171';
}

const cell: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    textAlign: 'right',
    fontSize: '0.85rem',
    borderBottom: '1px solid #333',
    whiteSpace: 'nowrap',
};

const headerCell: React.CSSProperties = {
    ...cell,
    color: '#888',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #444',
};

export const StatsPanel: React.FC<StatsPanelProps> = ({ onClose }) => {
    const { getAllStats, clearStats } = useStats();
    const allStats = getAllStats();

    // Escape key to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.85)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    width: '100%',
                    maxWidth: '800px',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    color: 'white',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Song Statistics</h2>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {allStats.length > 0 && (
                            <button
                                onClick={() => clearStats()}
                                style={{
                                    padding: '0.35rem 0.8rem',
                                    background: 'transparent',
                                    border: '1px solid #555',
                                    color: '#f87171',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                }}
                            >
                                Clear All
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                border: '1px solid #444',
                                background: 'transparent',
                                color: '#aaa',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {allStats.length === 0 ? (
                    <p style={{ color: '#666', textAlign: 'center', padding: '2rem 0' }}>
                        No data yet — play some songs first!
                    </p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ ...headerCell, textAlign: 'left' }}>Song</th>
                                {/* Rhythm columns */}
                                <th style={{ ...headerCell, color: '#646cff' }}>Rhythm plays</th>
                                <th style={{ ...headerCell, color: '#4ade80' }}>Hits</th>
                                <th style={{ ...headerCell, color: '#f87171' }}>Wrong</th>
                                <th style={{ ...headerCell }}>Rhythm acc.</th>
                                {/* Practice columns */}
                                <th style={{ ...headerCell, color: '#f5576c' }}>Practice plays</th>
                                <th style={{ ...headerCell, color: '#4ade80' }}>Goods</th>
                                <th style={{ ...headerCell, color: '#f87171' }}>Wrong</th>
                                <th style={{ ...headerCell }}>Practice acc.</th>
                                <th style={{ ...headerCell }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {allStats.map(({ songPath, record }) => (
                                <tr key={songPath} style={{ background: 'transparent' }}
                                    onMouseOver={e => (e.currentTarget.style.background = '#222')}
                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <td style={{ ...cell, textAlign: 'left', color: '#ccc', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                        title={songPath}>
                                        {record.songName}
                                    </td>
                                    {/* Rhythm */}
                                    <td style={{ ...cell, color: '#646cff' }}>{record.rhythm.plays}</td>
                                    <td style={{ ...cell, color: '#4ade80' }}>{record.rhythm.hits}</td>
                                    <td style={{ ...cell, color: '#f87171' }}>{record.rhythm.wrongs}</td>
                                    <td style={{ ...cell, color: accColor(record.rhythm), fontWeight: 700 }}>
                                        {accuracy(record.rhythm)}
                                    </td>
                                    {/* Practice */}
                                    <td style={{ ...cell, color: '#f5576c' }}>{record.practice.plays}</td>
                                    <td style={{ ...cell, color: '#4ade80' }}>{record.practice.goods}</td>
                                    <td style={{ ...cell, color: '#f87171' }}>{record.practice.wrongs}</td>
                                    <td style={{ ...cell, color: accColor(record.practice), fontWeight: 700 }}>
                                        {accuracy(record.practice)}
                                    </td>
                                    {/* Clear row */}
                                    <td style={cell}>
                                        <button
                                            onClick={() => clearStats(songPath)}
                                            title="Clear this song's stats"
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#555',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                padding: '0 0.25rem',
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

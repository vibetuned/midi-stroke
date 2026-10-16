import React from 'react';
import { useGame } from '../context/game';
import { useSongNeighbours } from '../hooks/useSongNeighbours';
import { SongMarqueeButton } from './SongMarqueeButton';

interface SongNavigatorProps {
    /** Click handler for the marquee itself — opens the full song picker. */
    onChangeRequest: () => void;
}

export const SongNavigator: React.FC<SongNavigatorProps> = ({ onChangeRequest }) => {
    const { selectedSong, setSelectedSong } = useGame();
    // The song's name and its neighbours in its collection (hooks/useSongNeighbours.ts).
    const { songName, prevTarget, nextTarget } = useSongNeighbours();

    if (!selectedSong) return null;

    const hasPrev = prevTarget !== null;
    const hasNext = nextTarget !== null;

    const navButtonStyle = (enabled: boolean): React.CSSProperties => ({
        width: '28px',
        height: '32px',
        padding: 0,
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '6px',
        color: enabled ? '#ccc' : '#666',
        cursor: enabled ? 'pointer' : 'not-allowed',
        fontSize: '0.85rem',
        opacity: enabled ? 1 : 0.35,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.15s, color 0.15s',
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button
                onClick={() => prevTarget && setSelectedSong(prevTarget)}
                disabled={!hasPrev}
                title={hasPrev ? 'Previous song' : 'First song in collection'}
                style={navButtonStyle(hasPrev)}
            >
                ◀
            </button>
            <SongMarqueeButton songName={songName} onClick={onChangeRequest} />
            <button
                onClick={() => nextTarget && setSelectedSong(nextTarget)}
                disabled={!hasNext}
                title={hasNext ? 'Next song' : 'Last song in collection'}
                style={navButtonStyle(hasNext)}
            >
                ▶
            </button>
        </div>
    );
};

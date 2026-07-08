import React, { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import { buildSongUrl, catalogUrl } from '../utils/songUrl';
import { SongMarqueeButton } from './SongMarqueeButton';

interface SongFile {
    path: string;
    name: string;
}

interface SongNavigatorProps {
    /** Click handler for the marquee itself — opens the full song picker. */
    onChangeRequest: () => void;
}

export const SongNavigator: React.FC<SongNavigatorProps> = ({ onChangeRequest }) => {
    const { selectedSong, setSelectedSong, instrument, serverBase } = useGame();
    const [files, setFiles] = useState<SongFile[]>([]);

    useEffect(() => {
        fetch(catalogUrl(serverBase, instrument))
            .then(res => res.json())
            .then((data: SongFile[]) => setFiles(data))
            .catch(err => console.error(`Failed to load ${instrument} song catalog:`, err));
    }, [instrument, serverBase]);

    if (!selectedSong) return null;

    const isLocal = selectedSong.startsWith('blob:');
    // Server URLs carry percent-encoded names; show them decoded.
    let songName = selectedSong.split('/').pop() ?? selectedSong;
    try {
        songName = decodeURIComponent(songName);
    } catch { /* keep raw name */ }

    // Compute prev/next within the current song's collection (path). Local-file
    // (blob:) songs aren't in any catalog list, so navigation is disabled.
    let prevTarget: string | null = null;
    let nextTarget: string | null = null;
    if (!isLocal && files.length > 0) {
        const normalized = selectedSong.startsWith('/') ? selectedSong.slice(1) : selectedSong;
        const currentIdx = files.findIndex(f => buildSongUrl(serverBase, instrument, f.path, f.name) === normalized);
        if (currentIdx !== -1) {
            const currentPath = files[currentIdx].path;
            const collection = files.filter(f => f.path === currentPath);
            const localIdx = collection.findIndex(f => f.name === files[currentIdx].name);
            if (localIdx > 0) {
                const t = collection[localIdx - 1];
                prevTarget = buildSongUrl(serverBase, instrument, t.path, t.name);
            }
            if (localIdx < collection.length - 1) {
                const t = collection[localIdx + 1];
                nextTarget = buildSongUrl(serverBase, instrument, t.path, t.name);
            }
        }
    }

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

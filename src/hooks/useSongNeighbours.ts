import { useEffect, useState } from 'react';
import { useGame } from '../context/game';
import { buildSongUrl, catalogUrl } from '../utils/songUrl';
import { listOpfsSongs } from '../utils/opfs';
import { describeScaleUrl } from '../utils/scaleGen';
import { describeJazzUrl } from '../utils/jazzScaleGen';
import { describeLickUrl } from '../utils/jazzLicks';
import { describeDrumUrl } from '../utils/drumPatternGen';
import { describeGrooveUrl } from '../utils/grooveMidi';

interface SongFile {
    path: string;
    name: string;
}

/**
 * The song playing, by name, and its neighbours in its collection — the
 * header's ◀ ▶ (components/SongNavigator.tsx) and the results' Play next
 * (components/SessionResults.tsx). Local files and generated exercises are in
 * no collection: no neighbours.
 */
export function useSongNeighbours(): { songName: string; prevTarget: string | null; nextTarget: string | null } {
    const { selectedSong, instrument, serverBase } = useGame();
    const [catalogFiles, setCatalogFiles] = useState<SongFile[]>([]);
    const [opfsFiles, setOpfsFiles] = useState<SongFile[]>([]);

    useEffect(() => {
        fetch(catalogUrl(serverBase, instrument))
            .then(res => res.json())
            .then((data: SongFile[]) => setCatalogFiles(data))
            .catch(err => console.error(`Failed to load ${instrument} song catalog:`, err));
    }, [instrument, serverBase]);

    // ZIP-uploaded (OPFS) collections — refreshed per song change so a fresh
    // import is picked up as soon as one of its pieces is playing.
    useEffect(() => {
        let cancelled = false;
        listOpfsSongs(instrument)
            .then(list => { if (!cancelled) setOpfsFiles(list); })
            .catch(() => { if (!cancelled) setOpfsFiles([]); });
        return () => { cancelled = true; };
    }, [instrument, selectedSong]);

    if (!selectedSong) return { songName: '', prevTarget: null, nextTarget: null };
    const files = [...catalogFiles, ...opfsFiles];

    const isLocal = selectedSong.startsWith('blob:');
    // Server URLs carry percent-encoded names; show them decoded.
    let songName = describeScaleUrl(selectedSong) ?? describeJazzUrl(selectedSong) ?? describeLickUrl(selectedSong)
        ?? describeDrumUrl(selectedSong) ?? describeGrooveUrl(selectedSong) ?? selectedSong.split('/').pop() ?? selectedSong;
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
    return { songName, prevTarget, nextTarget };
}

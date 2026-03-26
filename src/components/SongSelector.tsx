import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';

interface SongFile {
    path: string;
    name: string;
}

export const SongSelector: React.FC = () => {
    const { isAudioStarted, pianoRange, selectedSong, setSelectedSong, instrument } = useGame();
    const [files, setFiles] = useState<SongFile[]>([]);
    const [availablePaths, setAvailablePaths] = useState<string[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>('');
    const [availableRecords, setAvailableRecords] = useState<string[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCached, setIsCached] = useState<boolean | null>(null);

    // Load files.json
    useEffect(() => {
        fetch(`/${instrument}_files.json`)
            .then(res => res.json())
            .then((data: SongFile[]) => {
                setFiles(data);
                const paths = Array.from(new Set(data.map(f => f.path)));
                setAvailablePaths(paths);
                if (paths.length > 0) {
                    setSelectedPath(paths[0]);
                }
                setIsLoading(false);
            })
            .catch(err => {
                console.error(`Failed to load ${instrument} song catalog:`, err);
                setIsLoading(false);
            });
    }, [instrument]);

    // Filter records when path changes
    useEffect(() => {
        if (selectedPath) {
            const records = files
                .filter(f => f.path === selectedPath)
                .map(f => f.name);
            setAvailableRecords(records);
            if (records.length > 0) {
                setSelectedRecord(records[0]);
            } else {
                setSelectedRecord('');
            }
        }
    }, [selectedPath, files]);

    // Check cache status whenever the selected record changes
    useEffect(() => {
        if (!selectedPath || !selectedRecord || !('caches' in window)) {
            setIsCached(null);
            return;
        }
        const url = `/${selectedPath}/${selectedRecord}`;
        caches.open('mei-files')
            .then(cache => cache.match(url))
            .then(response => setIsCached(!!response))
            .catch(() => setIsCached(null));
    }, [selectedPath, selectedRecord]);

    const handleEvict = async () => {
        if (!selectedPath || !selectedRecord) return;
        const url = `/${selectedPath}/${selectedRecord}`;
        const cache = await caches.open('mei-files');
        await cache.delete(url);
        setIsCached(false);
    };

    const handleCacheNow = async () => {
        if (!selectedPath || !selectedRecord) return;
        const url = `/${selectedPath}/${selectedRecord}`;
        const cache = await caches.open('mei-files');
        const response = await fetch(url);
        await cache.put(url, response);
        setIsCached(true);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleConfirm = () => {
        if (selectedPath && selectedRecord) {
            const songUrl = `${selectedPath}/${selectedRecord}`;
            setSelectedSong(songUrl);
        }
    };

    const handleLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedSong(URL.createObjectURL(file));
        }
    };

    if (!isAudioStarted || selectedSong) return null;
    if (instrument === 'piano' && !pianoRange) return null;

    return (
        <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            zIndex: 150,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
        }}>
            <h2 style={{ fontSize: '2rem', marginBottom: '2rem' }}>🎵 Select Music</h2>

            {isLoading ? (
                <p>Loading Catalog...</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '300px' }}>

                    {/* Path Selector */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#aaa', fontSize: '0.9rem' }}>
                            Collection (Path)
                        </label>
                        <select
                            value={selectedPath}
                            onChange={(e) => setSelectedPath(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.8rem',
                                borderRadius: '8px',
                                background: '#333',
                                color: 'white',
                                border: '1px solid #555',
                                fontSize: '1rem'
                            }}
                        >
                            {availablePaths.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    {/* Record Selector */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#aaa', fontSize: '0.9rem' }}>
                            Piece (Record)
                        </label>
                        <select
                            value={selectedRecord}
                            onChange={(e) => setSelectedRecord(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.8rem',
                                borderRadius: '8px',
                                background: '#333',
                                color: 'white',
                                border: '1px solid #555',
                                fontSize: '1rem'
                            }}
                        >
                            {availableRecords.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                        {isCached !== null && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#aaa' }}>
                                    {isCached ? '💾 Cached offline' : '☁️ Not cached'}
                                </span>
                                {isCached ? (
                                    <button
                                        onClick={handleEvict}
                                        title="Remove from cache"
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#888',
                                            fontSize: '1rem',
                                            cursor: 'pointer',
                                            lineHeight: 1,
                                            padding: '0 0.2rem',
                                        }}
                                    >
                                        ✕
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleCacheNow}
                                        title="Save for offline"
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#888',
                                            fontSize: '1rem',
                                            cursor: 'pointer',
                                            lineHeight: 1,
                                            padding: '0 0.2rem',
                                        }}
                                    >
                                        📥
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleConfirm}
                        disabled={!selectedRecord}
                        style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            fontSize: '1.2rem',
                            background: selectedRecord ? 'var(--color-accent)' : '#555',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50px',
                            cursor: selectedRecord ? 'pointer' : 'not-allowed',
                            transition: 'transfrom 0.2s',
                        }}
                    >
                        Start Playing
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.5rem 0' }}>
                        <div style={{ flex: 1, height: '1px', background: '#444' }} />
                        <span style={{ color: '#666', fontSize: '0.85rem' }}>or</span>
                        <div style={{ flex: 1, height: '1px', background: '#444' }} />
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mei"
                        style={{ display: 'none' }}
                        onChange={handleLocalFile}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            padding: '0.8rem',
                            fontSize: '1rem',
                            background: 'transparent',
                            color: '#aaa',
                            border: '1px solid #444',
                            borderRadius: '50px',
                            cursor: 'pointer',
                        }}
                    >
                        Load Local MEI File
                    </button>
                </div>
            )}
        </div>
    );
};

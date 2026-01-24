import React, { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';

interface SongFile {
    path: string;
    name: string;
}

export const SongSelector: React.FC = () => {
    const { isAudioStarted, pianoRange, selectedSong, setSelectedSong } = useGame();
    const [files, setFiles] = useState<SongFile[]>([]);
    const [availablePaths, setAvailablePaths] = useState<string[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>('');
    const [availableRecords, setAvailableRecords] = useState<string[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    // Load files.json
    useEffect(() => {
        fetch('/files.json')
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
                console.error("Failed to load song catalog:", err);
                setIsLoading(false);
            });
    }, []);

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

    const handleConfirm = () => {
        if (selectedPath && selectedRecord) {
            // Construct relative path
            // logic: folder_name = path, filename = level 
            // We need to form the URL. public/path/name
            // Fetching /path/name
            const songUrl = `${selectedPath}/${selectedRecord}`;
            setSelectedSong(songUrl);
        }
    };

    // Visibility Logic
    // Show only if Audio is started (StartOverlay done), Piano is setup, and no song selected yet.
    if (!isAudioStarted || !pianoRange || selectedSong) return null;

    return (
        <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            zIndex: 150, // Below StartOverlay (1000), Above PlayControls? PianoSetup is 200. 
            // PianoSetup returns null if setup is done. So this takes over.
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
                </div>
            )}
        </div>
    );
};

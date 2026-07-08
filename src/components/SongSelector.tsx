import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { buildSongUrl, catalogUrl, resolveSongUrl } from '../utils/songUrl';

// Must match the server's slug rule for instruments/categories (server/src/app.ts).
const CATEGORY_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const NEW_CATEGORY = '__new__';

interface SongFile {
    path: string;
    name: string;
}

interface SongSelectorProps {
    // Fix 9: optional dismiss handler — shown as a close button and wired to Escape.
    // Only provided when a song was already loaded (i.e. user clicked "Change Song"),
    // so first-launch flow still requires a selection.
    onDismiss?: () => void;
}

export const SongSelector: React.FC<SongSelectorProps> = ({ onDismiss }) => {
    const { isAudioStarted, pianoRange, selectedSong, setSelectedSong, instrument, serverBase, setServerBase } = useGame();
    const [files, setFiles] = useState<SongFile[]>([]);
    const [availablePaths, setAvailablePaths] = useState<string[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>('');
    const [availableRecords, setAvailableRecords] = useState<string[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCached, setIsCached] = useState<boolean | null>(null);

    // Score-server connection: when connected the catalog and the files come
    // from the server (see server/README.md) instead of the bundled public/ assets.
    const [serverInput, setServerInput] = useState<string>(
        () => localStorage.getItem('mei-server-url') ?? 'http://localhost:3001'
    );
    const [serverError, setServerError] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    // Upload-to-server form state
    const [uploadCategory, setUploadCategory] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [catalogRefresh, setCatalogRefresh] = useState(0);

    // Load the song catalog — from the score server when connected, else the bundled files.json
    useEffect(() => {
        setIsLoading(true);
        fetch(catalogUrl(serverBase, instrument))
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data: SongFile[]) => {
                setFiles(data);
                const paths = Array.from(new Set(data.map(f => f.path)));
                setAvailablePaths(paths);
                // Keep the current selection when it survives the reload (e.g. after an upload)
                setSelectedPath(prev => (prev && paths.includes(prev)) ? prev : (paths[0] ?? ''));
                setIsLoading(false);
            })
            .catch(err => {
                console.error(`Failed to load ${instrument} song catalog:`, err);
                if (serverBase) setServerError('Failed to load catalog from server');
                setIsLoading(false);
            });
    }, [instrument, serverBase, catalogRefresh]);

    // Filter records when path changes
    useEffect(() => {
        const records = selectedPath
            ? files.filter(f => f.path === selectedPath).map(f => f.name)
            : [];
        setAvailableRecords(records);
        setSelectedRecord(prev => records.includes(prev) ? prev : (records[0] ?? ''));
    }, [selectedPath, files]);

    // Fetchable URL of the current selection: absolute when it lives on the
    // score server, site-relative for bundled files.
    const currentSongUrl = selectedPath && selectedRecord
        ? resolveSongUrl(buildSongUrl(serverBase, instrument, selectedPath, selectedRecord))
        : null;

    // Check cache status whenever the selected record changes
    useEffect(() => {
        if (!currentSongUrl || !('caches' in window)) {
            setIsCached(null);
            return;
        }
        caches.open('mei-files')
            .then(cache => cache.match(currentSongUrl))
            .then(response => setIsCached(!!response))
            .catch(() => setIsCached(null));
    }, [currentSongUrl]);

    const handleEvict = async () => {
        if (!currentSongUrl) return;
        const cache = await caches.open('mei-files');
        await cache.delete(currentSongUrl);
        setIsCached(false);
    };

    const handleCacheNow = async () => {
        if (!currentSongUrl) return;
        const cache = await caches.open('mei-files');
        const response = await fetch(currentSongUrl);
        await cache.put(currentSongUrl, response);
        setIsCached(true);
    };

    const handleConnect = async () => {
        const trimmed = serverInput.trim().replace(/\/+$/, '');
        if (!trimmed) return;
        const base = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
        setIsConnecting(true);
        setServerError(null);
        try {
            const res = await fetch(`${base}/api/health`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            localStorage.setItem('mei-server-url', base);
            setServerBase(base);
        } catch (err) {
            console.error('Score server connection failed:', err);
            setServerError(`Could not reach ${base}`);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDisconnect = () => {
        setServerBase(null);
        setServerError(null);
        setUploadCategory('');
        setNewCategory('');
        setUploadStatus(null);
    };

    // Existing categories on the server (manifest paths are "<instrument>/<category>")
    const categories = serverBase
        ? availablePaths.map(p => p.split('/').slice(1).join('/'))
        : [];
    const categoryValue = categories.includes(uploadCategory)
        ? uploadCategory
        : (uploadCategory === NEW_CATEGORY ? NEW_CATEGORY : (categories[0] ?? NEW_CATEGORY));
    const effectiveCategory = categoryValue === NEW_CATEGORY ? newCategory.trim() : categoryValue;

    const uploadInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = Array.from(e.target.files ?? []);
        e.target.value = ''; // allow re-picking the same files later
        if (!serverBase || fileList.length === 0) return;
        const category = effectiveCategory;
        if (!CATEGORY_RE.test(category)) {
            setUploadStatus('Category must be letters/digits with "-" or "_" (e.g. my_songs)');
            return;
        }
        setIsUploading(true);
        setUploadStatus(null);
        let uploaded = 0;
        const failed: string[] = [];
        for (const file of fileList) {
            try {
                const res = await fetch(
                    `${serverBase}/api/${instrument}/files/${encodeURIComponent(category)}/${encodeURIComponent(file.name)}`,
                    { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: file },
                );
                if (!res.ok) {
                    const body = await res.json().catch(() => null);
                    throw new Error(body?.error ?? `HTTP ${res.status}`);
                }
                uploaded++;
            } catch (err) {
                console.error(`Upload of ${file.name} failed:`, err);
                failed.push(file.name);
            }
        }
        setIsUploading(false);
        setUploadStatus(
            failed.length === 0
                ? `Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'} ✓`
                : `Uploaded ${uploaded}, failed: ${failed.join(', ')}`
        );
        if (uploaded > 0) {
            setUploadCategory(category);
            setNewCategory('');
            // Jump the pickers to the uploaded category and reload the catalog
            setSelectedPath(`${instrument}/${category}`);
            setCatalogRefresh(n => n + 1);
        }
    };

    // Fix 9: Escape key to dismiss (only when onDismiss is provided)
    useEffect(() => {
        if (!onDismiss) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onDismiss();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onDismiss]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleConfirm = () => {
        if (!selectedPath || !selectedRecord) return;
        setSelectedSong(buildSongUrl(serverBase, instrument, selectedPath, selectedRecord));
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
            {/* Fix 9: close button — only rendered when a song was already active */}
            {onDismiss && (
                <button
                    onClick={onDismiss}
                    title="Cancel (Esc)"
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: '1px solid #555',
                        background: 'transparent',
                        color: '#aaa',
                        fontSize: '1.1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                    }}
                >
                    ✕
                </button>
            )}
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.5rem 0' }}>
                        <div style={{ flex: 1, height: '1px', background: '#444' }} />
                        <span style={{ color: '#666', fontSize: '0.85rem' }}>or</span>
                        <div style={{ flex: 1, height: '1px', background: '#444' }} />
                    </div>

                    {/* Score server connection */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#aaa', fontSize: '0.9rem' }}>
                            Score Server
                        </label>
                        {serverBase ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ flex: 1, fontSize: '0.9rem', color: '#8c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        🟢 {serverBase}
                                    </span>
                                    <button
                                        onClick={handleDisconnect}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            fontSize: '0.9rem',
                                            background: 'transparent',
                                            color: '#aaa',
                                            border: '1px solid #444',
                                            borderRadius: '50px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Disconnect
                                    </button>
                                </div>

                                {/* Upload MEI files to the server, into an existing or new category */}
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <select
                                        value={categoryValue}
                                        onChange={(e) => setUploadCategory(e.target.value)}
                                        title="Category for uploaded files"
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            padding: '0.6rem',
                                            borderRadius: '8px',
                                            background: '#333',
                                            color: 'white',
                                            border: '1px solid #555',
                                            fontSize: '0.95rem',
                                        }}
                                    >
                                        {categories.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                        <option value={NEW_CATEGORY}>➕ New category…</option>
                                    </select>
                                    <button
                                        onClick={() => uploadInputRef.current?.click()}
                                        disabled={isUploading || (categoryValue === NEW_CATEGORY && !CATEGORY_RE.test(newCategory.trim()))}
                                        title="Upload MEI files into the selected category"
                                        style={{
                                            padding: '0.6rem 1.2rem',
                                            fontSize: '0.95rem',
                                            background: 'transparent',
                                            color: '#aaa',
                                            border: '1px solid #444',
                                            borderRadius: '50px',
                                            cursor: isUploading ? 'wait' : 'pointer',
                                        }}
                                    >
                                        {isUploading ? 'Uploading…' : '📤 Upload'}
                                    </button>
                                </div>
                                {categoryValue === NEW_CATEGORY && (
                                    <input
                                        type="text"
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        placeholder="new_category_name"
                                        style={{
                                            padding: '0.6rem',
                                            borderRadius: '8px',
                                            background: '#333',
                                            color: 'white',
                                            border: '1px solid #555',
                                            fontSize: '0.95rem',
                                        }}
                                    />
                                )}
                                {uploadStatus && (
                                    <div style={{ fontSize: '0.85rem', color: uploadStatus.includes('✓') ? '#8c8' : '#e66' }}>
                                        {uploadStatus}
                                    </div>
                                )}
                                <input
                                    ref={uploadInputRef}
                                    type="file"
                                    accept=".mei"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={handleUpload}
                                />
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    value={serverInput}
                                    onChange={(e) => setServerInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                                    placeholder="http://localhost:3001"
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        padding: '0.8rem',
                                        borderRadius: '8px',
                                        background: '#333',
                                        color: 'white',
                                        border: '1px solid #555',
                                        fontSize: '1rem',
                                    }}
                                />
                                <button
                                    onClick={handleConnect}
                                    disabled={isConnecting || !serverInput.trim()}
                                    style={{
                                        padding: '0.8rem 1.2rem',
                                        fontSize: '1rem',
                                        background: 'transparent',
                                        color: '#aaa',
                                        border: '1px solid #444',
                                        borderRadius: '50px',
                                        cursor: isConnecting ? 'wait' : 'pointer',
                                    }}
                                >
                                    {isConnecting ? 'Connecting…' : 'Connect'}
                                </button>
                            </div>
                        )}
                        {serverError && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: '#e66' }}>
                                {serverError}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

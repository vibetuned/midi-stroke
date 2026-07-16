import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useStats } from '../context/StatsContext';
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

// Precision ratio (0..1) of a persisted mode record, or -1 when never played.
const modePct = (m: { plays: number; scoreAccum: number }): number =>
    m.plays > 0 ? m.scoreAccum / m.plays : -1;

// Same thresholds StatsPanel uses for its precision column.
function scoreColor(pct: number): string {
    if (pct >= 0.8) return '#4ade80';
    if (pct >= 0.6) return '#facc15';
    return '#f87171';
}

// "piano/first_two_hand_exercises" -> "first two hand exercises"
function collectionLabel(path: string): string {
    const tail = path.split('/').slice(1).join('/');
    return (tail || path).replace(/_/g, ' ');
}

// "001_Czerny_Carl_-_Op_824.mei" -> "001 Czerny Carl - Op 824"
function niceName(raw: string): string {
    let s = raw;
    try { s = decodeURIComponent(raw); } catch { /* keep raw on malformed escapes */ }
    return s.replace(/\.mei$/i, '').replace(/_/g, ' ');
}

export const SongSelector: React.FC<SongSelectorProps> = ({ onDismiss }) => {
    const { isAudioStarted, pianoRange, selectedSong, setSelectedSong, instrument, serverBase, setServerBase } = useGame();
    const { getSongStats } = useStats();
    const [files, setFiles] = useState<SongFile[]>([]);
    const [availablePaths, setAvailablePaths] = useState<string[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    // Offline-cache presence for the pieces of the visible collection, keyed by record name.
    const [cacheMap, setCacheMap] = useState<Record<string, boolean>>({});

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

    // Pieces of the currently-selected collection.
    const recordsForPath = useMemo(
        () => selectedPath ? files.filter(f => f.path === selectedPath) : [],
        [selectedPath, files],
    );

    // Batch-check offline cache status for every piece in the visible collection.
    useEffect(() => {
        if (!('caches' in window) || recordsForPath.length === 0) {
            setCacheMap({});
            return;
        }
        let cancelled = false;
        caches.open('mei-files').then(async cache => {
            const entries = await Promise.all(recordsForPath.map(async f => {
                const url = resolveSongUrl(buildSongUrl(serverBase, instrument, f.path, f.name));
                const hit = await cache.match(url);
                return [f.name, !!hit] as const;
            }));
            if (!cancelled) setCacheMap(Object.fromEntries(entries));
        }).catch(() => { if (!cancelled) setCacheMap({}); });
        return () => { cancelled = true; };
    }, [recordsForPath, serverBase, instrument]);

    const cacheRecord = async (name: string) => {
        if (!('caches' in window)) return;
        const url = resolveSongUrl(buildSongUrl(serverBase, instrument, selectedPath, name));
        const cache = await caches.open('mei-files');
        await cache.put(url, await fetch(url));
        setCacheMap(m => ({ ...m, [name]: true }));
    };

    const evictRecord = async (name: string) => {
        if (!('caches' in window)) return;
        const url = resolveSongUrl(buildSongUrl(serverBase, instrument, selectedPath, name));
        const cache = await caches.open('mei-files');
        await cache.delete(url);
        setCacheMap(m => ({ ...m, [name]: false }));
    };

    // Best persisted precision across modes for a piece, or null if never played.
    const bestScore = (path: string, name: string): number | null => {
        const rec = getSongStats(buildSongUrl(serverBase, instrument, path, name));
        if (!rec) return null;
        const best = Math.max(modePct(rec.rhythm), modePct(rec.practice));
        return best >= 0 ? best : null;
    };

    // Piece count + how many have been played, for a collection's rail entry.
    const collectionStats = (path: string): { total: number; played: number } => {
        const recs = files.filter(f => f.path === path);
        const played = recs.filter(f => bestScore(path, f.name) !== null).length;
        return { total: recs.length, played };
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

    const startPiece = (name: string) => {
        setSelectedSong(buildSongUrl(serverBase, instrument, selectedPath, name));
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
        <div style={overlayStyle}>
            <div style={cardStyle}>
                {/* Panel header */}
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, fontSize: '1.15rem' }}>🎵 Select Music</h2>
                    {!isLoading && (
                        <span style={{ color: 'var(--color-text-secondary, #9a9aa8)', fontSize: '0.85rem' }}>
                            {files.length} pieces · {availablePaths.length} collections
                        </span>
                    )}
                    {onDismiss && (
                        <button onClick={onDismiss} title="Cancel (Esc)" style={closeButtonStyle}>✕</button>
                    )}
                </div>

                {isLoading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary, #9a9aa8)' }}>
                        Loading Catalog…
                    </div>
                ) : (
                    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                        {/* Collection list */}
                        <div style={railStyle}>
                            {availablePaths.length === 0 && <Empty>No collections found.</Empty>}
                            {availablePaths.map(p => {
                                const isActive = p === selectedPath;
                                const { total, played } = collectionStats(p);
                                return (
                                    <button key={p} onClick={() => setSelectedPath(p)} style={collectionButtonStyle(isActive)}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: isActive ? 600 : 400 }}>
                                            {collectionLabel(p)}
                                        </div>
                                        <div style={subLabelStyle}>
                                            🎵 {total}{played > 0 && ` · ✓ ${played}`}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Piece list */}
                        <div style={detailStyle}>
                            <h3 style={sectionTitleStyle}>
                                {selectedPath ? `Pieces — ${collectionLabel(selectedPath)}` : 'Pieces'}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {recordsForPath.length === 0 && <Empty>No pieces in this collection.</Empty>}
                                {recordsForPath.map(f => {
                                    const cached = !!cacheMap[f.name];
                                    const score = bestScore(f.path, f.name);
                                    return (
                                        <button
                                            key={f.name}
                                            onClick={() => startPiece(f.name)}
                                            title={`Play ${niceName(f.name)}`}
                                            style={pieceButtonStyle}
                                        >
                                            <span style={{ fontSize: '0.88rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {niceName(f.name)}
                                            </span>
                                            {score !== null && (
                                                <span style={scoreBadgeStyle(score)} title="Best precision recorded">
                                                    {Math.round(score * 100)}%
                                                </span>
                                            )}
                                            {/* role=button (not a nested <button>) so it can live inside the row button */}
                                            <span
                                                role="button"
                                                tabIndex={-1}
                                                title={cached ? 'Cached offline — click to remove' : 'Save for offline'}
                                                onClick={(e) => { e.stopPropagation(); (cached ? evictRecord : cacheRecord)(f.name); }}
                                                style={cacheChipStyle(cached)}
                                            >
                                                {cached ? '💾' : '📥'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer: local file + score-server connection / upload */}
                <div style={footerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input ref={fileInputRef} type="file" accept=".mei" style={{ display: 'none' }} onChange={handleLocalFile} />
                        <button onClick={() => fileInputRef.current?.click()} style={secondaryButtonStyle}>
                            📁 Local MEI File
                        </button>
                        <div style={{ flex: 1 }} />
                        {serverBase ? (
                            <>
                                <span style={{ fontSize: '0.85rem', color: '#7bd88f', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    🟢 {serverBase}
                                </span>
                                <button onClick={handleDisconnect} style={secondaryButtonStyle}>Disconnect</button>
                            </>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    value={serverInput}
                                    onChange={(e) => setServerInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                                    placeholder="http://localhost:3001"
                                    style={{ ...inputStyle, flex: '0 1 200px', minWidth: 0 }}
                                />
                                <button
                                    onClick={handleConnect}
                                    disabled={isConnecting || !serverInput.trim()}
                                    style={{ ...secondaryButtonStyle, cursor: isConnecting ? 'wait' : 'pointer' }}
                                >
                                    {isConnecting ? 'Connecting…' : 'Connect'}
                                </button>
                            </>
                        )}
                    </div>

                    {serverError && (
                        <div style={{ fontSize: '0.85rem', color: '#e66' }}>{serverError}</div>
                    )}

                    {/* Upload MEI files to the server, into an existing or new category */}
                    {serverBase && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <select
                                value={categoryValue}
                                onChange={(e) => setUploadCategory(e.target.value)}
                                title="Category for uploaded files"
                                style={{ ...selectStyle, flex: '1 1 160px', minWidth: 0 }}
                            >
                                {categories.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                                <option value={NEW_CATEGORY}>➕ New category…</option>
                            </select>
                            {categoryValue === NEW_CATEGORY && (
                                <input
                                    type="text"
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    placeholder="new_category_name"
                                    style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }}
                                />
                            )}
                            <button
                                onClick={() => uploadInputRef.current?.click()}
                                disabled={isUploading || (categoryValue === NEW_CATEGORY && !CATEGORY_RE.test(newCategory.trim()))}
                                title="Upload MEI files into the selected category"
                                style={{ ...secondaryButtonStyle, cursor: isUploading ? 'wait' : 'pointer' }}
                            >
                                {isUploading ? 'Uploading…' : '📤 Upload'}
                            </button>
                            <input ref={uploadInputRef} type="file" accept=".mei" multiple style={{ display: 'none' }} onChange={handleUpload} />
                            {uploadStatus && (
                                <div style={{ width: '100%', fontSize: '0.85rem', color: uploadStatus.includes('✓') ? '#7bd88f' : '#e66' }}>
                                    {uploadStatus}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const overlayStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, zIndex: 150,
    background: 'rgba(8, 8, 12, 0.88)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', padding: '1rem',
};

const cardStyle: React.CSSProperties = {
    width: 'min(1000px, 94vw)', height: 'min(640px, 88vh)',
    background: 'var(--color-bg-primary, #16161c)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '14px', display: 'flex', flexDirection: 'column',
    overflow: 'hidden', boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
};

const headerStyle: React.CSSProperties = {
    padding: '0.9rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)',
    display: 'flex', alignItems: 'center', gap: '1rem',
};

const railStyle: React.CSSProperties = {
    width: '300px', flexShrink: 0, overflowY: 'auto',
    borderRight: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem',
};

const detailStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, overflowY: 'auto', padding: '1rem 1.25rem',
};

const footerStyle: React.CSSProperties = {
    borderTop: '1px solid rgba(255,255,255,0.1)',
    padding: '0.75rem 1.25rem',
    display: 'flex', flexDirection: 'column', gap: '0.6rem',
};

const sectionTitleStyle: React.CSSProperties = {
    margin: '0 0 0.6rem',
    fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--color-text-secondary, #9a9aa8)',
};

const subLabelStyle: React.CSSProperties = {
    fontSize: '0.72rem', color: 'var(--color-text-secondary, #9a9aa8)', marginTop: '2px',
};

const collectionButtonStyle = (active: boolean): React.CSSProperties => ({
    display: 'block', width: '100%', textAlign: 'left',
    padding: '0.55rem 0.7rem', marginBottom: '2px',
    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
    border: 'none', borderLeft: `3px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
    borderRadius: '6px', color: 'white', cursor: 'pointer',
});

const pieceButtonStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%',
    padding: '0.5rem 0.75rem', textAlign: 'left',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', color: 'white', cursor: 'pointer',
};

const scoreBadgeStyle = (pct: number): React.CSSProperties => ({
    fontSize: '0.7rem', fontFamily: 'monospace', fontWeight: 700,
    padding: '1px 7px', borderRadius: '9px', flexShrink: 0,
    color: scoreColor(pct), border: `1px solid ${scoreColor(pct)}55`,
});

const cacheChipStyle = (cached: boolean): React.CSSProperties => ({
    fontSize: '0.9rem', lineHeight: 1, flexShrink: 0,
    padding: '2px 5px', borderRadius: '8px', cursor: 'pointer',
    opacity: cached ? 1 : 0.55,
    background: cached ? 'rgba(255,255,255,0.06)' : 'transparent',
    border: `1px solid ${cached ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)'}`,
});

const selectStyle: React.CSSProperties = {
    width: '100%', padding: '0.7rem 0.8rem', borderRadius: '8px',
    background: '#22222a', color: 'white',
    border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.95rem',
};

const inputStyle: React.CSSProperties = { ...selectStyle };

const secondaryButtonStyle: React.CSSProperties = {
    padding: '0.7rem 1.2rem', fontSize: '0.9rem',
    background: 'transparent', color: 'var(--color-text-secondary, #cfcfd8)',
    border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50px',
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
};

const closeButtonStyle: React.CSSProperties = {
    marginLeft: 'auto', width: '32px', height: '32px', borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.25)', background: 'transparent',
    color: 'white', cursor: 'pointer', flexShrink: 0,
};

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span style={{ color: 'var(--color-text-secondary, #666)', fontSize: '0.85rem' }}>{children}</span>
);

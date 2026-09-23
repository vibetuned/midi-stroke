import { isKeptSong, type AccompanimentSync } from './accompanimentSync';

/**
 * Accompaniments: a recording attached to a song, played along with it in
 * rhythm mode (hooks/useAccompaniment.ts). This is where they are kept.
 *
 * Songs that stay in the library keep theirs on the device, in the Origin
 * Private File System beside the uploaded ZIP collections:
 *   accompaniments/index.json   songKey → the recording's details and sync
 *   accompaniments/<id>         the file, exactly as it was picked
 * A local MEI file opened on its own lasts one session (a blob: URL), so its
 * accompaniment is held in memory only and dropped when the song goes
 * (isKeptSong). Deleting an uploaded collection deletes its songs'
 * accompaniments too (removeAccompanimentsUnder). Without OPFS, everything is
 * held in memory for the session.
 */

export interface AccompanimentMeta extends AccompanimentSync {
    /** Storage name of the file (a random id). */
    id: string;
    fileName: string;
    type: string;
    size: number;
    /** Seconds. */
    duration: number;
    /** Playback level, in dB. */
    volume: number;
}

const DIR = 'accompaniments';
const INDEX = 'index.json';

let index = new Map<string, AccompanimentMeta>();
/** Files of the entries not written to OPFS (session songs, or no OPFS). */
const memoryFiles = new Map<string, Blob>();
const listeners = new Set<() => void>();
let loaded: Promise<void> | null = null;

function opfsAvailable(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.getDirectory === 'function';
}

async function dir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
    if (!opfsAvailable()) return null;
    try {
        return await (await navigator.storage.getDirectory()).getDirectoryHandle(DIR, { create });
    } catch {
        return null;
    }
}

async function writeFile(d: FileSystemDirectoryHandle, name: string, data: Blob | string): Promise<void> {
    const fh = await d.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
}

function notify(): void {
    listeners.forEach(fn => fn());
}

/** Read the index once, on first use. */
function ensureLoaded(): Promise<void> {
    if (!loaded) {
        loaded = (async () => {
            const d = await dir(false);
            if (!d) return;
            try {
                const text = await (await (await d.getFileHandle(INDEX)).getFile()).text();
                const raw = JSON.parse(text) as { entries?: Record<string, AccompanimentMeta> };
                const next = new Map(index);
                for (const [key, meta] of Object.entries(raw.entries ?? {})) {
                    if (meta && typeof meta.id === 'string' && !next.has(key)) next.set(key, meta);
                }
                index = next;
                notify();
            } catch { /* no index yet */ }
        })();
    }
    return loaded;
}

async function saveIndex(): Promise<void> {
    const d = await dir(true);
    if (!d) return;
    const entries: Record<string, AccompanimentMeta> = {};
    for (const [key, meta] of index) if (!memoryFiles.has(key)) entries[key] = meta;
    await writeFile(d, INDEX, JSON.stringify({ version: 1, entries }));
}

// ---------------------------------------------------------------- reading

export function subscribeAccompaniments(fn: () => void): () => void {
    void ensureLoaded();
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** Every accompaniment, by song key. A new Map after each change. */
export function getAccompaniments(): ReadonlyMap<string, AccompanimentMeta> {
    return index;
}

/** Whether a song's accompaniment is on the device (not just this session). */
export function isStoredOnDevice(songKey: string): boolean {
    return index.has(songKey) && !memoryFiles.has(songKey);
}

async function readFile(songKey: string): Promise<Blob> {
    const mem = memoryFiles.get(songKey);
    if (mem) return mem;
    const meta = index.get(songKey);
    const d = await dir(false);
    if (!meta || !d) throw new Error('Accompaniment not found');
    return (await d.getFileHandle(meta.id)).getFile();
}

const decoded = new Map<string, Promise<AudioBuffer>>();

/** The recording, decoded (once per file, shared by the sync view and the player). */
export function decodeAccompaniment(songKey: string, ctx: BaseAudioContext): Promise<AudioBuffer> {
    const meta = index.get(songKey);
    if (!meta) return Promise.reject(new Error('No accompaniment'));
    let p = decoded.get(meta.id);
    if (!p) {
        p = readFile(songKey).then(f => f.arrayBuffer()).then(b => ctx.decodeAudioData(b));
        p.catch(() => decoded.delete(meta.id));
        decoded.set(meta.id, p);
    }
    return p;
}

// ---------------------------------------------------------------- writing

/**
 * Attach a recording to a song, replacing any it had. Decodes it first, so
 * a format this browser cannot play is refused before anything is stored.
 * `sync` makes the first guess from the decoded audio.
 */
export async function saveAccompaniment(
    songKey: string,
    file: File,
    ctx: BaseAudioContext,
    sync: (buffer: AudioBuffer) => AccompanimentSync,
): Promise<AccompanimentMeta> {
    await ensureLoaded();
    let buffer: AudioBuffer;
    try {
        buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
        const ext = file.name.includes('.') ? file.name.split('.').pop()!.toUpperCase() : 'this';
        throw new Error(`This browser can't play ${ext} files. WAV, MP3 and AAC (.m4a) play everywhere.`);
    }
    const old = index.get(songKey);
    const meta: AccompanimentMeta = {
        id: crypto.randomUUID(),
        fileName: file.name,
        type: file.type,
        size: file.size,
        duration: buffer.duration,
        volume: old?.volume ?? 0,
        ...sync(buffer),
    };
    decoded.set(meta.id, Promise.resolve(buffer));

    const d = isKeptSong(songKey) ? await dir(true) : null;
    if (d) {
        // Ask the browser not to evict it under storage pressure.
        navigator.storage.persist?.().catch(() => { /* best effort */ });
        await writeFile(d, meta.id, file);
        memoryFiles.delete(songKey);
    } else {
        memoryFiles.set(songKey, file);
    }
    const next = new Map(index);
    next.set(songKey, meta);
    index = next;
    notify();
    await saveIndex();
    if (old) await removeFile(old.id);
    return meta;
}

/** Change the sync or the level. */
export async function updateAccompaniment(songKey: string, patch: Partial<Pick<AccompanimentMeta, 'offset' | 'bpm' | 'volume'>>): Promise<void> {
    const meta = index.get(songKey);
    if (!meta) return;
    const next = new Map(index);
    next.set(songKey, { ...meta, ...patch });
    index = next;
    notify();
    if (!memoryFiles.has(songKey)) await saveIndex();
}

async function removeFile(id: string): Promise<void> {
    decoded.delete(id);
    const d = await dir(false);
    try { await d?.removeEntry(id); } catch { /* already gone */ }
}

export async function removeAccompaniment(songKey: string): Promise<void> {
    await ensureLoaded();
    const meta = index.get(songKey);
    if (!meta) return;
    const wasOnDevice = !memoryFiles.has(songKey);
    memoryFiles.delete(songKey);
    const next = new Map(index);
    next.delete(songKey);
    index = next;
    notify();
    if (wasOnDevice) {
        await saveIndex();
        await removeFile(meta.id);
    } else {
        decoded.delete(meta.id);
    }
}

/** Remove the accompaniments of every song under a prefix — an uploaded
 *  collection being deleted ("opfs:piano/my_songs/"). */
export async function removeAccompanimentsUnder(prefix: string): Promise<void> {
    await ensureLoaded();
    for (const key of [...index.keys()]) {
        if (key.startsWith(prefix)) await removeAccompaniment(key);
    }
}

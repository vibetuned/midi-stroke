import { unzipSync, strFromU8 } from 'fflate';

/**
 * Client-side song storage in the Origin Private File System (OPFS).
 *
 * Uploaded ZIPs of MEI scores are unpacked into
 *   uploads/<instrument>/<collection>/<file>.mei
 * and surfaced in the catalog as collections with path
 *   "opfs:<instrument>/<collection>"
 * so the resulting selectedSong values ("opfs:piano/my_songs/tune.mei") are
 * stable stats keys, flow through buildSongUrl unchanged, and are read back
 * via loadSongText instead of fetch.
 */

export const OPFS_PREFIX = 'opfs:';
const ROOT_DIR = 'uploads';

export interface OpfsSongFile {
    path: string; // "opfs:<instrument>/<collection>"
    name: string; // "<file>.mei"
}

// lib.dom is missing the async iterator on FileSystemDirectoryHandle.
type IterableDirHandle = FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

export function isOpfsSupported(): boolean {
    return typeof navigator !== 'undefined'
        && !!navigator.storage
        && typeof navigator.storage.getDirectory === 'function';
}

async function dirHandle(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    try {
        let dir = await navigator.storage.getDirectory();
        for (const seg of [ROOT_DIR, ...segments]) {
            dir = await dir.getDirectoryHandle(seg, { create });
        }
        return dir;
    } catch {
        return null; // missing directory (create: false) or OPFS unavailable
    }
}

/** "My Songs (2).zip" → "My_Songs_2" — same character set as server categories. */
export function collectionNameFromZip(zipFileName: string): string {
    const base = zipFileName.replace(/\.zip$/i, '');
    const slug = base.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return slug || 'uploaded';
}

/** Extract the .mei entries of a ZIP, flattened to their basenames.
 *  Skips directories, macOS resource-fork noise and dotfiles. */
export function meiEntriesFromZip(zipData: Uint8Array): Array<{ name: string; text: string }> {
    const entries = unzipSync(zipData);
    const out: Array<{ name: string; text: string }> = [];
    const seen = new Set<string>();
    for (const [entryPath, data] of Object.entries(entries)) {
        if (entryPath.endsWith('/')) continue;
        if (entryPath.includes('__MACOSX')) continue;
        const name = entryPath.split('/').pop() ?? '';
        if (!name || name.startsWith('.') || !/\.mei$/i.test(name)) continue;
        if (seen.has(name)) continue; // same basename in two zip folders: first wins
        seen.add(name);
        out.push({ name, text: strFromU8(data) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Unpack a ZIP file into uploads/<instrument>/<collection>/ (created or
 * merged into if it already exists). Returns the collection name and how
 * many MEI files were stored.
 */
export async function importZipToOpfs(
    instrument: string,
    zipFile: File,
): Promise<{ collection: string; count: number }> {
    const collection = collectionNameFromZip(zipFile.name);
    const entries = meiEntriesFromZip(new Uint8Array(await zipFile.arrayBuffer()));
    if (entries.length === 0) throw new Error('No .mei files found in the ZIP');

    // Ask the browser not to evict the uploaded scores under storage pressure.
    navigator.storage.persist?.().catch(() => { /* best effort */ });

    const dir = await dirHandle([instrument, collection], true);
    if (!dir) throw new Error('Origin Private File System is not available');

    for (const entry of entries) {
        const fh = await dir.getFileHandle(entry.name, { create: true });
        const writable = await fh.createWritable();
        await writable.write(entry.text);
        await writable.close();
    }
    return { collection, count: entries.length };
}

/** All uploaded songs of an instrument, in catalog {path, name} shape. */
export async function listOpfsSongs(instrument: string): Promise<OpfsSongFile[]> {
    if (!isOpfsSupported()) return [];
    const instDir = await dirHandle([instrument], false);
    if (!instDir) return [];
    const out: OpfsSongFile[] = [];
    for await (const [collection, handle] of (instDir as IterableDirHandle).entries()) {
        if (handle.kind !== 'directory') continue;
        const names: string[] = [];
        for await (const [name, fileHandle] of (handle as IterableDirHandle).entries()) {
            if (fileHandle.kind === 'file' && /\.mei$/i.test(name)) names.push(name);
        }
        names.sort((a, b) => a.localeCompare(b));
        for (const name of names) {
            out.push({ path: `${OPFS_PREFIX}${instrument}/${collection}`, name });
        }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name));
}

/** Read one uploaded song. selectedSong: "opfs:<instrument>/<collection>/<name>". */
export async function readOpfsSong(selectedSong: string): Promise<string> {
    const parts = selectedSong.slice(OPFS_PREFIX.length).split('/');
    const [instrument, collection, ...rest] = parts;
    const name = rest.join('/');
    if (!instrument || !collection || !name) throw new Error(`Malformed OPFS song path: ${selectedSong}`);
    const dir = await dirHandle([instrument, collection], false);
    if (!dir) throw new Error(`Uploaded collection not found: ${collection}`);
    const fh = await dir.getFileHandle(name);
    const file = await fh.getFile();
    return file.text();
}

/** Delete an uploaded collection. collectionPath: "opfs:<instrument>/<collection>". */
export async function deleteOpfsCollection(collectionPath: string): Promise<void> {
    const [instrument, collection] = collectionPath.slice(OPFS_PREFIX.length).split('/');
    if (!instrument || !collection) return;
    const instDir = await dirHandle([instrument], false);
    if (!instDir) return;
    await instDir.removeEntry(collection, { recursive: true });
}

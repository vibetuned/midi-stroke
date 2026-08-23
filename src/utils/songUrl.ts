import { parseScaleUrl, scaleDataUrl } from './scaleGen';
import { OPFS_PREFIX, readOpfsSong } from './opfs';

/**
 * URL of the song catalog: the score server's manifest when connected,
 * otherwise the bundled files.json for the instrument.
 */
export function catalogUrl(serverBase: string | null, instrument: string): string {
    return serverBase
        ? `${serverBase}/api/${instrument}/manifest`
        : `${import.meta.env.BASE_URL}${instrument}_files.json`;
}

/**
 * Canonical selectedSong value for a catalog entry: an absolute URL for
 * score-server files, the historical relative "<path>/<name>" form for
 * bundled files. Pass through resolveSongUrl to get a fetchable URL.
 * Server manifest paths are "<instrument>/<category>", so the category is
 * everything after the first "/".
 */
export function buildSongUrl(
    serverBase: string | null,
    instrument: string,
    path: string,
    name: string,
): string {
    // Uploaded (OPFS) collections are client-local — never routed via a server.
    if (path.startsWith(OPFS_PREFIX)) {
        return `${path}/${name}`;
    }
    if (serverBase) {
        const category = path.split('/').slice(1).join('/');
        return `${serverBase}/api/${instrument}/files/${encodeURIComponent(category)}/${encodeURIComponent(name)}`;
    }
    return `${path}/${name}`;
}

/**
 * Resolve a selectedSong value to a fetchable URL.
 * Absolute URLs (score-server files, blob: object URLs) pass through
 * unchanged; synthetic scale: URLs are generated on the fly into a data:
 * URL (so the scale: string stays a stable stats/cache key); bundled
 * catalog paths get a leading slash.
 */
export function resolveSongUrl(selectedSong: string): string {
    if (selectedSong.startsWith('scale:')) {
        const spec = parseScaleUrl(selectedSong);
        if (spec) return scaleDataUrl(spec);
    }
    if (
        selectedSong.startsWith('/') ||
        selectedSong.startsWith('blob:') ||
        selectedSong.startsWith(OPFS_PREFIX) ||
        /^https?:\/\//i.test(selectedSong)
    ) {
        return selectedSong;
    }
    // Bundled catalog path ("piano/…/x.mei") — a stable stats key; prefix the
    // deploy base (usually "/", "/app/" on the Pages deploy) to fetch it.
    return `${import.meta.env.BASE_URL}${selectedSong}`;
}

/**
 * Load a song's MEI text. OPFS-backed songs ("opfs:…", uploaded ZIPs) are
 * read from the Origin Private File System; everything else resolves to a
 * URL and is fetched (bundled files, score-server files, blob:/data: URLs).
 */
export async function loadSongText(selectedSong: string): Promise<string> {
    if (selectedSong.startsWith(OPFS_PREFIX)) {
        return readOpfsSong(selectedSong);
    }
    const path = resolveSongUrl(selectedSong);
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    return response.text();
}

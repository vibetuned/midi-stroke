/**
 * URL of the song catalog: the score server's manifest when connected,
 * otherwise the bundled files.json for the instrument.
 */
export function catalogUrl(serverBase: string | null, instrument: string): string {
    return serverBase
        ? `${serverBase}/api/${instrument}/manifest`
        : `/${instrument}_files.json`;
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
    if (serverBase) {
        const category = path.split('/').slice(1).join('/');
        return `${serverBase}/api/${instrument}/files/${encodeURIComponent(category)}/${encodeURIComponent(name)}`;
    }
    return `${path}/${name}`;
}

/**
 * Resolve a selectedSong value to a fetchable URL.
 * Absolute URLs (score-server files, blob: object URLs) pass through
 * unchanged; bundled catalog paths get a leading slash.
 */
export function resolveSongUrl(selectedSong: string): string {
    if (
        selectedSong.startsWith('/') ||
        selectedSong.startsWith('blob:') ||
        /^https?:\/\//i.test(selectedSong)
    ) {
        return selectedSong;
    }
    return `/${selectedSong}`;
}

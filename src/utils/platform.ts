/** True when running inside the Tauri desktop shell (see src-tauri/). */
export function isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * The deployed web origin of the app (public/CNAME). The Tauri shell uses it
 * for content that refuses to run on the tauri:// custom scheme — e.g. the
 * YouTube embed wrapper (public/yt.html), since YouTube rejects embeds whose
 * page has no http(s) origin (player error 153).
 */
export const DEPLOYED_ORIGIN = 'https://ms.vibetuned.com';

/** True when running inside the Tauri desktop shell (see src-tauri/). */
export function isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Where the app is deployed on the web: the docs site owns the root of
 * ms.vibetuned.com and the app lives under /app (see deploy.yml). The Tauri
 * shell uses this for content that refuses to run on the tauri:// custom
 * scheme — e.g. the YouTube embed wrapper (public/yt.html), since YouTube
 * rejects embeds whose page has no http(s) origin (player error 153).
 */
export const DEPLOYED_APP_URL = 'https://ms.vibetuned.com/app';

/** True when running inside the Tauri desktop shell (see src-tauri/). */
export function isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * True in the Android and iOS apps (the Tauri shell on a phone or tablet):
 * MIDI is the platform's there, and a Bluetooth instrument is paired from the
 * app (src-tauri/plugins/native-midi). An iPad's webview says "Macintosh",
 * but a Mac has no touch points.
 */
export function isMobileApp(): boolean {
    if (!isTauri() || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Android|iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Where the app is deployed on the web: the docs site owns the root of
 * ms.vibetuned.com and the app lives under /app (see deploy.yml). The Tauri
 * shell uses this for content that refuses to run on the tauri:// custom
 * scheme — e.g. the YouTube embed wrapper (public/yt.html), since YouTube
 * rejects embeds whose page has no http(s) origin (player error 153).
 */
export const DEPLOYED_APP_URL = 'https://ms.vibetuned.com/app';

/**
 * Open a link outside the app: the system's browser (or mail app) in the
 * desktop and mobile apps — a webview would otherwise leave the app for it —
 * and a new tab on the web.
 */
export function openExternal(url: string): void {
    if (isTauri()) {
        const w = window as unknown as { __TAURI__?: { core: { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> } } };
        w.__TAURI__?.core.invoke('plugin:opener|open_url', { url }).catch(err => console.error('Could not open', url, err));
        return;
    }
    window.open(url, '_blank', 'noopener');
}

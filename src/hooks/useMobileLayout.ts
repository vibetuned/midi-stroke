import { useEffect, useState } from 'react';

/**
 * Whether the app is on a phone, and how it is held.
 *
 * A phone is a touch screen whose short side is at most 500 px — a phone in
 * either orientation, never a tablet or a desktop (a desktop's touch screen
 * has a fine pointer as well). On a phone the instrument apps use the mobile
 * layout (components/mobile/MobileShell.tsx), landscape only; everywhere else
 * the layout is the desktop one, untouched.
 *
 * `?layout=mobile` or `?layout=desktop` in the address overrides it, and is
 * remembered on the device (`?layout=auto` forgets it): for trying the mobile
 * layout in a desktop browser, or keeping the desktop one on a phone.
 */
const PHONE = '(pointer: coarse) and (max-height: 500px), (pointer: coarse) and (max-width: 500px)';
const PORTRAIT = '(orientation: portrait)';
const STORAGE_KEY = 'midi-stroke-layout';

type Override = 'mobile' | 'desktop' | null;

function readOverride(): Override {
    try {
        const asked = new URLSearchParams(globalThis.location?.search ?? '').get('layout');
        if (asked === 'mobile' || asked === 'desktop') {
            globalThis.localStorage?.setItem(STORAGE_KEY, asked);
            return asked;
        }
        if (asked === 'auto') {
            globalThis.localStorage?.removeItem(STORAGE_KEY);
            return null;
        }
        const kept = globalThis.localStorage?.getItem(STORAGE_KEY);
        return kept === 'mobile' || kept === 'desktop' ? kept : null;
    } catch {
        return null;
    }
}

const override = readOverride();

function useMedia(query: string): boolean {
    const [matches, setMatches] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
    useEffect(() => {
        const mql = globalThis.matchMedia?.(query);
        if (!mql) return;
        const update = () => setMatches(mql.matches);
        update();
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
    }, [query]);
    return matches;
}

/** True on a phone (or when the mobile layout is asked for). */
export function useMobileLayout(): boolean {
    const phone = useMedia(PHONE);
    return override === 'mobile' ? true : override === 'desktop' ? false : phone;
}

/** True when the screen is taller than it is wide. */
export function usePortrait(): boolean {
    return useMedia(PORTRAIT);
}

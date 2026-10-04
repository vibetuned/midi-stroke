import React, { useEffect } from 'react';
import { useMobileLayout, usePortrait } from '../../hooks/useMobileLayout';
import './MobileShell.css';

/**
 * On a phone held upright: turn it sideways. The app is laid out for
 * landscape on a phone (MobileShell.tsx); a browser cannot turn the screen
 * itself, except in full screen on some (Android's Chrome), which the button
 * offers. Installed as an app, the manifest asks for landscape anyway.
 */
export const RotateNotice: React.FC = () => {
    const mobile = useMobileLayout();
    const portrait = usePortrait();
    // The phone layout's own CSS (the splash's, say) keys off this class on <html>.
    useEffect(() => {
        document.documentElement.classList.toggle('phone', mobile);
    }, [mobile]);
    if (!mobile || !portrait) return null;
    const canLock = !!document.documentElement.requestFullscreen && 'orientation' in screen;
    const goSideways = async () => {
        try {
            await document.documentElement.requestFullscreen();
            await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
        } catch { /* not allowed here: turning the phone still works */ }
    };
    return (
        <div className="rotate-notice" role="dialog" aria-label="Turn your phone sideways">
            <div className="phone" />
            <strong>Turn your phone sideways</strong>
            <p>Midi Stroke plays in landscape on a phone: the score, or your instrument, across the whole screen.</p>
            {canLock && (
                <button onClick={goSideways} style={{ padding: '0.5rem 1.1rem', borderRadius: '18px', border: 'none', background: 'var(--color-accent, #646cff)', color: 'white', fontSize: '0.9rem' }}>
                    Full screen, sideways
                </button>
            )}
        </div>
    );
};

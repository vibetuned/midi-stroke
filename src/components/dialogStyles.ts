import type React from 'react';

/**
 * The look the header's dialogs share — the 🎧 playback panel and the ⚙
 * settings: a card per option, its icon at the left and its name in bold,
 * outlined in the accent when it is chosen or on. What an option does is in its
 * title, shown on hover, so the cards stay a line each.
 */

export const cardStyle = (on: boolean): React.CSSProperties => ({
    display: 'flex', gap: '0.8rem', alignItems: 'center',
    padding: '0.85rem 1rem', borderRadius: '10px',
    border: `1px solid ${on ? 'var(--color-accent)' : 'rgba(255,255,255,0.12)'}`,
    background: on ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)' : 'rgba(255,255,255,0.03)',
});

export const cardIconStyle: React.CSSProperties = {
    fontSize: '1.35rem', lineHeight: 1.2, width: '1.6rem', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
};

export const cardTitleStyle: React.CSSProperties = { fontWeight: 600, fontSize: '0.95rem' };

export const closeStyle: React.CSSProperties = {
    width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #444',
    background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

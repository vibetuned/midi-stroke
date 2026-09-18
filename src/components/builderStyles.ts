import type React from 'react';

/**
 * Shared styling for the exercise builders in the song selector — the piano
 * scale generator (ScaleBuilder) and the saxo jazz generator
 * (saxo/JazzScaleBuilder) — so the two panels stay visually identical.
 * Components live next door in Stepper.tsx (fast refresh wants a file to
 * export either components or constants, not both).
 */

export const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '0.25rem',
    fontSize: '0.75rem', color: 'var(--color-text-secondary, #9a9aa8)',
};

export const selectStyle: React.CSSProperties = {
    padding: '0.5rem 1.5rem 0.5rem 0.6rem', borderRadius: '8px',
    backgroundColor: '#22222a', color: 'white',
    border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.9rem',
};

export const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.3rem 0.7rem', borderRadius: '14px', fontSize: '0.8rem',
    background: active ? 'var(--color-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary, #cfcfd8)',
    border: `1px solid ${active ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`,
    cursor: 'pointer',
});

export const startButtonStyle: React.CSSProperties = {
    marginTop: '0.3rem', padding: '0.7rem 1rem', fontSize: '0.92rem', fontWeight: 600,
    background: 'var(--color-accent)', color: 'white',
    border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
};

export const previewBoxStyle: React.CSSProperties = {
    overflowX: 'auto', overflowY: 'hidden', flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    padding: '0.4rem 0.6rem', minHeight: '120px',
    display: 'flex', alignItems: 'center',
    background: 'rgba(255,255,255,0.03)',
};

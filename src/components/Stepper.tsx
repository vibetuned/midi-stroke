import React from 'react';
import { chipStyle } from './builderStyles';

/** A row of numeric chips (octaves, repeats) shared by the exercise builders. */
export const Stepper: React.FC<{
    label: string; value: number; min: number; max: number;
    onChange: (v: number) => void; disabled?: boolean;
}> = ({ label, value, min, max, onChange, disabled }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', opacity: disabled ? 0.45 : 1 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #9a9aa8)' }}>{label}</span>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(v => (
                <button key={v} onClick={() => !disabled && onChange(v)} style={chipStyle(value === v)}>
                    {v}
                </button>
            ))}
        </div>
    </div>
);

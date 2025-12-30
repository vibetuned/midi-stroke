import React from 'react';
import { useMidi } from '../hooks/useMidi';

export const MidiStatus: React.FC = () => {
    const { midiAccess, inputs, activeNotes } = useMidi();
    const isMidiActive = !!midiAccess;
    const deviceCount = inputs.length;

    return (
        <div style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '0.5rem',
            zIndex: 100
        }}>
            <div style={{
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                background: isMidiActive ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                color: isMidiActive ? 'var(--color-success)' : 'var(--color-error)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
            }}>
                <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'currentColor'
                }} />
                {isMidiActive ? `MIDI Ready (${deviceCount} devices)` : 'MIDI Unavailable'}
            </div>

            {/* Active Notes Display for Debugging */}
            {activeNotes.size > 0 && (
                <div style={{
                    padding: '0.5rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-secondary)'
                }}>
                    Keys: {Array.from(activeNotes.keys()).join(', ')}
                </div>
            )}
        </div>
    );
};

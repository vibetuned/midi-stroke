import React from 'react';
import { useMidi } from '../hooks/useMidi';
import { isMobileApp } from '../utils/platform';

/**
 * In the Android and iOS apps: pair a Bluetooth MIDI instrument — iOS's own
 * Bluetooth MIDI view, Android's list of the instruments in range
 * (src-tauri/plugins/native-midi). Once connected it is listened to like any
 * other. Nothing on the web or a computer, which pair in their settings.
 */
export const BluetoothMidiButton: React.FC<{ size?: number }> = ({ size = 28 }) => {
    if (!isMobileApp()) return null;
    const pair = () => {
        const w = window as unknown as { __TAURI__?: { core: { invoke(cmd: string): Promise<unknown> } } };
        w.__TAURI__?.core.invoke('midi_bluetooth').catch(err => window.alert(String(err)));
    };
    return (
        <button
            onClick={pair}
            title="Connect a Bluetooth MIDI instrument"
            aria-label="Connect a Bluetooth MIDI instrument"
            style={{
                width: size, height: size, borderRadius: '50%', padding: 0, flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'var(--color-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
        >
            {/* The Bluetooth rune, drawn. */}
            <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 7l10 10-5 5V2l5 5L7 17" />
            </svg>
        </button>
    );
};

export const MidiStatus: React.FC = () => {
    const { isMidiActive, deviceNames, activeNotes } = useMidi();
    const deviceCount = deviceNames.length;

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BluetoothMidiButton size={32} />
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

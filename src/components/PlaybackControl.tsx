import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/game';
import { useVerovio } from '../hooks/useVerovio';
import { extractTimemap } from '../utils/timemap';
import { listMidiOutputs } from '../utils/midiOut';
import { hasPlaybackVoice, playTimemap, type PlaybackHandle } from '../utils/playback';

/**
 * Where playback goes: silent, the app's own instrument, or a MIDI output — the
 * compact form, for the exercise builders. The transport's version is the 🎧
 * panel in the header (PlaybackPanel.tsx); both share one remembered setting.
 */
export const PlaybackTargetSelect: React.FC<{ compact?: boolean }> = ({ compact }) => {
    const { playbackTarget, setPlaybackTarget } = useGame();
    const [ports, setPorts] = useState<string[]>([]);

    // Ask for the port list lazily: in a browser this is what triggers the Web
    // MIDI permission prompt, so it waits for the user to open the menu.
    const loadPorts = () => { listMidiOutputs().then(setPorts).catch(() => setPorts([])); };
    useEffect(() => {
        if (playbackTarget !== 'off' && playbackTarget !== 'audio') loadPorts();
    }, [playbackTarget]);

    return (
        <select
            value={playbackTarget}
            onFocus={loadPorts}
            onChange={e => setPlaybackTarget(e.target.value)}
            title="Where playback sends the score: nowhere, this app's instrument, or a MIDI output"
            style={{
                padding: compact ? '0.25rem 0.4rem' : '0.45rem 0.6rem',
                borderRadius: '8px', backgroundColor: '#22222a', color: 'white',
                border: '1px solid rgba(255,255,255,0.15)',
                fontSize: compact ? '0.72rem' : '0.85rem', maxWidth: '190px',
            }}
        >
            <option value="off">🔇 Playback off</option>
            <option value="audio">🔈 Play in sound</option>
            {ports.map(p => <option key={p} value={p}>🎹 MIDI → {p}</option>)}
            {ports.length === 0 && <option value="__none" disabled>(no MIDI outputs found)</option>}
        </select>
    );
};

/**
 * Audition button for the exercise builders: plays the MEI it is given,
 * through whatever the target above is set to. The generated exercise is
 * loaded into the Verovio toolkit to read its timemap — the same one the
 * scrolling score uses — so what you hear is what the page says.
 */
export const AuditionButton: React.FC<{
    /** The generated exercise. Null while it is still being built. */
    mei: string | null;
    /** Drum scores notate voices as pitches; playback needs to know. */
    drums?: boolean;
}> = ({ mei, drums }) => {
    const { toolkit } = useVerovio();
    const { playbackTarget, setPlaybackTarget, tempo } = useGame();
    const [playing, setPlaying] = useState(false);
    const handleRef = useRef<PlaybackHandle | null>(null);

    // Stopping goes through the handle, whose onDone clears the state — one
    // path whether playback ended by itself, by this button, or by an edit.
    const stop = () => { handleRef.current?.stop(); };

    // Never leave a note ringing behind a closed picker, or under an exercise
    // that has since been regenerated.
    useEffect(() => () => { handleRef.current?.stop(); }, []);
    useEffect(() => { handleRef.current?.stop(); }, [mei]);

    const canPlay = !!mei && !!toolkit
        && (playbackTarget !== 'audio' || hasPlaybackVoice());

    const start = () => {
        if (!mei || !toolkit) return;
        // An audition with playback off is still a request to hear it: fall
        // back to sound rather than doing nothing silently.
        if (playbackTarget === 'off') setPlaybackTarget('audio');
        const target = playbackTarget === 'off' ? 'audio' : playbackTarget;
        try {
            toolkit.loadData(mei);
            const doc = new DOMParser().parseFromString(mei, 'text/xml');
            const timemap = extractTimemap(toolkit, doc);
            handleRef.current = playTimemap(timemap, {
                bpm: tempo,
                target,
                drums,
                onDone: () => { handleRef.current = null; setPlaying(false); },
            });
            setPlaying(true);
        } catch (e) {
            console.error('Audition failed:', e);
            setPlaying(false);
        }
    };

    return (
        <button
            onClick={() => (playing ? stop() : start())}
            disabled={!canPlay}
            title={playing ? 'Stop' : 'Hear this exercise before you start it'}
            style={{
                padding: '0.45rem 0.8rem', borderRadius: '14px', fontSize: '0.8rem',
                background: playing ? 'var(--color-accent)' : 'transparent',
                color: playing ? '#fff' : 'var(--color-text-secondary, #cfcfd8)',
                border: `1px solid ${playing ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`,
                cursor: canPlay ? 'pointer' : 'default', opacity: canPlay ? 1 : 0.45,
            }}
        >
            {playing ? '⏹ Stop' : '▶ Listen'}
        </button>
    );
};

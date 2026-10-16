import React, { useEffect, useRef } from 'react';
import { useGame } from '../context/game';
import { useMidi, useMidiNotes } from '../hooks/useMidi';
import { usePlayToggle } from '../hooks/usePlayToggle';
import { musicStartOf } from '../utils/countdown';
import './CountdownOverlay.css';

/**
 * Starting from the instrument: while a song waits at its start — the
 * count-in, or a loop's first bar — any key, pad or note played starts it,
 * count-in and all, as the play button does (hooks/usePlayToggle.ts); a
 * small "Press any key to start" says so, where the count will appear.
 *
 * Only at a start: a key pressed while paused mid-piece — trying a note —
 * does not set it going again, unless "Start mid-song from the instrument" is
 * on (the ⚙ settings): then it plays on, "… to continue". Not while a panel is
 * open over the app (the
 * drum pad map learning a pad, the accompaniment's sync, the statistics:
 * anything that is a dialog), nor by ear, whose session runs itself, nor
 * before the audio is enabled. The keyboard's own echoes of the app's notes
 * never get here (utils/midiEcho.ts).
 */
/** `action`: what the player does, "Press any key", "Hit any pad"; the hint adds "to start" or "to continue". */
export const MidiStartHint: React.FC<{ action: string }> = ({ action }) => {
    const { selectedSong, timemap, isPlaying, countdown, gameMode, playPosition, loopRange, isAudioStarted, midiStartAnywhere } = useGame();
    const { isMidiActive, deviceNames } = useMidi();
    const togglePlay = usePlayToggle();

    const atStart = !!timemap && (playPosition <= musicStartOf(timemap) || (!!loopRange && Math.abs(playPosition - loopRange.start) < 1));
    const armed = !!selectedSong && isAudioStarted && !isPlaying && !countdown && gameMode !== 'ear' && (atStart || midiStartAnywhere);

    // One start per arming: the notes of a chord all arrive before the count shows.
    const fired = useRef(false);
    useEffect(() => { if (!armed) fired.current = false; }, [armed]);
    useMidiNotes({
        onNoteOn: () => {
            if (!armed || fired.current) return;
            if (document.querySelector('[role="dialog"]')) return;
            fired.current = true;
            void togglePlay();
        },
    });

    if (!armed || !isMidiActive || deviceNames.length === 0) return null;
    return (
        <div className="countdown-overlay" role="status">
            <div className="midi-start-hint">{action} to {atStart ? 'start' : 'continue'}</div>
        </div>
    );
};

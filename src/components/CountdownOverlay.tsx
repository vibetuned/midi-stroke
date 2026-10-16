import React, { useEffect } from 'react';
import { useGame } from '../context/game';
import { cancelCountdown } from '../utils/countdown';
import './CountdownOverlay.css';

/**
 * The count-in before play (utils/countdown.ts), large over the middle of the
 * screen: "4", "3", "2", "Start". It lets clicks through, and stops the count
 * if the song changes or the app closes.
 */
export const CountdownOverlay: React.FC = () => {
    const { countdown, setCountdown, selectedSong } = useGame();
    useEffect(() => () => { cancelCountdown(); setCountdown(null); }, [selectedSong, setCountdown]);
    if (!countdown) return null;
    const start = !/^\d+$/.test(countdown);
    return (
        <div className="countdown-overlay" aria-live="assertive">
            {/* A new key each beat, so each count pops in afresh. */}
            <div key={countdown} className={`countdown-label${start ? ' countdown-start' : ''}`}>{countdown}</div>
        </div>
    );
};

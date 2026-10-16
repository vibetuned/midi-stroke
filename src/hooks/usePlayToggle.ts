import { useCallback } from 'react';
import * as Tone from 'tone';
import { useGame } from '../context/game';
import { cancelCountdown, countdownPlan, musicStartOf, runCountdown } from '../utils/countdown';

/**
 * Play and pause, for the play button, the space bar and the phone's ▶: play
 * starts with the count-in (utils/countdown.ts); pressed again while it is
 * counting, the count stops and nothing plays. By ear, the session runs the
 * transport itself, so there is no count; with "Count in before play" off
 * (the ⚙ settings), neither.
 */
export function usePlayToggle(): () => Promise<void> {
    const { isPlaying, setIsPlaying, timemap, isMetronomeMuted, gameMode, setCountdown, countIn } = useGame();
    return useCallback(async () => {
        if (cancelCountdown()) return;
        const transport = Tone.getTransport();
        if (isPlaying) {
            setIsPlaying(false);
            transport.pause();
            return;
        }
        try {
            await Tone.start();
        } catch (e) {
            console.error('Audio Context blocked:', e);
            return;
        }
        if (gameMode === 'ear' || !timemap || !countIn) {
            setIsPlaying(true);
            transport.start();
            return;
        }
        const plan = countdownPlan(timemap.meter, transport.bpm.value, transport.ticks, musicStartOf(timemap));
        runCountdown(plan, {
            click: !isMetronomeMuted,
            onLabel: setCountdown,
            onStart: time => {
                transport.start(time);
                setIsPlaying(true);
            },
        });
    }, [isPlaying, setIsPlaying, timemap, isMetronomeMuted, gameMode, setCountdown, countIn]);
}

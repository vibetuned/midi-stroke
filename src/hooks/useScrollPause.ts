import { useCallback, useLayoutEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useGame } from '../context/game';

/**
 * Dragging the score, or the bar strip above it: playback stops while it
 * moves. With "Pause while scrolling" off (the ⚙ settings), a song that was
 * playing plays on from wherever it is let go. `begin` on the pointer going
 * down, `end` on it coming up (as often as the pointer events say — it
 * resumes once). Stable callbacks, for handlers registered once.
 */
export function useScrollPause(): { begin: () => void; end: () => void } {
    const { isPlaying, setIsPlaying, pauseOnScroll } = useGame();
    const latest = useRef({ isPlaying, setIsPlaying, pauseOnScroll });
    useLayoutEffect(() => { latest.current = { isPlaying, setIsPlaying, pauseOnScroll }; });
    const resume = useRef(false);

    const begin = useCallback(() => {
        const { isPlaying: playing, setIsPlaying: set, pauseOnScroll: pause } = latest.current;
        resume.current = playing && !pause;
        if (playing || Tone.getTransport().state !== 'paused') {
            set(false);
            Tone.getTransport().pause();
        }
    }, []);

    const end = useCallback(() => {
        if (!resume.current) return;
        resume.current = false;
        latest.current.setIsPlaying(true);
        Tone.getTransport().start();
    }, []);

    return { begin, end };
}

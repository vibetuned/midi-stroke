import { useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useGame } from '../context/game';
import { useAccompanimentFor } from './useAccompaniment';
import { decodeAccompaniment, removeAccompaniment } from '../utils/accompaniment';
import { audioTimeAt, isKeptSong, type ScoreSpan } from '../utils/accompanimentSync';
import { barBoundaries } from '../utils/loopRange';

/** How far the recording may drift from the score before it is re-placed. */
const MAX_DRIFT_SEC = 0.05;

/** What the accompaniment is doing, for the transport's indicator and the tests. */
export interface AccompanimentStatus {
    playing: boolean;
    /** Seconds into the recording (negative before it starts). */
    position: number;
}
let status: AccompanimentStatus = { playing: false, position: 0 };
export function accompanimentStatus(): AccompanimentStatus {
    return status;
}

/**
 * Plays a song's accompaniment along with it, in rhythm mode only — practice
 * pauses at every note, which would chop a recording up, and By ear does not
 * use the transport. Called once by each app that has accompaniments (piano,
 * saxo).
 *
 * The transport stays in charge. Whenever it plays, the recording is started
 * at the place that matches the playhead (utils/accompanimentSync.ts
 * audioTimeAt), on the audio clock; when a loop wraps, it is re-placed at the
 * wrap's exact time; and a check every 50 ms re-places it if it has drifted —
 * after a seek, or a tempo change in the score. The tempo itself is held at
 * the one the recording was synced to (GameProvider's tempoLock).
 */
export function useAccompanimentPlayer(): void {
    const { selectedSong, gameMode, isPlaying, timemap, isAudioStarted, isMetronomeMuted } = useGame();
    const meta = useAccompanimentFor(selectedSong);

    // A song opened from a local file lasts one session: when another song
    // replaces it, or the app closes, its accompaniment goes too.
    const lastSongRef = useRef<string | null>(null);
    useEffect(() => {
        if (!selectedSong) return;
        const prev = lastSongRef.current;
        lastSongRef.current = selectedSong;
        if (prev && prev !== selectedSong && !isKeptSong(prev)) void removeAccompaniment(prev);
    }, [selectedSong]);
    useEffect(() => () => {
        const key = lastSongRef.current;
        if (key && !isKeptSong(key)) void removeAccompaniment(key);
    }, []);

    // The recording, decoded, as a player with its own level. The Tone
    // objects live in a ref; the state only says which recording is ready.
    const playerRef = useRef<{ player: Tone.Player; volume: Tone.Volume } | null>(null);
    const [readyId, setReadyId] = useState<string | null>(null);
    const id = meta?.id;
    useEffect(() => {
        if (!id || !selectedSong || !isAudioStarted) return;
        let cancelled = false;
        let made: { player: Tone.Player; volume: Tone.Volume } | null = null;
        decodeAccompaniment(selectedSong, Tone.getContext().rawContext as unknown as BaseAudioContext)
            .then(buffer => {
                if (cancelled) return;
                const volume = new Tone.Volume(0).toDestination();
                const p = new Tone.Player(new Tone.ToneAudioBuffer(buffer)).connect(volume);
                made = { player: p, volume };
                playerRef.current = made;
                setReadyId(id);
            })
            .catch(err => console.error('Accompaniment could not be decoded:', err));
        return () => {
            cancelled = true;
            if (made) {
                made.player.dispose();
                made.volume.dispose();
            }
            playerRef.current = null;
            setReadyId(null);
        };
    }, [id, selectedSong, isAudioStarted]);

    // Level and the master mute.
    const level = meta?.volume ?? 0;
    useEffect(() => {
        const node = playerRef.current?.volume;
        if (!node) return;
        node.set({ volume: level, mute: isMetronomeMuted });
    }, [readyId, level, isMetronomeMuted]);

    const span: ScoreSpan | null = useMemo(() => {
        if (!timemap) return null;
        const bars = barBoundaries(timemap);
        return { tempo: timemap.tempo?.initial ? timemap.tempo : null, startTick: bars[0], endTick: timemap.totalTicks };
    }, [timemap]);

    const offset = meta?.offset;
    const bpm = meta?.bpm;
    const active = gameMode === 'standard' && isPlaying && !!readyId && readyId === id && !!span;
    useEffect(() => {
        const p = playerRef.current?.player;
        if (!active || !p || !span || offset === undefined || bpm === undefined) return;
        const transport = Tone.getTransport();
        const duration = p.buffer.duration;
        const sync = { offset, bpm };
        // Where the recording is meant to be at an audio-clock time.
        const expected = (time: number) => audioTimeAt(sync, span, transport.getTicksAtTime(time));
        let started = { time: 0, pos: 0 };

        const place = (time: number) => {
            const pos = expected(time);
            if (p.state === 'started') p.stop(time);
            started = { time, pos };
            if (pos >= duration) return;               // past the recording's end
            if (pos >= 0) p.start(time + 0.001, pos);
            else p.start(time - pos, 0);                // before it starts: wait
        };

        place(Tone.now());
        // A loop wraps on the audio clock; follow it exactly.
        const onLoop = (time: number) => place(time);
        transport.on('loop', onLoop);
        const check = setInterval(() => {
            const now = Tone.now();
            const want = expected(now);
            const have = started.pos + (now - started.time);
            status = { playing: want >= 0 && want < duration, position: want };
            if (Math.min(want, have) < duration && Math.abs(want - have) > MAX_DRIFT_SEC) place(now);
        }, 50);
        return () => {
            transport.off('loop', onLoop);
            clearInterval(check);
            p.stop();
            status = { playing: false, position: status.position };
        };
    }, [active, readyId, span, offset, bpm]);
}

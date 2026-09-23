import { ticksToSeconds, type TempoMap } from './tempo';

/**
 * Where a recording and a score line up. The pure half of the accompaniment
 * feature, so the node checks can run it; the store and the player are in
 * accompaniment.ts and hooks/useAccompaniment.ts.
 *
 * Two numbers are enough, because the score keeps its own proportions: where
 * in the recording the score's first bar starts (`offset`), and the tempo
 * that makes the score last as long as the music does (`bpm` — the tempo
 * slider's value, the opening tempo; later tempo marks keep their proportion
 * to it, utils/tempo.ts). The recording may run past the score at either
 * end — an intro, an outro — or stop before it.
 */
export interface AccompanimentSync {
    /** Seconds into the recording where the score's first bar starts. */
    offset: number;
    /** The score's opening tempo, in quarter notes a minute, that matches the recording. */
    bpm: number;
}

/** The part of a score the sync is about: its first bar and its end, in ticks. */
export interface ScoreSpan {
    tempo: TempoMap | null | undefined;
    /** First real bar — after the count-in the viewers add. */
    startTick: number;
    endTick: number;
}

/** Where in the recording a score tick falls, in seconds (can be < 0 or past the end). */
export function audioTimeAt(sync: AccompanimentSync, score: ScoreSpan, tick: number): number {
    return sync.offset
        + ticksToSeconds(score.tempo, tick, sync.bpm)
        - ticksToSeconds(score.tempo, score.startTick, sync.bpm);
}

/** How long the score lasts at a tempo, first bar to end, in seconds. */
export function scoreDuration(score: ScoreSpan, bpm: number): number {
    return ticksToSeconds(score.tempo, score.endTick, bpm) - ticksToSeconds(score.tempo, score.startTick, bpm);
}

/**
 * The tempo that puts the score's end at `endTime` in the recording, its
 * start staying put. Every section of the score scales with the opening
 * tempo, so duration × tempo is constant.
 */
export function bpmForEnd(
    sync: AccompanimentSync,
    score: ScoreSpan,
    endTime: number,
    limits: { min: number; max: number },
): number {
    const span = endTime - sync.offset;
    const current = scoreDuration(score, sync.bpm);
    if (span <= 0 || current <= 0) return sync.bpm;
    const bpm = sync.bpm * current / span;
    return Math.max(limits.min, Math.min(limits.max, Math.round(bpm * 100) / 100));
}

/** A first guess for a new recording: the score starts where the sound does, at its own tempo. */
export function initialSync(channels: Float32Array[], sampleRate: number, bpm: number): AccompanimentSync {
    return { offset: firstSoundTime(channels, sampleRate), bpm };
}

/** Seconds to the first sample louder than about −40 dBFS (0 if none). */
export function firstSoundTime(channels: Float32Array[], sampleRate: number, threshold = 0.01): number {
    let first = Infinity;
    for (const data of channels) {
        for (let i = 0; i < data.length && i < first; i++) {
            if (Math.abs(data[i]) > threshold) { first = i; break; }
        }
    }
    return isFinite(first) ? Math.round((first / sampleRate) * 1000) / 1000 : 0;
}

/**
 * The waveform, precomputed: the lowest and highest sample of every block
 * of `blockSize` samples, all channels mixed. Drawing reads these (or the
 * samples themselves, zoomed right in), so a long recording redraws at once.
 */
export interface Peaks {
    blockSize: number;
    min: Float32Array;
    max: Float32Array;
}

export function computePeaks(channels: Float32Array[], blockSize = 256): Peaks {
    const length = channels[0]?.length ?? 0;
    const blocks = Math.ceil(length / blockSize);
    const min = new Float32Array(blocks);
    const max = new Float32Array(blocks);
    for (let b = 0; b < blocks; b++) {
        let lo = 0, hi = 0;
        const end = Math.min(length, (b + 1) * blockSize);
        for (let i = b * blockSize; i < end; i++) {
            let v = 0;
            for (const c of channels) v += c[i];
            v /= channels.length;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        min[b] = lo;
        max[b] = hi;
    }
    return { blockSize, min, max };
}

/** The lowest and highest value between two sample positions. */
export function peakRange(peaks: Peaks, from: number, to: number): [number, number] {
    const a = Math.max(0, Math.floor(from / peaks.blockSize));
    const b = Math.min(peaks.min.length, Math.max(a + 1, Math.ceil(to / peaks.blockSize)));
    let lo = 0, hi = 0;
    for (let i = a; i < b; i++) {
        if (peaks.min[i] < lo) lo = peaks.min[i];
        if (peaks.max[i] > hi) hi = peaks.max[i];
    }
    return [lo, hi];
}

/**
 * Whether a song's accompaniment is kept on this device. Songs that stay in
 * the library — bundled, on the score server, in an uploaded ZIP collection,
 * generated exercises — keep theirs. A local MEI file opened on its own is a
 * blob: URL that lasts one session, so its accompaniment goes with it.
 */
export function isKeptSong(songKey: string): boolean {
    return !songKey.startsWith('blob:');
}

/** The file types offered in the picker: everything a browser might decode. */
export const AUDIO_ACCEPT = 'audio/*,.wav,.wave,.mp3,.m4a,.aac,.mp4,.ogg,.oga,.opus,.flac,.webm,.weba,.aif,.aiff,.aifc,.caf';

/** "3:07.2" */
export function formatTime(seconds: number, decimals = 1): string {
    const sign = seconds < 0 ? '−' : '';
    // Rounded first, so 59.96 s reads 1:00 rather than 0:60.
    const scale = 10 ** decimals;
    const s = Math.round(Math.abs(seconds) * scale) / scale;
    const m = Math.floor(s / 60);
    const rest = (s - m * 60).toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0');
    return `${sign}${m}:${rest}`;
}

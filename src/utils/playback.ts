/**
 * Score playback — hearing what is on the page, as sound or as MIDI.
 *
 * Two sinks, one performance. The **audio** sink plays the app's own
 * instrument (the piano sampler, the saxo reed synth, or the drum kit), so a
 * played score sounds like the instrument you are practising. The **MIDI**
 * sink sends note-on/note-off to a chosen output port instead, for a synth, a
 * DAW, or a module — nothing is sounded locally then.
 *
 * Everything is driven from the timemap the app already extracts for the
 * scrolling score (utils/timemap.ts), so playback and notation cannot
 * disagree: the same onsets, the same ticks. There are two ways to use it:
 *
 *  - `playTimemap()` — a standalone audition on Tone's audio clock, used by
 *    the exercise builders to preview a generated exercise while the picker
 *    is still open and the transport is untouched;
 *  - `schedulePlayback()` — attach the same performance to the Tone transport,
 *    so a piece sounds as it scrolls, follows the tempo slider, and stops with
 *    the transport in practice mode.
 *
 * Drums are the one special case: the score notates them as pitches (f4 is a
 * kick), so both sinks translate through the pad map — the kit voice for
 * audio, the General MIDI pad number on channel 10 for MIDI.
 */

import * as Tone from 'tone';
import { TONE_PPQ, type TimemapData } from './timemap';
import { DRUM_CHANNEL, NOTE_OFF, NOTE_ON, openMidiOutput, panic, type MidiPort } from './midiOut';
import { padForScoreNote } from './drumKit';

/** Where a played note goes. */
export type PlaybackTarget = 'off' | 'audio' | string; // a string is a MIDI port name

export const PLAYBACK_VELOCITY = 0.78;
const MIDI_VELOCITY = 100;

/**
 * The app's current instrument, as playback needs it. `useAudio` registers
 * one when it builds the engine, so playback borrows the very voice the
 * player hears themselves on, instead of loading a second copy.
 */
export interface PlaybackVoice {
    /** Sound one score pitch. `time` is on Tone's audio clock; `head` is the
     *  notehead, which drum kits need to pick a voice. */
    note(midi: number, durationSec: number, time: number, velocity: number, head?: string): void;
    /** Silence everything immediately. */
    allOff(): void;
}

let voice: PlaybackVoice | null = null;

export function registerPlaybackVoice(v: PlaybackVoice | null): void {
    if (voice && voice !== v) voice.allOff();
    voice = v;
}

export function hasPlaybackVoice(): boolean {
    return voice !== null;
}

/**
 * Note-on/note-off bytes for a score pitch, translated for drums: the score
 * notates a kick as f4, the wire wants General MIDI pad 36 on channel 10.
 * Exported so the mapping can be checked without a MIDI device attached.
 */
export function midiBytes(
    midi: number, head: string | undefined, drums: boolean, status: number, velocity: number,
): number[] | null {
    if (!drums) return [status, Math.max(0, Math.min(127, midi)), velocity];
    const pad = padForScoreNote(midi, head);
    if (pad === undefined) return null;
    return [status | DRUM_CHANNEL, pad, velocity];
}

export interface PlaybackHandle {
    /** Stop now. `onDone` fires for this too, so a caller has one place to
     *  learn that nothing is playing any more, whoever ended it. */
    stop(): void;
}

interface PlayOptions {
    /** Quarter notes per minute. */
    bpm: number;
    target: PlaybackTarget;
    /** The score notates drum voices as pitches. */
    drums?: boolean;
    /** Semitones added to MIDI sends only; the audio sink is never transposed. */
    transpose?: number;
    onDone?: () => void;
}

/**
 * Play a timemap once, from its start. Returns a handle that stops it;
 * calling stop twice is safe.
 *
 * Notes are handed to the sink a quarter of a second ahead of the clock, not
 * all at once. Scheduling the whole exercise up front is simpler and sounds
 * identical — but then Stop cannot stop it: every note is already queued
 * inside Web Audio or the MIDI port, and releasing what is sounding does
 * nothing about what is still to come. With a lookahead, stopping means the
 * ticker stops handing notes over, and at most that quarter second is already
 * committed.
 */
const LOOKAHEAD_SEC = 0.25;
const TICK_MS = 50;

interface ScheduledEvent {
    /** Seconds from the start of the performance. */
    at: number;
    fire(audioTime: number, wallMs: number): void;
}

export function playTimemap(data: TimemapData, opts: PlayOptions): PlaybackHandle {
    const { bpm, target, drums = false, transpose = 0 } = opts;
    let stopped = false;
    let ticker: ReturnType<typeof setInterval> | null = null;
    let port: MidiPort | null = null;

    const done = () => {
        if (stopped) return;
        stopped = true;
        if (ticker) clearInterval(ticker);
        ticker = null;
        opts.onDone?.();
    };

    if (target === 'off' || data.onsets.length === 0) {
        opts.onDone?.();
        return { stop() { /* nothing started */ } };
    }
    if (target === 'audio' && !voice) {
        opts.onDone?.();
        return { stop() { /* no instrument registered */ } };
    }

    const secPerTick = 60 / bpm / TONE_PPQ;
    const events: ScheduledEvent[] = [];

    for (const onset of data.onsets) {
        for (const n of onset.notes) {
            const at = onset.tick * secPerTick;
            const dur = Math.max(0.05, (n.endTick - onset.tick) * secPerTick);
            if (target === 'audio') {
                events.push({ at, fire: audioTime => voice?.note(n.midi, dur, audioTime, PLAYBACK_VELOCITY, n.head) });
            } else {
                const on = midiBytes(n.midi + transpose, n.head, drums, NOTE_ON, MIDI_VELOCITY);
                const off = midiBytes(n.midi + transpose, n.head, drums, NOTE_OFF, 0);
                if (!on || !off) continue;
                events.push({ at, fire: (_a, wallMs) => port?.send(on, wallMs) });
                events.push({ at: at + dur, fire: (_a, wallMs) => port?.send(off, wallMs) });
            }
        }
    }
    events.sort((a, b) => a.at - b.at);

    const lead = 0.12; // time for the first tick to run and the port to open
    const startAudio = Tone.now() + lead;
    const startWall = performance.now() + lead * 1000;
    const endsAt = (events[events.length - 1]?.at ?? 0) + 0.4;
    let next = 0;

    const tick = () => {
        const elapsed = (performance.now() - startWall) / 1000;
        while (next < events.length && events[next].at <= elapsed + LOOKAHEAD_SEC) {
            const ev = events[next++];
            ev.fire(startAudio + ev.at, startWall + ev.at * 1000);
        }
        if (next >= events.length && elapsed >= endsAt) done();
    };

    if (target === 'audio') {
        ticker = setInterval(tick, TICK_MS);
        tick();
    } else {
        // The port opens asynchronously; the clock has already started, so the
        // first notes are simply handed over as soon as it is there.
        openMidiOutput(target).then(opened => {
            if (stopped) { opened?.clear(); return; }
            if (!opened) { done(); return; }
            port = opened;
            ticker = setInterval(tick, TICK_MS);
            tick();
        }).catch(err => { console.warn('[playback] MIDI output failed:', err); done(); });
    }

    return {
        stop() {
            if (stopped) return;
            if (ticker) clearInterval(ticker);
            ticker = null;
            if (target === 'audio') voice?.allOff();
            else if (port) panic(port);
            done();
        },
    };
}

/**
 * Attach a timemap to the Tone transport: notes sound where the playhead
 * reaches them. Returns a disposer that clears the schedule and silences
 * anything ringing.
 */
export function schedulePlayback(data: TimemapData, opts: {
    target: PlaybackTarget;
    drums?: boolean;
    transpose?: number;
}): () => void {
    const { target, drums = false, transpose = 0 } = opts;
    if (target === 'off' || data.onsets.length === 0) return () => undefined;

    const transport = Tone.getTransport();
    const ids: number[] = [];
    let sender: MidiPort | null = null;
    let disposed = false;

    if (target !== 'audio') {
        openMidiOutput(target)
            .then(opened => { if (disposed) opened?.clear(); else sender = opened; })
            .catch(err => console.warn('[playback] MIDI output failed:', err));
    }

    for (const onset of data.onsets) {
        const id = transport.schedule(time => {
            const spt = 60 / transport.bpm.value / TONE_PPQ;
            for (const n of onset.notes) {
                const dur = Math.max(0.05, (n.endTick - onset.tick) * spt);
                if (target === 'audio') {
                    voice?.note(n.midi, dur, time, PLAYBACK_VELOCITY, n.head);
                } else if (sender) {
                    const on = midiBytes(n.midi + transpose, n.head, drums, NOTE_ON, MIDI_VELOCITY);
                    const off = midiBytes(n.midi + transpose, n.head, drums, NOTE_OFF, 0);
                    if (!on || !off) continue;
                    // The transport callback runs inside the audio lookahead,
                    // so "now" on the wire is close enough for a note-on.
                    sender.send(on);
                    sender.send(off, performance.now() + dur * 1000);
                }
            }
        }, `${onset.tick}i`);
        ids.push(id);
    }

    return () => {
        disposed = true;
        ids.forEach(id => transport.clear(id));
        voice?.allOff();
        if (sender) panic(sender);
    };
}

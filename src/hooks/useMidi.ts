import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
    getMidiState, subscribeMidiNotes, subscribeMidiState,
    type MidiNote, type MidiState,
} from '../utils/midiInput';

export type { MidiNote, MidiState } from '../utils/midiInput';

/**
 * What MIDI input looks like right now — held notes, the last note, devices,
 * breath, sax keys — for display. One shared connection (utils/midiInput.ts).
 *
 * To react to key presses, use useMidiNotes: this is state, and React merges
 * state updates that arrive in the same frame, so two quick notes would be
 * seen as one.
 */
export function useMidi(): MidiState {
    return useSyncExternalStore(subscribeMidiState, getMidiState);
}

/**
 * Called for every note-on and note-off as it arrives, one message at a time.
 * The handlers always see the component's current props and state; reading
 * getMidiState() inside one gives the keys held at that moment, this note
 * included.
 */
export function useMidiNotes(handlers: {
    onNoteOn?: (note: MidiNote) => void;
    onNoteOff?: (note: number) => void;
}): void {
    // One subscription for the component's life, calling the handlers of its
    // latest render. Not useEffectEvent: React 19.2 never refreshes one inside
    // a memo() component (VirtualPiano and VirtualSaxo are), so a handler
    // there would see its first render forever.
    const latest = useRef(handlers);
    useLayoutEffect(() => { latest.current = handlers; });
    useEffect(() => subscribeMidiNotes({
        onNoteOn: note => latest.current.onNoteOn?.(note),
        onNoteOff: note => latest.current.onNoteOff?.(note),
    }), []);
}

import type { VerovioToolkit } from 'verovio/esm';

// Tone.js transport PPQ — all app tick math lives in this domain.
export const TONE_PPQ = 192;

export interface TimemapOnset {
    /** Transport tick (qstamp × TONE_PPQ) at which these notes start. */
    tick: number;
    /** Sounding MIDI pitches starting at this tick, with their MEI staff number
     *  (piano: staff 1 = right hand, staff 2 = left hand) and the tick where
     *  the note ends — ties merged, so a held note spans its full written length. */
    notes: Array<{ midi: number; staff: number; endTick: number }>;
}

export interface TimemapData {
    /** End of the last measure, in transport ticks. */
    totalTicks: number;
    /** Measure element id (same ids as the rendered SVG g.measure) → start tick. */
    measureTicks: Map<string, number>;
    /** Every distinct note-onset moment, sorted by tick. Tie continuations are
     *  removed — a held note appears once, at the tick where it is struck,
     *  lasting through the full tied span. */
    onsets: TimemapOnset[];
}

interface RawNote { id: string; midi: number; staff: number; }

/**
 * Extract the synchronization timeline from the currently loaded Verovio
 * document. Must be called after toolkit.loadData() — the ids in the timemap
 * only match the SVG when both come from the same loaded document.
 *
 * qstamp (quarter notes) is used rather than tstamp (ms) so the timeline is
 * tempo-independent: the user's tempo slider scales playback via the Tone
 * transport BPM without invalidating any tick here.
 */
export function extractTimemap(toolkit: VerovioToolkit, meiDoc: Document | null): TimemapData {
    // note xml:id → staff @n, read from the source MEI. Notes without an
    // enclosing staff (or when parsing failed) default to staff 1.
    const staffOfNote = new Map<string, number>();
    if (meiDoc) {
        meiDoc.querySelectorAll('staff').forEach(staffEl => {
            const n = parseInt(staffEl.getAttribute('n') ?? '1', 10) || 1;
            staffEl.querySelectorAll('note').forEach(noteEl => {
                const id = noteEl.getAttribute('xml:id');
                if (id) staffOfNote.set(id, n);
            });
        });
    }

    const events = toolkit.renderToTimemap({ includeMeasures: true });

    const measureTicks = new Map<string, number>();
    let totalTicks = 0;

    // Raw onsets keep the note ids so tie continuations can be erased below.
    const rawOnsets: Array<{ tick: number; notes: RawNote[] }> = [];
    const onsetAtTick = new Map<number, { tick: number; notes: RawNote[] }>();
    const offTickOf = new Map<string, number>();

    for (const ev of events) {
        const tick = Math.round(ev.qstamp * TONE_PPQ);
        if (tick > totalTicks) totalTicks = tick;

        if (ev.measureOn && !measureTicks.has(ev.measureOn)) {
            measureTicks.set(ev.measureOn, tick);
        }

        for (const id of ev.off ?? []) {
            if (!offTickOf.has(id)) offTickOf.set(id, tick);
        }

        if (ev.on && ev.on.length > 0) {
            const notes: RawNote[] = [];
            for (const id of ev.on) {
                // Verovio resolves the SOUNDING pitch (key signature, measure
                // accidentals) — but NOT ties: both notes of a tied pair get
                // their own `on` event (probed on Verovio 6.2).
                const v = toolkit.getMIDIValuesForElement(id);
                if (v && v.pitch > 0) {
                    notes.push({ id, midi: v.pitch, staff: staffOfNote.get(id) ?? 1 });
                }
            }
            if (notes.length > 0) {
                const entry = { tick, notes };
                rawOnsets.push(entry);
                onsetAtTick.set(tick, entry);
            }
        }
    }

    // Resolve the continuation note of a tie start the way Verovio does when
    // @endid is absent: the note that turns ON exactly when the tied note
    // turns OFF, with the same pitch on the same staff.
    const resolveContinuation = (startId: string): string | null => {
        const offTick = offTickOf.get(startId);
        if (offTick === undefined) return null;
        const startPitch = toolkit.getMIDIValuesForElement(startId)?.pitch;
        if (!startPitch) return null;
        const startStaff = staffOfNote.get(startId);
        const cont = onsetAtTick.get(offTick)?.notes.find(n =>
            n.midi === startPitch && (startStaff === undefined || n.staff === startStaff)
        );
        return cont ? cont.id : null;
    };

    // Tie edges (start note → continuation note). Continuations must not become
    // pause points / expected re-strikes: the player holds the note, they don't
    // press it again — and the struck note's span extends through the tie.
    const tieNext = new Map<string, string>();
    const tieContinuations = new Set<string>();
    if (meiDoc) {
        meiDoc.querySelectorAll('tie').forEach(tieEl => {
            // Missing attributes read as null in browsers but "" in some DOM
            // implementations — treat both as absent.
            const startId = (tieEl.getAttribute('startid') || '').replace(/^#/, '');
            const rawEndId = (tieEl.getAttribute('endid') || '').replace(/^#/, '');
            const endId = rawEndId || (startId ? resolveContinuation(startId) : null);
            if (!endId) return;
            tieContinuations.add(endId);
            if (startId) tieNext.set(startId, endId);
        });

        // Attribute-encoded ties: @tie "i" (initial) and "m" (medial) start a
        // tie; "m" and "t" (terminal) are themselves continuations.
        meiDoc.querySelectorAll('note[tie]').forEach(noteEl => {
            const tie = noteEl.getAttribute('tie') ?? '';
            const id = noteEl.getAttribute('xml:id');
            if (!id) return;
            if (tie.includes('m') || tie.includes('t')) tieContinuations.add(id);
            if (tie.includes('i') || tie.includes('m')) {
                const contId = resolveContinuation(id);
                if (contId) {
                    tieContinuations.add(contId);
                    tieNext.set(id, contId);
                }
            }
        });
    }

    // A note's end is the off-tick of the LAST link in its tie chain.
    const endTickOf = (id: string): number => {
        let end = offTickOf.get(id) ?? 0;
        const visited = new Set<string>([id]);
        let cur = id;
        while (tieNext.has(cur)) {
            cur = tieNext.get(cur)!;
            if (visited.has(cur)) break; // malformed cycle guard
            visited.add(cur);
            end = offTickOf.get(cur) ?? end;
        }
        return end;
    };

    const onsets: TimemapOnset[] = [];
    for (const raw of rawOnsets) {
        const notes = raw.notes
            .filter(n => !tieContinuations.has(n.id))
            .map(n => ({
                midi: n.midi,
                staff: n.staff,
                endTick: Math.max(endTickOf(n.id), raw.tick + 1),
            }));
        // An onset that only contained tie continuations disappears entirely —
        // nothing new is struck there.
        if (notes.length > 0) onsets.push({ tick: raw.tick, notes });
    }

    return { totalTicks, measureTicks, onsets };
}

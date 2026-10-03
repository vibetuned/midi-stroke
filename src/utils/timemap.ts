import type { VerovioToolkit } from 'verovio/esm';
import { readTempoMap, type TempoMap } from './tempo';

// Tone.js transport PPQ — all app tick math lives in this domain.
export const TONE_PPQ = 192;

export interface TimemapOnset {
    /** Transport tick (qstamp × TONE_PPQ) at which these notes start. */
    tick: number;
    /** Sounding MIDI pitches starting at this tick, with their MEI staff number
     *  (piano: staff 1 = right hand, staff 2 = left hand) and the tick where
     *  the note ends — ties merged, so a held note spans its full written length.
     *  `head` carries @head.shape when the source MEI was supplied: drum voices
     *  share staff positions (snare and rim shot are both c5), so the notehead
     *  is the only thing that tells them apart; `fill` (@head.fill) tells a
     *  tambourine from a cowbell. `vel` is the note's @vel, when the score
     *  gives its dynamics note by note (the grooves do: utils/grooveMidi.ts). */
    notes: Array<{ midi: number; staff: number; endTick: number; head?: string; fill?: string; vel?: number; id?: string }>;
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
    /** The tempo the score itself states (utils/tempo.ts), read when the
     *  source MEI is supplied. `initial` is null when it states none. */
    tempo?: TempoMap;
    /** The score's first meter, when the source MEI is supplied and states one. */
    meter?: { count: number; unit: number };
}

interface RawNote { id: string; midi: number; staff: number; head?: string; fill?: string; vel?: number }

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
    const headOfNote = new Map<string, string>();
    const fillOfNote = new Map<string, string>();
    const velOfNote = new Map<string, number>();
    let meter: { count: number; unit: number } | undefined;
    if (meiDoc) {
        const sig = meiDoc.getElementsByTagName('meterSig').item(0);
        const def = meiDoc.getElementsByTagName('scoreDef').item(0);
        const count = Number(sig?.getAttribute('count') || def?.getAttribute('meter.count') || NaN);
        const unit = Number(sig?.getAttribute('unit') || def?.getAttribute('meter.unit') || NaN);
        if (count > 0 && unit > 0) meter = { count, unit };
        // DOM Level 2 only (as in utils/mei.ts), so this also runs on xmldom
        // in the node checks, not just the browser's DOMParser.
        const staffs = meiDoc.getElementsByTagName('staff');
        for (let i = 0; i < staffs.length; i++) {
            const staffEl = staffs.item(i)!;
            const n = parseInt(staffEl.getAttribute('n') ?? '1', 10) || 1;
            const notes = staffEl.getElementsByTagName('note');
            for (let j = 0; j < notes.length; j++) {
                const noteEl = notes.item(j)!;
                const id = noteEl.getAttribute('xml:id');
                if (!id) continue;
                staffOfNote.set(id, n);
                const head = noteEl.getAttribute('head.shape');
                if (head) headOfNote.set(id, head);
                const fill = noteEl.getAttribute('head.fill');
                if (fill) fillOfNote.set(id, fill);
                const vel = Number(noteEl.getAttribute('vel') || NaN);
                if (vel > 0) velOfNote.set(id, vel);
            }
        }
    }

    const events = toolkit.renderToTimemap({ includeMeasures: true });

    const measureTicks = new Map<string, number>();
    let totalTicks = 0;

    // Raw onsets keep the note ids so tie continuations can be erased below.
    const rawOnsets: Array<{ tick: number; notes: RawNote[] }> = [];
    const onsetAtTick = new Map<number, { tick: number; notes: RawNote[] }>();
    const offTickOf = new Map<string, number>();
    const onTickOf = new Map<string, number>();

    for (const ev of events) {
        const tick = Math.round(ev.qstamp * TONE_PPQ);
        if (tick > totalTicks) totalTicks = tick;

        if (ev.measureOn && !measureTicks.has(ev.measureOn)) {
            measureTicks.set(ev.measureOn, tick);
        }

        for (const id of ev.off ?? []) {
            if (!offTickOf.has(id)) offTickOf.set(id, tick);
        }
        for (const id of ev.on ?? []) {
            if (!onTickOf.has(id)) onTickOf.set(id, tick);
        }

        if (ev.on && ev.on.length > 0) {
            const notes: RawNote[] = [];
            for (const id of ev.on) {
                // Verovio resolves the SOUNDING pitch (key signature, measure
                // accidentals) — but NOT ties: both notes of a tied pair get
                // their own `on` event (probed on Verovio 6.2).
                const v = toolkit.getMIDIValuesForElement(id);
                if (v && v.pitch > 0) {
                    notes.push({
                        id, midi: v.pitch, staff: staffOfNote.get(id) ?? 1,
                        head: headOfNote.get(id), fill: fillOfNote.get(id), vel: velOfNote.get(id),
                    });
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

    // The note of a pitch that turns on at a tick, on a staff.
    const noteAt = (tick: number, staff: number | undefined, pitch: number | undefined): string | null => {
        if (!pitch) return null;
        const n = onsetAtTick.get(tick)?.notes.find(x => x.midi === pitch && (staff === undefined || x.staff === staff));
        return n ? n.id : null;
    };

    // Where a control event's @tstamp (or, `end`, its @tstamp2 "2m+1.5") falls,
    // in ticks: beats of the meter's unit from its measure's start, as many
    // measures on as it says. Measures are matched to the timemap's by id, or
    // in order.
    const measureList = meiDoc?.getElementsByTagName('measure');
    const measureEls = measureList ? Array.from({ length: measureList.length }, (_, i) => measureList.item(i)!) : [];
    const unitOfMeasure = new Map<Element, number>();
    if (meiDoc) {
        let unit = 4;
        const everything = meiDoc.getElementsByTagName('*');
        for (let i = 0; i < everything.length; i++) {
            const el = everything.item(i)!;
            const u = Number(el.nodeName === 'meterSig' ? el.getAttribute('unit') : el.getAttribute('meter.unit'));
            if (u > 0) unit = u;
            if (el.nodeName === 'measure') unitOfMeasure.set(el, unit);
        }
    }
    const measureStarts = [...measureTicks.entries()].filter(([id]) => !/-rend\d+$/.test(id)).map(([, t]) => t);
    const tickOfTstamp = (el: Element, value: string, end: boolean): number | null => {
        let m: Node | null = el.parentNode;
        while (m && m.nodeName !== 'measure') m = m.parentNode;
        const index = m ? measureEls.indexOf(m as Element) : -1;
        if (index < 0) return null;
        const match = end ? /^(?:(\d+)m\+)?([\d.]+)$/.exec(value.trim()) : /^()([\d.]+)$/.exec(value.trim());
        if (!match) return null;
        const at = index + (Number(match[1]) || 0);
        const measure = measureEls[at];
        const id = measure?.getAttribute('xml:id');
        const start = (id ? measureTicks.get(id) : undefined) ?? measureStarts[at];
        if (start === undefined) return null;
        return Math.round(start + (Number(match[2]) - 1) * TONE_PPQ * 4 / (unitOfMeasure.get(measure) ?? 4));
    };

    // Tie edges (start note → continuation note). Continuations must not become
    // pause points / expected re-strikes: the player holds the note, they don't
    // press it again — and the struck note's span extends through the tie.
    //
    // A tie joins a note to the one of the same pitch that starts as it ends;
    // one that claims anything else (a reference to another time through a
    // repeat, say) joins nothing, so a note is never held backwards in time.
    // A tie may be written between notes, between chords (every note of the
    // chord tied to its own pitch in the next), as @tie on a note or a chord,
    // or by beat (@tstamp, @tstamp2) instead of by note.
    const tieNext = new Map<string, string>();
    const tieContinuations = new Set<string>();
    const link = (startId: string, endId: string) => {
        const off = offTickOf.get(startId), on = onTickOf.get(endId);
        if (off === undefined || on === undefined || Math.abs(off - on) > 1) return;
        tieContinuations.add(endId);
        tieNext.set(startId, endId);
    };
    if (meiDoc) {
        // A tie's end, or start, may be a chord: its notes, each by its pitch.
        const chordNotes = new Map<string, string[]>();
        const chordEls = meiDoc.getElementsByTagName('chord');
        for (let i = 0; i < chordEls.length; i++) {
            const c = chordEls.item(i)!;
            const ids: string[] = [];
            const inner = c.getElementsByTagName('note');
            for (let j = 0; j < inner.length; j++) { const id = inner.item(j)!.getAttribute('xml:id'); if (id) ids.push(id); }
            const cid = c.getAttribute('xml:id');
            if (cid) chordNotes.set(cid, ids);
        }
        const notesOf = (id: string) => chordNotes.get(id) ?? [id];
        const pitchOf = (id: string) => toolkit.getMIDIValuesForElement(id)?.pitch;
        const linkPairs = (starts: string[], ends: string[]) => {
            for (const s of starts) {
                const p = pitchOf(s);
                const e = ends.length === 1 && starts.length === 1 ? ends[0] : ends.find(x => pitchOf(x) === p);
                if (e) link(s, e);
            }
        };

        const tieEls = meiDoc.getElementsByTagName('tie');
        for (let i = 0; i < tieEls.length; i++) {
            const tieEl = tieEls.item(i)!;
            // Missing attributes read as null in browsers but "" in some DOM
            // implementations — treat both as absent.
            const startId = (tieEl.getAttribute('startid') || '').replace(/^#/, '');
            const endId = (tieEl.getAttribute('endid') || '').replace(/^#/, '');
            if (startId) {
                const starts = notesOf(startId);
                if (endId) { linkPairs(starts, notesOf(endId)); continue; }
                const tstamp2 = tieEl.getAttribute('tstamp2') || '';
                const endTick = tstamp2 ? tickOfTstamp(tieEl, tstamp2, true) : null;
                for (const s of starts) {
                    const e = endTick === null ? resolveContinuation(s) : noteAt(endTick, staffOfNote.get(s), pitchOf(s));
                    if (e) link(s, e);
                }
                continue;
            }
            // By beat: the notes on the tie's staff at @tstamp, held to the same pitches at @tstamp2.
            const tstamp = tieEl.getAttribute('tstamp') || '';
            if (!tstamp) continue;
            const startTick = tickOfTstamp(tieEl, tstamp, false);
            if (startTick === null) continue;
            const staff = parseInt((tieEl.getAttribute('staff') || '1').split(/\s+/)[0], 10) || 1;
            const tstamp2 = tieEl.getAttribute('tstamp2') || '';
            const endTick = tstamp2 ? tickOfTstamp(tieEl, tstamp2, true) : null;
            for (const n of onsetAtTick.get(startTick)?.notes.filter(n => n.staff === staff) ?? []) {
                const e = endTick === null ? resolveContinuation(n.id) : noteAt(endTick, staff, n.midi);
                if (e) link(n.id, e);
            }
        }

        // Attribute-encoded ties: @tie "i" (initial) and "m" (medial) start a
        // tie; "m" and "t" (terminal) are themselves continuations. On a
        // chord, @tie is every one of its notes'.
        const tieOf = (noteEl: Element): string => {
            if (noteEl.hasAttribute('tie')) return noteEl.getAttribute('tie') ?? '';
            const parent = noteEl.parentNode as Element | null;
            return parent && parent.nodeName === 'chord' ? parent.getAttribute('tie') ?? '' : '';
        };
        const noteEls = meiDoc.getElementsByTagName('note');
        for (let i = 0; i < noteEls.length; i++) {
            const noteEl = noteEls.item(i)!;
            const tie = tieOf(noteEl);
            if (!tie) continue;
            const id = noteEl.getAttribute('xml:id');
            if (!id) continue;
            if (tie.includes('m') || tie.includes('t')) tieContinuations.add(id);
            if (tie.includes('i') || tie.includes('m')) {
                const contId = resolveContinuation(id);
                if (contId) link(id, contId);
            }
        }
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
                head: n.head,
                ...(n.fill ? { fill: n.fill } : {}),
                ...(n.vel ? { vel: n.vel } : {}),
                // Verovio's id for the note — the same id its SVG element
                // carries, so a note can be found on the rendered page.
                id: n.id,
            }));
        // An onset that only contained tie continuations disappears entirely —
        // nothing new is struck there.
        if (notes.length > 0) onsets.push({ tick: raw.tick, notes });
    }

    // Where the score's tempo marks fall: Verovio has resolved every measure
    // start and note onset for this exact document, so use its positions.
    let tempo: TempoMap | undefined;
    if (meiDoc) {
        const noteTicks = new Map<string, number>();
        for (const raw of rawOnsets) for (const n of raw.notes) noteTicks.set(n.id, raw.tick);
        tempo = readTempoMap(meiDoc, measureTicks, noteTicks);
    }

    return { totalTicks, measureTicks, onsets, tempo, ...(meter ? { meter } : {}) };
}

/**
 * MusicXML helpers for the theory course exercises.
 *
 * An exercise is a worksheet/answer MusicXML pair produced by the same
 * generator: same measures, same rhythm. The worksheet leaves gaps — either
 * whole-measure rests or chords with only some voices given — and the answer
 * fills them. A "slot" is one chord-event the student must complete.
 *
 * Rendering works from the answer's rhythm skeleton: given pitches stay
 * fixed, student pitches are spliced in (colored), unfilled slots become
 * rests. Direction words ("IV", "?", …) always come from the worksheet so
 * answer-side annotations don't leak the solution before reveal.
 */

export interface NoteSpec {
    step: string;   // C D E F G A B
    alter: number;  // -2..2
    octave: number;
    midi: number;
}

export interface ExerciseSlot {
    index: number;        // position in ParsedExercise.slots
    measureIndex: number; // 0-based measure position in the part
    eventIndex: number;   // 0-based chord-event position within the measure
    given: NoteSpec[];    // pitches the worksheet already provides
    answer: NoteSpec[];   // the full solution chord (given ⊆ answer)
}

export interface ParsedExercise {
    worksheetDoc: Document;
    answerDoc: Document;
    slots: ExerciseSlot[];
    fifths: number;
    minMidi: number;
    maxMidi: number;
    measureCount: number;
}

export type SlotStatus = 'correct' | 'wrong';

export interface RenderColors {
    entered: string;
    correct: string;
    wrong: string;
    reveal: string;
    placeholder: string;
    selected: string;
}

const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_SPELLINGS: Array<[string, number]> = [
    ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
    ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];
const FLAT_SPELLINGS: Array<[string, number]> = [
    ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0],
    ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
];
const SHARP_ORDER = 'FCGDAEB';
const FLAT_ORDER = 'BEADGCF';
const ACCIDENTAL_NAMES: Record<number, string> = {
    [-2]: 'flat-flat', [-1]: 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp',
};

export function midiFromParts(step: string, alter: number, octave: number): number {
    return (octave + 1) * 12 + STEP_PC[step] + alter;
}

/** Spell a MIDI number using sharps in sharp keys, flats in flat keys. */
export function spellMidi(midi: number, fifths: number): NoteSpec {
    const table = fifths < 0 ? FLAT_SPELLINGS : SHARP_SPELLINGS;
    const [step, alter] = table[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    return { step, alter, octave, midi };
}

/** The alteration the key signature applies to a step (e.g. F -> +1 in G major). */
export function keyAlter(step: string, fifths: number): number {
    if (fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(step)) return 1;
    if (fifths < 0 && FLAT_ORDER.slice(0, -fifths).includes(step)) return -1;
    return 0;
}

function childElements(parent: Element, tag: string): Element[] {
    return Array.from(parent.children).filter(el => el.tagName === tag);
}

function noteSpec(noteEl: Element): NoteSpec | null {
    const pitch = noteEl.getElementsByTagName('pitch')[0];
    if (!pitch) return null; // rest
    const step = pitch.getElementsByTagName('step')[0]?.textContent ?? 'C';
    const alter = parseInt(pitch.getElementsByTagName('alter')[0]?.textContent ?? '0', 10) || 0;
    const octave = parseInt(pitch.getElementsByTagName('octave')[0]?.textContent ?? '4', 10);
    return { step, alter, octave, midi: midiFromParts(step, alter, octave) };
}

function isRestNote(noteEl: Element): boolean {
    return noteEl.getElementsByTagName('rest').length > 0;
}

/** Group a measure's direct-child <note> elements into chord events. */
function measureEvents(measure: Element): Element[][] {
    const events: Element[][] = [];
    for (const note of childElements(measure, 'note')) {
        if (note.getElementsByTagName('chord').length > 0 && events.length > 0) {
            events[events.length - 1].push(note);
        } else {
            events.push([note]);
        }
    }
    return events;
}

function partMeasures(doc: Document): Element[] {
    const part = doc.getElementsByTagName('part')[0];
    return part ? childElements(part, 'measure') : [];
}

export function parseExercise(worksheetXml: string, answerXml: string): ParsedExercise {
    const parser = new DOMParser();
    const worksheetDoc = parser.parseFromString(worksheetXml, 'text/xml');
    const answerDoc = parser.parseFromString(answerXml, 'text/xml');

    const wMeasures = partMeasures(worksheetDoc);
    const aMeasures = partMeasures(answerDoc);
    if (wMeasures.length === 0 || wMeasures.length !== aMeasures.length) {
        throw new Error(`Worksheet/answer measure mismatch (${wMeasures.length} vs ${aMeasures.length})`);
    }

    const fifthsEl = answerDoc.getElementsByTagName('fifths')[0];
    const fifths = parseInt(fifthsEl?.textContent ?? '0', 10) || 0;

    const slots: ExerciseSlot[] = [];
    let minMidi = 127, maxMidi = 0;

    aMeasures.forEach((aMeasure, measureIndex) => {
        const aEvents = measureEvents(aMeasure);
        const wEvents = measureEvents(wMeasures[measureIndex]);
        const worksheetIsRest = wEvents.some(ev => ev.some(isRestNote));

        aEvents.forEach((aEvent, eventIndex) => {
            const answer = aEvent.map(noteSpec).filter((s): s is NoteSpec => s !== null);
            answer.forEach(s => { minMidi = Math.min(minMidi, s.midi); maxMidi = Math.max(maxMidi, s.midi); });

            const given = worksheetIsRest || wEvents.length !== aEvents.length
                ? []
                : wEvents[eventIndex].map(noteSpec).filter((s): s is NoteSpec => s !== null);

            if (given.length < answer.length) {
                slots.push({ index: slots.length, measureIndex, eventIndex, given, answer });
            }
        });
    });

    return { worksheetDoc, answerDoc, slots, fifths, minMidi, maxMidi, measureCount: aMeasures.length };
}

/** Spell an entered MIDI number, borrowing the answer's spelling when it matches. */
function spellEntered(midi: number, slot: ExerciseSlot, fifths: number): NoteSpec {
    const givenMidis = new Set(slot.given.map(g => g.midi));
    const match = slot.answer.find(a => a.midi === midi && !givenMidis.has(a.midi));
    return match ?? spellMidi(midi, fifths);
}

function makeNoteEl(
    doc: Document,
    spec: NoteSpec | null,
    proto: { duration: string; type: string | null; wholeMeasure: boolean },
    opts: { chord?: boolean; color?: string; fifths: number },
): Element {
    const note = doc.createElement('note');
    if (opts.color) note.setAttribute('color', opts.color);
    if (spec) {
        if (opts.chord) note.appendChild(doc.createElement('chord'));
        const pitch = doc.createElement('pitch');
        const step = doc.createElement('step');
        step.textContent = spec.step;
        pitch.appendChild(step);
        if (spec.alter !== 0) {
            const alter = doc.createElement('alter');
            alter.textContent = String(spec.alter);
            pitch.appendChild(alter);
        }
        const octave = doc.createElement('octave');
        octave.textContent = String(spec.octave);
        pitch.appendChild(octave);
        note.appendChild(pitch);
    } else {
        const rest = doc.createElement('rest');
        if (proto.wholeMeasure) rest.setAttribute('measure', 'yes');
        note.appendChild(rest);
    }
    const duration = doc.createElement('duration');
    duration.textContent = proto.duration;
    note.appendChild(duration);
    if (spec && proto.type) {
        const type = doc.createElement('type');
        type.textContent = proto.type;
        note.appendChild(type);
    }
    if (spec && spec.alter !== keyAlter(spec.step, opts.fifths)) {
        const accidental = doc.createElement('accidental');
        accidental.textContent = ACCIDENTAL_NAMES[spec.alter] ?? 'natural';
        note.appendChild(accidental);
    }
    return note;
}

export interface RenderOptions {
    entries: Map<number, number[]>;          // slot index -> entered MIDI numbers
    statuses?: Map<number, SlotStatus> | null;
    revealed?: boolean;
    selectedSlot?: number | null;
    colors: RenderColors;
}

/**
 * Build the MusicXML to render: the answer's skeleton with slot events
 * replaced by given + entered pitches (or placeholder rests), and the
 * worksheet's direction words restored.
 */
export function buildRenderXml(parsed: ParsedExercise, options: RenderOptions): string {
    const { entries, statuses, revealed, selectedSlot, colors } = options;
    const doc = parsed.answerDoc.cloneNode(true) as Document;
    const measures = partMeasures(doc);
    const wMeasures = partMeasures(parsed.worksheetDoc);

    const slotAt = new Map<string, ExerciseSlot>();
    parsed.slots.forEach(s => slotAt.set(`${s.measureIndex}:${s.eventIndex}`, s));

    measures.forEach((measure, measureIndex) => {
        // Unless revealing the model solution, direction words come from the
        // worksheet ("?" placeholders instead of the answer's roman numerals).
        if (!revealed) {
            const cloneWords = measure.getElementsByTagName('words');
            const worksheetWords = wMeasures[measureIndex].getElementsByTagName('words');
            const n = Math.min(cloneWords.length, worksheetWords.length);
            for (let i = 0; i < n; i++) cloneWords[i].textContent = worksheetWords[i].textContent;
        }

        const events = measureEvents(measure);
        events.forEach((event, eventIndex) => {
            const slot = slotAt.get(`${measureIndex}:${eventIndex}`);
            if (!slot) return;

            const proto = {
                duration: event[0].getElementsByTagName('duration')[0]?.textContent ?? '1',
                type: event[0].getElementsByTagName('type')[0]?.textContent ?? null,
                wholeMeasure: events.length === 1,
            };

            const status = statuses?.get(slot.index);
            const enteredColor = status === 'correct' ? colors.correct
                : status === 'wrong' ? colors.wrong
                : colors.entered;

            const rendered: Array<{ spec: NoteSpec; color?: string }> =
                slot.given.map(spec => ({ spec }));
            if (revealed) {
                const givenMidis = new Set(slot.given.map(g => g.midi));
                slot.answer
                    .filter(a => !givenMidis.has(a.midi))
                    .forEach(spec => rendered.push({ spec, color: colors.reveal }));
            } else {
                (entries.get(slot.index) ?? []).forEach(midi =>
                    rendered.push({ spec: spellEntered(midi, slot, parsed.fifths), color: enteredColor }));
            }
            rendered.sort((a, b) => a.spec.midi - b.spec.midi);

            const anchor = event[event.length - 1].nextSibling;
            event.forEach(n => measure.removeChild(n));

            const newNotes: Element[] = rendered.length > 0
                ? rendered.map((r, i) => makeNoteEl(doc, r.spec, proto,
                    { chord: i > 0, color: r.color, fifths: parsed.fifths }))
                : [makeNoteEl(doc, null, proto, {
                    // an empty slot flagged wrong by a check shows a red rest
                    color: status === 'wrong' ? colors.wrong
                        : slot.index === selectedSlot ? colors.selected : colors.placeholder,
                    fifths: parsed.fifths,
                })];
            newNotes.forEach(n => measure.insertBefore(n, anchor));
        });
    });

    return new XMLSerializer().serializeToString(doc);
}

function sameMidiSets(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}

/** Compare entered+given pitches against the answer, slot by slot (enharmonic-tolerant). */
export function checkEntries(parsed: ParsedExercise, entries: Map<number, number[]>): Map<number, SlotStatus> {
    const statuses = new Map<number, SlotStatus>();
    for (const slot of parsed.slots) {
        const played = new Set([...slot.given.map(g => g.midi), ...(entries.get(slot.index) ?? [])]);
        const expected = new Set(slot.answer.map(a => a.midi));
        statuses.set(slot.index, sameMidiSets(played, expected) ? 'correct' : 'wrong');
    }
    return statuses;
}

/** How many more pitches the slot still needs. */
export function slotRemaining(slot: ExerciseSlot, entries: Map<number, number[]>): number {
    return slot.answer.length - slot.given.length - (entries.get(slot.index)?.length ?? 0);
}

/** All chord events in score order (given + entered pitches) — for playback. */
export function playbackEvents(parsed: ParsedExercise, entries: Map<number, number[]>): number[][] {
    const slotAt = new Map<string, ExerciseSlot>();
    parsed.slots.forEach(s => slotAt.set(`${s.measureIndex}:${s.eventIndex}`, s));
    const out: number[][] = [];
    partMeasures(parsed.answerDoc).forEach((measure, measureIndex) => {
        measureEvents(measure).forEach((event, eventIndex) => {
            const slot = slotAt.get(`${measureIndex}:${eventIndex}`);
            if (slot) {
                out.push([...slot.given.map(g => g.midi), ...(entries.get(slot.index) ?? [])]);
            } else {
                out.push(event.map(noteSpec).filter((s): s is NoteSpec => s !== null).map(s => s.midi));
            }
        });
    });
    return out;
}

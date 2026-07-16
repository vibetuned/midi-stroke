import { useState, useEffect, useMemo, useCallback } from 'react';
import type { VerovioToolkit } from 'verovio/esm';
import { useGame } from '../../context/GameContext';
import { type Course, type CourseModule, type CourseExercise, exerciseFileUrl } from '../../utils/course';
import {
    parseExercise, buildRenderXml, checkEntries, slotRemaining, playbackEvents,
    type ParsedExercise, type SlotStatus,
} from '../../utils/musicxml';

// Score colors: entered notes use the theory accent; given worksheet notes
// stay black like regular engraving.
export const THEORY_COLORS = {
    entered: '#2fae76',
    correct: '#22a55c',
    wrong: '#e0505e',
    reveal: '#b8860b',
    placeholder: '#9898ac',
    selected: '#2fae76',
};

/** Glow colors on the virtual piano for the selected slot's pitches. */
const PIANO_GIVEN = '#51A0CF';

const VEROVIO_OPTIONS = {
    breaks: 'none',
    adjustPageWidth: true,
    adjustPageHeight: true,
    svgViewBox: true,
    header: 'none',
    footer: 'none',
    scale: 55,
    pageMarginLeft: 50,
    pageMarginRight: 50,
    pageMarginTop: 10,
    pageMarginBottom: 10,
    // widest allowed — keeps the per-measure prompt words from colliding
    measureMinWidth: 30,
};

/**
 * Verovio renders <dir> words at 405 internal units — over two staff heights,
 * so the exercise prompts ("its overtone (fifth up)") dwarf the music and
 * collide. There is no toolkit option for dir text size; rescale in the SVG.
 */
function shrinkDirectionText(svg: string): string {
    return svg.replaceAll('font-size="405px"', 'font-size="210px"');
}

/**
 * Owns the full state of one exercise attempt: fetch + parse the
 * worksheet/answer pair, track entered pitches per slot, selection,
 * check/reveal, and produce the rendered SVG. Note input can come from the
 * virtual piano, the circle of fifths, or a MIDI keyboard — they all call
 * noteInput().
 *
 * The consuming component must be keyed by exercise id: all attempt state
 * lives in initial values and resets by remounting, not inside the effect.
 */
export function useTheoryExercise(
    toolkit: VerovioToolkit | null,
    course: Course,
    module: CourseModule,
    exercise: CourseExercise,
    onCompleted?: (exerciseId: string) => void,
) {
    const { setPianoRange } = useGame();
    const [parsed, setParsed] = useState<ParsedExercise | null>(null);
    const [entries, setEntries] = useState<Map<number, number[]>>(new Map());
    const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
    const [statuses, setStatuses] = useState<Map<number, SlotStatus> | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [completed, setCompleted] = useState(false);

    // Fetch + parse once per mount (the consumer remounts per exercise)
    useEffect(() => {
        let cancelled = false;

        Promise.all([
            fetch(exerciseFileUrl(course, module, exercise, 'worksheet.musicxml')).then(r => {
                if (!r.ok) throw new Error(`worksheet: HTTP ${r.status}`);
                return r.text();
            }),
            fetch(exerciseFileUrl(course, module, exercise, 'answer.musicxml')).then(r => {
                if (!r.ok) throw new Error(`answer: HTTP ${r.status}`);
                return r.text();
            }),
        ]).then(([worksheetXml, answerXml]) => {
            if (cancelled) return;
            const p = parseExercise(worksheetXml, answerXml);
            setParsed(p);
            setSelectedSlot(p.slots.length > 0 ? 0 : null);
            setLoading(false);

            // Size the virtual piano to the exercise: octave-aligned, ≥3 octaves.
            let min = Math.floor(Math.min(p.minMidi - 2, 55) / 12) * 12;
            let max = Math.floor(Math.max(p.maxMidi + 2, 74) / 12) * 12 + 11;
            while (max - min < 35) { min -= 12; max += 12; }
            setPianoRange({ min, max });
        }).catch(err => {
            if (cancelled) return;
            console.error('Failed to load exercise:', err);
            setError(String(err?.message ?? err));
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, [course, module, exercise, setPianoRange]);

    const svg = useMemo(() => {
        if (!toolkit || !parsed) return null;
        try {
            const xml = buildRenderXml(parsed, {
                entries, statuses, revealed, selectedSlot, colors: THEORY_COLORS,
            });
            toolkit.setOptions(VEROVIO_OPTIONS);
            toolkit.loadData(xml);
            return shrinkDirectionText(toolkit.renderToSVG(1, {}));
        } catch (err) {
            console.error('Failed to render exercise:', err);
            return null;
        }
    }, [toolkit, parsed, entries, statuses, revealed, selectedSlot]);

    const findNextUnfilled = useCallback((p: ParsedExercise, ent: Map<number, number[]>, after: number): number | null => {
        for (let step = 1; step <= p.slots.length; step++) {
            const i = (after + step) % p.slots.length;
            if (slotRemaining(p.slots[i], ent) > 0) return i;
        }
        return null;
    }, []);

    /**
     * Toggle a pitch, routing it to the right slot within the selected
     * measure — on a grand staff each beat has a treble and a bass slot.
     * Priority: the slot already holding the pitch (toggle off), then the
     * slot whose missing answer pitches contain it, then the slot on the
     * register-matching staff (below middle C → bass), then the selection.
     * Auto-advances when the routed slot's chord is full.
     */
    const noteInput = useCallback((midi: number) => {
        if (!parsed || revealed || selectedSlot === null) return;
        const selected = parsed.slots[selectedSlot];
        const measureSlots = parsed.slots.filter(s => s.measureIndex === selected.measureIndex);
        const playedIn = (s: typeof selected) =>
            new Set([...s.given.map(g => g.midi), ...(entries.get(s.index) ?? [])]);

        let slot = measureSlots.find(s => (entries.get(s.index) ?? []).includes(midi))
            ?? measureSlots.find(s => s.answer.some(a => a.midi === midi) && !playedIn(s).has(midi));
        if (!slot && selected.staff) {
            const wantStaff = midi < 60 ? '2' : '1';
            if (selected.staff !== wantStaff) {
                slot = measureSlots.find(s => s.staff === wantStaff && slotRemaining(s, entries) > 0)
                    ?? measureSlots.find(s => s.staff === wantStaff);
            }
        }
        if (!slot) slot = selected;

        const current = entries.get(slot.index) ?? [];
        const capacity = slot.answer.length - slot.given.length;

        let next: number[];
        if (current.includes(midi)) {
            next = current.filter(m => m !== midi);
        } else if (slot.given.some(g => g.midi === midi)) {
            return; // pitch already provided by the worksheet
        } else if (current.length >= capacity) {
            next = [...current.slice(0, capacity - 1), midi]; // replace the last entry
        } else {
            next = [...current, midi];
        }

        const nextEntries = new Map(entries);
        nextEntries.set(slot.index, next);
        setEntries(nextEntries);
        setCompleted(false);
        if (statuses?.has(slot.index)) {
            const cleaned = new Map(statuses);
            cleaned.delete(slot.index);
            setStatuses(cleaned.size > 0 ? cleaned : null);
        }
        if (next.length === capacity) {
            // Finish the measure's other slots (the sibling staff) first;
            // only a fully completed measure advances the selection.
            const siblingUnfilled = measureSlots.find(s => slotRemaining(s, nextEntries) > 0);
            if (siblingUnfilled) {
                setSelectedSlot(siblingUnfilled.index);
            } else {
                const nextIdx = findNextUnfilled(parsed, nextEntries, slot.index);
                setSelectedSlot(nextIdx !== null ? nextIdx : slot.index);
            }
        } else {
            setSelectedSlot(slot.index);
        }
    }, [parsed, revealed, selectedSlot, entries, statuses, findNextUnfilled]);

    /** Click on a measure: select its first unfilled slot, cycling on repeat clicks. */
    const selectMeasure = useCallback((measureIndex: number) => {
        if (!parsed) return;
        const inMeasure = parsed.slots.filter(s => s.measureIndex === measureIndex);
        if (inMeasure.length === 0) return;
        const currentPos = inMeasure.findIndex(s => s.index === selectedSlot);
        if (currentPos >= 0) {
            setSelectedSlot(inMeasure[(currentPos + 1) % inMeasure.length].index);
        } else {
            const unfilled = inMeasure.find(s => slotRemaining(s, entries) > 0);
            setSelectedSlot((unfilled ?? inMeasure[0]).index);
        }
    }, [parsed, selectedSlot, entries]);

    const check = useCallback(() => {
        if (!parsed || parsed.slots.length === 0) return;
        const result = checkEntries(parsed, entries);
        setStatuses(result);
        setRevealed(false);
        const allCorrect = [...result.values()].every(s => s === 'correct');
        setCompleted(allCorrect);
        if (allCorrect) onCompleted?.(exercise.id);
    }, [parsed, entries, exercise.id, onCompleted]);

    const toggleReveal = useCallback(() => setRevealed(r => !r), []);

    /**
     * Clear the selected measure's entries. Filling a slot auto-advances the
     * selection, so right after entering a note the selected measure is
     * usually empty — in that case clear the nearest earlier measure that
     * has entries (i.e. undo what was just written).
     */
    const clearMeasure = useCallback(() => {
        if (!parsed || selectedSlot === null) return;
        const measureHasEntries = (measureIndex: number) => parsed.slots.some(
            s => s.measureIndex === measureIndex && (entries.get(s.index)?.length ?? 0) > 0);

        let target = parsed.slots[selectedSlot].measureIndex;
        while (target >= 0 && !measureHasEntries(target)) target--;
        if (target < 0) return;

        const slotIndexes = parsed.slots.filter(s => s.measureIndex === target).map(s => s.index);
        setEntries(prev => {
            const next = new Map(prev);
            slotIndexes.forEach(i => next.delete(i));
            return next;
        });
        setStatuses(null);
        setCompleted(false);
        setSelectedSlot(slotIndexes[0]);
    }, [parsed, selectedSlot, entries]);

    const clearAll = useCallback(() => {
        setEntries(new Map());
        setStatuses(null);
        setCompleted(false);
        if (parsed && parsed.slots.length > 0) setSelectedSlot(0);
    }, [parsed]);

    /** Piano-key glow for the selected slot: given pitches blue, entered green. */
    const highlightNotes = useMemo(() => {
        const map = new Map<number, string>();
        if (!parsed || selectedSlot === null || revealed) return map;
        const slot = parsed.slots[selectedSlot];
        slot.given.forEach(g => map.set(g.midi, PIANO_GIVEN));
        (entries.get(selectedSlot) ?? []).forEach(m => map.set(m, THEORY_COLORS.entered));
        return map;
    }, [parsed, selectedSlot, entries, revealed]);

    const filledSlots = useMemo(() => {
        if (!parsed) return 0;
        return parsed.slots.filter(s => slotRemaining(s, entries) === 0).length;
    }, [parsed, entries]);

    const getPlaybackEvents = useCallback((source: 'current' | 'answer' = 'current') => {
        if (!parsed) return [];
        return playbackEvents(parsed, entries, source);
    }, [parsed, entries]);

    return {
        parsed, svg, loading, error,
        entries, selectedSlot, statuses, revealed, completed,
        totalSlots: parsed?.slots.length ?? 0, filledSlots,
        noteInput, selectMeasure, check, toggleReveal, clearMeasure, clearAll,
        highlightNotes, getPlaybackEvents,
    };
}

/**
 * The score views expect the first measure of every MEI to be a "count-in":
 * a notes-free measure whose engraving (clef, key signature, time signature)
 * becomes the sticky strip pinned at the left edge, and whose quarter-rest
 * duration gives the player one beat of lead-in before the first note. The
 * generator bakes it in as <measure n="0">; imported/uploaded scores usually
 * start straight at measure 1.
 *
 * If the first measure contains any notes, prepend a count-in measure holding
 * one quarter rest per staff (same shape as the generated files — Verovio
 * sizes a measure by its content, so the timemap reports it as 192 ticks).
 * A notes-free first measure is treated as an already-present count-in and
 * none is added.
 *
 * Either way, a repeat back to the start is made to begin at the first bar
 * of music, not at the count-in (repeatFromFirstBar).
 *
 * Uses only DOM level 2 APIs so it works with any XML DOM implementation.
 * Mutates the document in place; returns true when it changed it (a
 * count-in injected, or a repeat's start set) — so it must be serialised again.
 */
/**
 * A repeat that goes back to the start of the piece goes back to its first
 * bar of music. Verovio repeats from the very first measure — the count-in —
 * so the timemap (and all playback) would sit through the count-in's rest
 * again in the middle of the piece. So when the score's first repeat sign
 * closes a repeat that nothing opened, `first` opens it: a start-repeat bar
 * line there, as many editions print it.
 */
function repeatFromFirstBar(meiDoc: Document, first: Element): boolean {
    const measures = meiDoc.getElementsByTagName('measure');
    for (let i = 0; i < measures.length; i++) {
        const m = measures.item(i)!;
        const left = m.getAttribute('left'), right = m.getAttribute('right');
        if (left === 'rptstart' || right === 'rptstart') return false;
        if (left === 'rptend' || left === 'rptboth' || right === 'rptend' || right === 'rptboth') {
            first.setAttribute('left', 'rptstart');
            return true;
        }
    }
    return false;
}

export function ensureCountInMeasure(meiDoc: Document): boolean {
    // DOMParser reports XML errors as a <parsererror> document, not a throw.
    if (meiDoc.getElementsByTagName('parsererror').length > 0) return false;

    const firstMeasure = meiDoc.getElementsByTagName('measure').item(0);
    if (!firstMeasure) return false;
    if (firstMeasure.getElementsByTagName('note').length === 0) {
        const music = meiDoc.getElementsByTagName('measure').item(1);
        return music ? repeatFromFirstBar(meiDoc, music) : false;
    }
    repeatFromFirstBar(meiDoc, firstMeasure);

    const ns = meiDoc.documentElement.namespaceURI;
    const countIn = meiDoc.createElementNS(ns, 'measure');
    countIn.setAttribute('n', '0');

    // One staff per staff of the first measure (direct children in MEI), so
    // grand-staff scores get a rest on every stave. Missing @n falls back to
    // document order, matching how Verovio numbers unlabelled staves.
    const staffEls = firstMeasure.getElementsByTagName('staff');
    const staffNumbers: string[] = [];
    for (let i = 0; i < staffEls.length; i++) {
        staffNumbers.push(staffEls.item(i)?.getAttribute('n') || String(i + 1));
    }
    if (staffNumbers.length === 0) staffNumbers.push('1');

    for (const n of staffNumbers) {
        const staff = meiDoc.createElementNS(ns, 'staff');
        staff.setAttribute('n', n);
        const layer = meiDoc.createElementNS(ns, 'layer');
        const rest = meiDoc.createElementNS(ns, 'rest');
        rest.setAttribute('dur', '4');
        layer.appendChild(rest);
        staff.appendChild(layer);
        countIn.appendChild(staff);
    }

    firstMeasure.parentNode?.insertBefore(countIn, firstMeasure);
    return true;
}

/**
 * Give every note an xml:id, so it can be matched to what Verovio renders.
 *
 * The timemap learns which staff a note is on (the hand it belongs to, the
 * staff Learn by ear isolates) by looking its id up in the source MEI. A file
 * whose notes carry no ids — hand-written, or from some converters — would
 * otherwise have every note filed under staff 1: the left hand would vanish
 * from hand selection, and the bass staff would have nothing to train on.
 * Verovio keeps ids it is given, so the ones assigned here survive into the
 * rendered page and the timemap alike.
 *
 * DOM Level 2 only, like ensureCountInMeasure. Mutates the document; returns
 * true when any id was added.
 */
export function ensureNoteIds(meiDoc: Document): boolean {
    if (meiDoc.getElementsByTagName('parsererror').length > 0) return false;
    const notes = meiDoc.getElementsByTagName('note');
    const taken = new Set<string>();
    for (let i = 0; i < notes.length; i++) {
        const id = notes.item(i)?.getAttribute('xml:id');
        if (id) taken.add(id);
    }
    let added = false;
    let counter = 0;
    for (let i = 0; i < notes.length; i++) {
        const note = notes.item(i)!;
        if (note.getAttribute('xml:id')) continue;
        let id: string;
        do { id = `ms-note-${++counter}`; } while (taken.has(id));
        taken.add(id);
        note.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:id', id);
        added = true;
    }
    return added;
}

/**
 * Every tie as Verovio draws it, and as the app holds it: from a note to the
 * one of the same pitch that comes next in its voice. Scores bring ties
 * Verovio cannot draw — a <tie> with no @endid (common from some converters),
 * a @tie="i" with no "t" after it — though the timemap holds the note all the
 * same: the page showed two notes and asked for one. And a tie can point past
 * its neighbour: one copied with its bars when repeats were written out, its
 * other end still in the first time through. So each tie's end is found, or
 * set right: the next note, or chord, in the voice (the same staff and layer,
 * across bar lines), holding that pitch.
 *
 * In memory, as the score loads (after ensureNoteIds): the score itself is not
 * changed. DOM Level 2 only. Returns true when a tie was completed.
 */
export function completeTies(meiDoc: Document): boolean {
    if (meiDoc.getElementsByTagName('parsererror').length > 0) return false;

    // Each voice's events in order — notes, chords, rests — across the measures.
    type Event = Element;
    const nextOf = new Map<Event, Event | null>();
    const prevOf = new Map<Event, Event | null>();
    const eventOf = new Map<Element, Event>();   // a note inside a chord → its chord
    const lastIn = new Map<string, Event>();
    const EVENTS = new Set(['note', 'chord', 'rest', 'mRest', 'space', 'mSpace', 'multiRest']);
    const isGrace = (el: Element) => !!el.getAttribute('grace');
    const measures = meiDoc.getElementsByTagName('measure');
    for (let m = 0; m < measures.length; m++) {
        const staves = childElements(measures.item(m)!, 'staff');
        staves.forEach((staff, si) => {
            const layers = childElements(staff, 'layer');
            layers.forEach((layer, li) => {
                const voice = `${staff.getAttribute('n') || si + 1}/${layer.getAttribute('n') || li + 1}`;
                const walk = (parent: Element) => {
                    for (const el of childElements(parent)) {
                        if (EVENTS.has(el.nodeName)) {
                            if (isGrace(el)) continue;
                            const prev = lastIn.get(voice) ?? null;
                            if (prev) nextOf.set(prev, el);
                            prevOf.set(el, prev);
                            nextOf.set(el, null);
                            lastIn.set(voice, el);
                            eventOf.set(el, el);
                            if (el.nodeName === 'chord') for (const n of childElements(el, 'note')) eventOf.set(n, el);
                        } else {
                            walk(el);   // beams, tuplets, and the like
                        }
                    }
                };
                walk(layer);
            });
        });
    }

    const byId = new Map<string, Element>();
    const all = meiDoc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) { const id = all.item(i)!.getAttribute('xml:id'); if (id) byId.set(id, all.item(i)!); }
    const pitch = (n: Element) => `${n.getAttribute('pname')}${n.getAttribute('oct')}`;
    const notesIn = (ev: Event | null | undefined): Element[] =>
        !ev ? [] : ev.nodeName === 'note' ? [ev] : ev.nodeName === 'chord' ? childElements(ev, 'note') : [];
    /** In event `ev`, the note of `note`'s pitch. */
    const samePitch = (ev: Event | null | undefined, note: Element) => notesIn(ev).find(n => pitch(n) === pitch(note)) ?? null;
    const idOf = (el: Element): string => {
        let id = el.getAttribute('xml:id');
        if (!id) {
            let k = 0;
            do { id = `ms-${el.nodeName}-${++k}`; } while (byId.has(id));
            el.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:id', id);
            byId.set(id, el);
        }
        return id;
    };
    const measureOf = (el: Element): Element | null => {
        let p: Node | null = el.parentNode;
        while (p && p.nodeName !== 'measure') p = p.parentNode;
        return p as Element | null;
    };
    /** The thing that follows `start` in its voice and holds its pitch: a note, or for a chord, the next chord. */
    const following = (start: Element): Element | null => {
        const next = nextOf.get(eventOf.get(start) ?? start);
        if (!next) return null;
        if (start.nodeName === 'chord') return next.nodeName === 'chord' ? next : null;
        return samePitch(next, start);
    };
    const preceding = (end: Element): Element | null => {
        const prev = prevOf.get(eventOf.get(end) ?? end);
        if (!prev) return null;
        if (end.nodeName === 'chord') return prev.nodeName === 'chord' ? prev : null;
        return samePitch(prev, end);
    };
    const ref = (attr: string | null, id: string) => (attr && !attr.startsWith('#') ? id : `#${id}`);

    const listOf = (name: string) => { const l = meiDoc.getElementsByTagName(name); return Array.from({ length: l.length }, (_, i) => l.item(i)!); };
    let changed = false;
    // A <tie> from a chord to a chord: one for each of its notes, so each is drawn, and held, by its pitch.
    for (const tie of listOf('tie')) {
        const start = byId.get((tie.getAttribute('startid') || '').replace(/^#/, ''));
        const end = byId.get((tie.getAttribute('endid') || '').replace(/^#/, ''));
        if (start?.nodeName !== 'chord' || end?.nodeName !== 'chord') continue;
        for (const n of childElements(start, 'note')) {
            const to = samePitch(end, n);
            if (!to) continue;
            const one = tie.cloneNode(false) as Element;
            one.removeAttribute('xml:id');
            one.setAttribute('startid', `#${idOf(n)}`);
            one.setAttribute('endid', `#${idOf(to)}`);
            tie.parentNode!.insertBefore(one, tie);
        }
        tie.parentNode!.removeChild(tie);
        changed = true;
    }
    const ties = meiDoc.getElementsByTagName('tie');
    for (let i = 0; i < ties.length; i++) {
        const tie = ties.item(i)!;
        const startAttr = tie.getAttribute('startid'), endAttr = tie.getAttribute('endid');
        const start = startAttr ? byId.get(startAttr.replace(/^#/, '')) : undefined;
        const end = endAttr ? byId.get(endAttr.replace(/^#/, '')) : undefined;
        if (!start || (start.nodeName !== 'note' && start.nodeName !== 'chord')) continue;
        if (!end) {
            if (endAttr || tie.getAttribute('tstamp2')) continue;   // an end Verovio finds by beat, or one that is gone
            const to = following(start);
            if (to) { tie.setAttribute('endid', `#${idOf(to)}`); changed = true; }
            continue;
        }
        if (following(start) === end) continue;
        // Not neighbours: trust the end in the tie's own bar, and find the other.
        const home = measureOf(tie);
        if (measureOf(start) === home || (measureOf(end) !== home && following(start))) {
            const to = following(start);
            if (to && to !== end) { tie.setAttribute('endid', ref(endAttr, idOf(to))); changed = true; }
        } else {
            const from = preceding(end);
            if (from && from !== start) { tie.setAttribute('startid', ref(startAttr, idOf(from))); changed = true; }
        }
    }

    // @tie="i" or "m" with no end marked after it: the next note of the pitch ends it.
    const marked = (el: Element) => el.getAttribute('tie') || (el.parentNode as Element | null)?.getAttribute?.('tie') || '';
    const starters = [...listOf('note'), ...listOf('chord')];
    for (const el of starters) {
        const tie = el.getAttribute('tie') ?? '';
        if (!/[im]/.test(tie)) continue;
        const to = following(el);
        if (!to) continue;
        const has = el.nodeName === 'chord' ? to.getAttribute('tie') ?? '' : marked(to);
        if (/[mt]/.test(has)) continue;
        const own = to.getAttribute('tie') ?? '';
        to.setAttribute('tie', own.includes('i') ? own.replace('i', 'm') : `${own}t`);
        changed = true;
    }
    return changed;
}

/** An element's child elements, of a name or all. */
function childElements(parent: Element, name?: string): Element[] {
    const out: Element[] = [];
    for (let c = parent.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1 && (!name || c.nodeName === name)) out.push(c as Element);
    }
    return out;
}

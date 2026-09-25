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

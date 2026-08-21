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
 * the document is left untouched.
 *
 * Uses only DOM level 2 APIs so it works with any XML DOM implementation.
 * Mutates the document in place; returns true when a measure was injected.
 */
export function ensureCountInMeasure(meiDoc: Document): boolean {
    // DOMParser reports XML errors as a <parsererror> document, not a throw.
    if (meiDoc.getElementsByTagName('parsererror').length > 0) return false;

    const firstMeasure = meiDoc.getElementsByTagName('measure').item(0);
    if (!firstMeasure) return false;
    if (firstMeasure.getElementsByTagName('note').length === 0) return false;

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

/**
 * A score's repeats, written out, so the page reads straight through: one
 * line to follow, and bars as written are bars as played — the scrolling
 * views, the minimap, loops and the games all count bars. The library's
 * scores come written out (`npm run expand-repeats`); the viewers and the
 * games do the same as a score loads, for one people bring, before anything
 * else reads it.
 *
 * The order is the one a player follows (repeatOrder): a repeat goes back
 * to the last start-repeat, or to the start of the piece, or to where the
 * last repeat ended; with first and second endings, each time through plays
 * its own ending, and there are as many times through as endings. (Verovio
 * plays plain repeats the same way, and none at all once there are endings;
 * scripts/expand-repeats.mjs checks the one against the other.)
 *
 * The section is rebuilt in that order, endings unwrapped: a bar played
 * again is a copy, every id in it given a suffix ("-r2") and every
 * reference inside it (startid, endid, plist) following. Repeat bar lines
 * become double bars at the joins, and the last bar ends the piece. A copy
 * leaves out what should be said once: the tempo, and system and page
 * breaks.
 *
 * D.C., D.S., segno and coda marks are left alone, repeats and all: they
 * need a reader's judgement (the scrolling views still follow plain
 * repeats as Verovio plays them, utils/placeMeasures.ts).
 *
 * Uses only DOM level 2 APIs, so it works with any XML DOM implementation.
 */

const JUMPS = /\b(D\.\s?C\.|D\.\s?S\.|da capo|dal segno|al fine|al coda|segno|coda)\b/i;

const elements = (parent: Element): Element[] => {
    const out: Element[] = [];
    for (let n = parent.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
    return out;
};
const all = (doc: Document | Element, tag: string): Element[] => {
    const list = doc.getElementsByTagName(tag);
    return Array.from({ length: list.length }, (_, i) => list.item(i)!);
};

/** Does the score have repeats to write out: repeat bar lines, or first and second endings? */
export function hasRepeats(doc: Document): boolean {
    if (all(doc, 'ending').length > 0) return true;
    return all(doc, 'measure').some(m => /^rpt/.test(m.getAttribute('left') ?? '') || /^rpt/.test(m.getAttribute('right') ?? ''));
}

/** Why a score's repeats are left alone, or null when they can be written out. */
export function unexpandable(doc: Document): string | null {
    if (all(doc, 'repeatMark').length > 0 || all(doc, 'expansion').length > 0) return 'repeat marks (D.C., D.S., segno, coda)';
    if (all(doc, 'dir').some(d => JUMPS.test(d.textContent ?? ''))) return 'D.C. or D.S. directions';
    if (all(doc, 'section').length === 0) return 'no section';
    return null;
}

/** The score's top sections: the ones not inside another section or an ending. */
function topSections(doc: Document): Element[] {
    return all(doc, 'section').filter(s => {
        const parent = s.parentNode as Element | null;
        return !parent || (parent.nodeName !== 'section' && parent.nodeName !== 'ending');
    });
}

/** Every measure in document order, with the endings it belongs to ("1", "2", "1, 2", "1-3"). */
function measuresOf(doc: Document): Array<{ el: Element; endings: number[] | null }> {
    const out: Array<{ el: Element; endings: number[] | null }> = [];
    const walk = (parent: Element, endings: number[] | null) => {
        let run = 0;   // endings side by side, for one without a number
        for (const el of elements(parent)) {
            if (el.nodeName === 'measure') { out.push({ el, endings }); run = 0; }
            else if (el.nodeName === 'section') walk(el, endings);
            else if (el.nodeName === 'ending') {
                run++;
                const n = el.getAttribute('n') ?? el.getAttribute('label') ?? '';
                const nums: number[] = [];
                for (const part of n.split(/[,\s.]+/)) {
                    const range = /^(\d+)-(\d+)$/.exec(part);
                    if (range) for (let k = +range[1]; k <= +range[2]; k++) nums.push(k);
                    else if (/^\d+$/.test(part)) nums.push(+part);
                }
                walk(el, nums.length ? nums : [run]);
            }
        }
    };
    topSections(doc).forEach(s => walk(s, null));
    return out;
}

/**
 * The order a player plays the measures in: their ids, a bar played again
 * as "<id>-rend2" (as Verovio names its copies), or an error.
 */
export function repeatOrder(doc: Document): string[] | { error: string } {
    const flat = measuresOf(doc);
    if (flat.some(m => !m.el.getAttribute('xml:id'))) return { error: 'a measure without an id' };
    const bar = (k: number, side: 'left' | 'right') => flat[k]?.el.getAttribute(side) ?? '';
    // A repeat ends at a bar's right, or the next one's left; one starts at a bar's left, or the last one's right.
    const ends = (k: number) => /^rpt(end|both)$/.test(bar(k, 'right')) || /^rpt(end|both)$/.test(bar(k + 1, 'left'));
    const starts = (k: number) => /^rpt(start|both)$/.test(bar(k, 'left')) || /^rpt(start|both)$/.test(bar(k - 1, 'right'));
    // A notes-free first bar is a count-in (the generator bakes one in): a repeat back to the start skips it.
    const countIn = flat.length > 1 && flat[0].el.getElementsByTagName('note').length === 0;
    const plays = new Map<string, number>();
    const order: string[] = [];
    let i = 0, start = countIn ? 1 : 0, pass = 1, steps = 0;
    while (i < flat.length) {
        if (++steps > flat.length * 12) return { error: 'the repeats never end' };
        const m = flat[i];
        if (pass === 1 && starts(i)) start = i;
        if (m.endings && !m.endings.includes(pass)) { i++; continue; }
        const id = m.el.getAttribute('xml:id')!;
        const k = (plays.get(id) ?? 0) + 1;
        plays.set(id, k);
        order.push(k === 1 ? id : `${id}-rend${k}`);
        if (ends(i)) {
            // As many times through as there are endings in this repeat; twice without any.
            let last = i;
            while (last + 1 < flat.length && flat[last + 1].endings) last++;
            const numbers = flat.slice(start, last + 1).flatMap(x => x.endings ?? []);
            const times = numbers.length ? Math.max(...numbers) : 2;
            if (pass < times) { pass++; i = start; continue; }
            pass = 1;
            start = i + 1;
        } else if (m.endings && !flat[i + 1]?.endings) {
            // The last ending played: the repeat is over.
            pass = 1;
            start = i + 1;
        }
        i++;
    }
    return order;
}

/**
 * Rebuild the score's sections in `order` (repeatOrder, or the order
 * Verovio plays). Returns the bars before and after, or an error, leaving
 * the document as it was when it cannot.
 */
export function writeOutRepeats(doc: Document, order: string[]): { bars: [number, number] } | { error: string } {
    const sections = topSections(doc);
    if (sections.length === 0) return { error: 'no section' };

    // Each measure, with what stands before it (breaks, a changed scoreDef); endings and inner sections unwrapped.
    const groups = new Map<string, { measure: Element; before: Element[] }>();
    let pending: Element[] = [];
    const walk = (parent: Element) => {
        for (const el of elements(parent)) {
            if (el.nodeName === 'measure') { groups.set(el.getAttribute('xml:id') ?? '', { measure: el, before: pending }); pending = []; }
            else if (el.nodeName === 'ending' || el.nodeName === 'section') walk(el);
            else pending.push(el);
        }
    };
    sections.forEach(walk);
    const trailing = pending;
    if (groups.has('')) return { error: 'a measure without an id' };

    const COPY = /-rend(\d+)$/;
    const seen = new Set<string>();
    const out: Element[] = [];
    for (const id of order) {
        const pass = Number(COPY.exec(id)?.[1] ?? 1);
        const base = id.replace(COPY, '');
        const g = groups.get(base);
        if (!g) return { error: `a measure the score does not have (${id})` };
        if (!seen.has(base)) {
            seen.add(base);
            out.push(...g.before, g.measure);
            continue;
        }
        // Again: a copy, with its own ids.
        for (const b of g.before) if (b.nodeName !== 'sb' && b.nodeName !== 'pb') out.push(b.cloneNode(true) as Element);
        const copy = g.measure.cloneNode(true) as Element;
        const inside = [copy, ...all(copy, '*')];
        const rename = new Map<string, string>();
        for (const el of inside) {
            const old = el.getAttribute('xml:id');
            if (old) { rename.set(old, `${old}-r${pass}`); el.setAttribute('xml:id', `${old}-r${pass}`); }
        }
        for (const el of inside) {
            for (let a = 0; a < el.attributes.length; a++) {
                const attr = el.attributes.item(a)!;
                if (!attr.value.includes('#')) continue;
                const value = attr.value.split(/\s+/).map(t => (t.startsWith('#') && rename.has(t.slice(1)) ? `#${rename.get(t.slice(1))}` : t)).join(' ');
                if (value !== attr.value) el.setAttribute(attr.name, value);
            }
        }
        for (const t of all(copy, 'tempo')) t.parentNode?.removeChild(t);
        out.push(copy);
    }
    if (seen.size !== groups.size) return { error: `${groups.size - seen.size} of the measures are never played` };

    // The sections, as one, in playing order.
    for (const s of sections) while (s.firstChild) s.removeChild(s.firstChild);
    for (const s of sections.slice(1)) s.parentNode?.removeChild(s);
    for (const el of [...out, ...trailing]) sections[0].appendChild(el);

    // Bar lines: no repeat signs; a double bar where one was; the last bar ends the piece.
    const measures = out.filter(el => el.nodeName === 'measure');
    const numbered = measures.some(m => m.hasAttribute('n'));
    const firstN = Number(measures[0]?.getAttribute('n') ?? 1) || 0;
    measures.forEach((m, k) => {
        if (/^rpt/.test(m.getAttribute('left') ?? '')) m.removeAttribute('left');
        if (/^rpt/.test(m.getAttribute('right') ?? '')) m.setAttribute('right', 'dbl');
        if (k === measures.length - 1) m.setAttribute('right', 'end');
        if (numbered) m.setAttribute('n', String(firstN + k));
    });
    return { bars: [groups.size, measures.length] };
}

/**
 * For the viewers and the games, as a score loads: its repeats written out,
 * when it has any this can write out. Measures without an id get one first.
 * True when the document changed (it must be serialised again).
 */
export function expandRepeats(doc: Document): boolean {
    if (doc.getElementsByTagName('parsererror').length > 0 || !hasRepeats(doc) || unexpandable(doc)) return false;
    const measures = all(doc, 'measure');
    const taken = new Set(measures.map(m => m.getAttribute('xml:id')).filter(Boolean));
    let named = false;
    measures.forEach((m, k) => {
        if (m.getAttribute('xml:id')) return;
        let id = `m-${k + 1}`;
        while (taken.has(id)) id += 'x';
        taken.add(id);
        m.setAttribute('xml:id', id);
        named = true;
    });
    const order = repeatOrder(doc);
    const result = 'error' in order ? order : writeOutRepeats(doc, order);
    if ('error' in result) console.warn(`Repeats not written out: ${result.error}`);
    return named || !('error' in result);
}

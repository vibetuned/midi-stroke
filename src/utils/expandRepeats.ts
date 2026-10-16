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
 * The jumps too — D.C. and D.S., with Fine and the coda — as battuta
 * plays them (packages/core/src/expansion.ts there), and by the same rules:
 * at the D.C. or D.S. the piece goes back to the start or the segno and is
 * played through again without its repeats, each group of endings by its
 * last; it stops at Fine, or leaves at To Coda for the coda sign; with
 * neither, it ends at the D.C. or D.S. bar. One jump a piece. A score that
 * states its own playing order (an <expansion>, as Verovio writes one when
 * it reads MusicXML) is played in that order, as Verovio plays it. Written
 * out, what the jumps said is done: D.C., D.S., To Coda, Fine and the
 * segno go, the coda sign stays where the coda begins, and each jump is a
 * double bar.
 *
 * Uses only DOM level 2 APIs, so it works with any XML DOM implementation.
 */

const elements = (parent: Element): Element[] => {
    const out: Element[] = [];
    for (let n = parent.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
    return out;
};
const all = (doc: Document | Element, tag: string): Element[] => {
    const list = doc.getElementsByTagName(tag);
    return Array.from({ length: list.length }, (_, i) => list.item(i)!);
};

/** What a mark says about the form: a jump, where one lands or ends, or a double segno or coda (not played here). */
export type FormMark = 'segno' | 'coda' | 'toCoda' | 'fine' | 'daCapo' | 'dalSegno' | 'double';

const DOUBLE = /\bD\.\s?D\.\s?S\.|\bdoppi[oa]\b|\bdouble (coda|segno)\b/i;
const FUNCS = new Set(['segno', 'coda', 'fine', 'daCapo', 'dalSegno']);

/**
 * What a <repeatMark> or a <dir> says about the form, or null: MEI's
 * repeatMark by its @func (a coda with words, "To Coda", is where the piece
 * leaves for the coda; a bare one, where the coda is), MuseScore's by its
 * @type, Verovio's MusicXML <dir> by its @type, and any other by its words
 * or its symbol.
 */
export function formMarkOf(el: Element): FormMark | null {
    if (el.nodeName !== 'repeatMark' && el.nodeName !== 'dir') return null;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    const func = el.getAttribute('func') ?? '';
    if (func === 'varsegno' || DOUBLE.test(text) || /double|dss|segno-segno|segno-variation|varied-coda/.test(type)) return 'double';
    if (el.nodeName === 'repeatMark' && FUNCS.has(func)) {
        if (func === 'coda') return /\bto coda\b/i.test(text) || /to-coda/.test(type) ? 'toCoda' : 'coda';
        return func as FormMark;
    }
    if (type === 'dacapo' || /\bD\.\s?C\.|\bda capo\b/i.test(text)) return 'daCapo';
    if (type === 'dalsegno' || /\bD\.\s?S\.|\bdal segno\b/i.test(text)) return 'dalSegno';
    if (type === 'tocoda' || /\bto coda\b/i.test(text)) return 'toCoda';
    if (type === 'fine' || /^fine\b/i.test(text)) return 'fine';
    const glyphs = all(el, 'symbol').map(g => `${g.getAttribute('glyph.name') ?? ''} ${g.getAttribute('glyph.num') ?? ''}`).join(' ');
    if (type === 'segno' || text === '\u{1D10B}' || /^segno$/i.test(text) || /segno|E047/i.test(glyphs)) return 'segno';
    if (type === 'coda' || text === '\u{1D10C}' || /^coda$/i.test(text) || /coda|E048/i.test(glyphs)) return 'coda';
    return null;
}

/** The form marks in a measure, with the elements that carry them. */
function marksIn(measure: Element): Array<{ el: Element; mark: FormMark }> {
    return [...all(measure, 'repeatMark'), ...all(measure, 'dir')]
        .map(el => ({ el, mark: formMarkOf(el) }))
        .filter((m): m is { el: Element; mark: FormMark } => m.mark !== null);
}

const isJump = (m: FormMark) => m === 'daCapo' || m === 'dalSegno';

/** Does the score have a form to write out: repeat bar lines, endings, a D.C. or D.S., or a playing order of its own? */
export function hasRepeats(doc: Document): boolean {
    if (all(doc, 'ending').length > 0 || all(doc, 'expansion').length > 0) return true;
    if (all(doc, 'measure').some(m => /^rpt/.test(m.getAttribute('left') ?? '') || /^rpt/.test(m.getAttribute('right') ?? ''))) return true;
    return [...all(doc, 'repeatMark'), ...all(doc, 'dir')].some(el => { const m = formMarkOf(el); return m !== null && isJump(m); });
}

/** Why a score's form is left alone, or null when it can be written out. */
export function unexpandable(doc: Document): string | null {
    if (all(doc, 'section').length === 0) return 'no section';
    // A playing order of its own is followed as it is.
    if (all(doc, 'expansion').length > 0) return null;
    const marks = [...all(doc, 'repeatMark'), ...all(doc, 'dir')].map(formMarkOf);
    if (marks.includes('double')) return 'a double segno or a double coda';
    if (marks.filter(m => m !== null && isJump(m)).length > 1) return 'more than one D.C. or D.S.';
    if (marks.includes('dalSegno') && !marks.includes('segno')) return 'a D.S. without a segno';
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
    const plan = playingPlan(doc);
    return 'error' in plan ? plan : plan.order;
}

/**
 * How the score is played: the order (repeatOrder), the places in it where
 * the piece jumps (after which a double bar), and the marks that say so —
 * done with once it is written out.
 */
interface Plan {
    order: string[];
    joins: number[];
    spent: Element[];
}

function playingPlan(doc: Document): Plan | { error: string } {
    const expansion = all(doc, 'expansion')[0];
    if (expansion) return expansionPlan(doc, expansion);
    const flat = measuresOf(doc);
    if (flat.some(m => !m.el.getAttribute('xml:id'))) return { error: 'a measure without an id' };
    const bar = (k: number, side: 'left' | 'right') => flat[k]?.el.getAttribute(side) ?? '';
    // A repeat ends at a bar's right, or the next one's left; one starts at a bar's left, or the last one's right.
    const ends = (k: number) => /^rpt(end|both)$/.test(bar(k, 'right')) || /^rpt(end|both)$/.test(bar(k + 1, 'left'));
    const starts = (k: number) => /^rpt(start|both)$/.test(bar(k, 'left')) || /^rpt(start|both)$/.test(bar(k - 1, 'right'));
    // A notes-free first bar is a count-in (the generator bakes one in): a repeat back to the start skips it.
    const countIn = flat.length > 1 && flat[0].el.getElementsByTagName('note').length === 0;
    const marks = flat.map(m => marksIn(m.el));
    const has = (k: number, mark: FormMark) => marks[k]?.some(x => x.mark === mark) ?? false;
    if (marks.some(ms => ms.some(x => x.mark === 'double'))) return { error: 'a double segno or a double coda' };
    const jumps = flat.map((_, k) => k).filter(k => has(k, 'daCapo') || has(k, 'dalSegno'));
    if (jumps.length > 1) return { error: 'more than one D.C. or D.S.' };
    const jumpAt = jumps[0] ?? -1;

    const plays = new Map<string, number>();
    const order: string[] = [];
    const play = (k: number) => {
        const id = flat[k].el.getAttribute('xml:id')!;
        const n = (plays.get(id) ?? 0) + 1;
        plays.set(id, n);
        order.push(n === 1 ? id : `${id}-rend${n}`);
    };
    let i = 0, start = countIn ? 1 : 0, pass = 1, steps = 0;
    while (i < flat.length) {
        if (++steps > flat.length * 12) return { error: 'the repeats never end' };
        const m = flat[i];
        if (pass === 1 && starts(i)) start = i;
        if (m.endings && !m.endings.includes(pass)) { i++; continue; }
        play(i);
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
        // The D.C. or D.S.: what follows is the coda, played from To Coda.
        if (i === jumpAt) break;
        i++;
    }
    if (jumpAt < 0) return { order, joins: [], spent: [] };

    // Back to the start, or the segno, and through again: no repeats, each
    // group of endings by its last; to Fine, or to To Coda and on from the
    // coda sign, or else to the D.C. or D.S. bar.
    const joins = [order.length - 1];
    const dalSegno = has(jumpAt, 'dalSegno');
    const from = dalSegno ? flat.findIndex((_, k) => has(k, 'segno')) : countIn ? 1 : 0;
    if (from < 0) return { error: 'a D.S. without a segno' };
    // Where it leaves: "To Coda", or a coda sign before the jump; where it goes: the coda sign after it, or the next bar.
    const toCoda = flat.findIndex((_, k) => k <= jumpAt && has(k, 'toCoda'));
    const leave = toCoda >= 0 ? toCoda : flat.findIndex((_, k) => k <= jumpAt && has(k, 'coda'));
    let coda = flat.findIndex((_, k) => k > jumpAt && has(k, 'coda'));
    if (leave >= 0 && coda < 0 && jumpAt + 1 < flat.length) coda = jumpAt + 1;
    const lastEnding = (k: number): boolean => {
        let a = k, b = k;
        while (a > 0 && flat[a - 1].endings) a--;
        while (b + 1 < flat.length && flat[b + 1].endings) b++;
        const top = Math.max(...flat.slice(a, b + 1).flatMap(x => x.endings ?? []));
        return flat[k].endings!.includes(top);
    };
    let j = from, jumped = false;
    while (j < flat.length) {
        if (++steps > flat.length * 14) return { error: 'the jumps never end' };
        if (!flat[j].endings || lastEnding(j)) play(j);
        if (has(j, 'fine')) break;
        if (!jumped && j === leave && coda > j) {
            joins.push(order.length - 1);
            j = coda;
            jumped = true;
            continue;
        }
        if (j === jumpAt && !jumped) break;
        j++;
    }
    // Done with once written out: everything but the coda sign where the coda begins.
    const spent = marks.flatMap((ms, k) => ms.filter(x => !(x.mark === 'coda' && k === coda && k !== leave)).map(x => x.el));
    return { order, joins, spent };
}

/**
 * A score's own playing order, its <expansion>: each entry a section, an
 * ending or a measure (or another expansion), its measures in their order —
 * as Verovio plays it. The jumps are wherever it leaves the page's order.
 */
function expansionPlan(doc: Document, expansion: Element): Plan | { error: string } {
    const byId = new Map<string, Element>();
    for (const el of all(doc, '*')) {
        const id = el.getAttribute('xml:id');
        if (id) byId.set(id, el);
    }
    const measures = all(doc, 'measure');
    if (measures.some(m => !m.getAttribute('xml:id'))) return { error: 'a measure without an id' };
    const place = new Map(measures.map((m, k) => [m, k]));
    const listed: Element[] = [];
    const expand = (exp: Element, depth: number): string | null => {
        if (depth > 8) return 'an expansion inside itself';
        for (const ref of (exp.getAttribute('plist') ?? '').split(/\s+/).filter(Boolean)) {
            const el = byId.get(ref.replace(/^#/, ''));
            if (!el) return `an expansion naming what the score does not have (${ref})`;
            if (el.nodeName === 'expansion') { const why = expand(el, depth + 1); if (why) return why; }
            else listed.push(...(el.nodeName === 'measure' ? [el] : all(el, 'measure')));
        }
        return null;
    };
    const why = expand(expansion, 0);
    if (why) return { error: why };
    if (listed.length === 0) return { error: 'an empty expansion' };
    const plays = new Map<string, number>();
    const order = listed.map(m => {
        const id = m.getAttribute('xml:id')!;
        const n = (plays.get(id) ?? 0) + 1;
        plays.set(id, n);
        return n === 1 ? id : `${id}-rend${n}`;
    });
    // Where the order leaves the page's, but not at a repeat sign (that is a double bar already).
    const joins = listed.flatMap((m, k) => k + 1 < listed.length && place.get(listed[k + 1]) !== place.get(m)! + 1
        && !/^rpt(end|both)$/.test(m.getAttribute('right') ?? '') ? [k] : []);
    const spent = measures.flatMap(m => marksIn(m).filter(x => x.mark !== 'coda').map(x => x.el));
    return { order, joins, spent };
}

/**
 * Rebuild the score's sections in `order` (repeatOrder, or the order
 * Verovio plays). Returns the bars before and after, or an error, leaving
 * the document as it was when it cannot.
 */
/** Attributes that hold references to other elements, with or without a "#". */
const POINTERS = new Set(['startid', 'endid', 'plist', 'sameas', 'corresp', 'next', 'prev', 'follows', 'precedes', 'copyof', 'synch']);
/** References that point on in time, and back. */
const FORWARD = new Set(['endid', 'next', 'precedes']);
const BACKWARD = new Set(['startid', 'prev', 'follows']);

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
    // Each measure as it is played: its place, and for a copy, its renamed ids.
    const occurrences = new Map<string, Array<{ pos: number; rename: Map<string, string> | null }>>();
    const copies: Array<{ inside: Element[]; pos: number; rename: Map<string, string> }> = [];
    // Which measure each id is in, to find a reference's bar.
    const measureOfId = new Map<string, string>();
    for (const [base, g] of groups) for (const el of [g.measure, ...all(g.measure, '*')]) {
        const id = el.getAttribute('xml:id');
        if (id) measureOfId.set(id, base);
    }
    let pos = 0;
    for (const id of order) {
        const pass = Number(COPY.exec(id)?.[1] ?? 1);
        const base = id.replace(COPY, '');
        const g = groups.get(base);
        if (!g) return { error: `a measure the score does not have (${id})` };
        const at = pos++;
        if (!seen.has(base)) {
            seen.add(base);
            out.push(...g.before, g.measure);
            occurrences.set(base, [{ pos: at, rename: null }]);
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
        for (const t of all(copy, 'tempo')) t.parentNode?.removeChild(t);
        occurrences.get(base)!.push({ pos: at, rename });
        copies.push({ inside, pos: at, rename });
        out.push(copy);
    }
    // A copy's references: to its own bar, its own copies; to another bar —
    // a tie or a slur across the bar line — that bar as it is played next to
    // this one: the time after for an end, the time before for a start.
    for (const { inside, pos: here, rename } of copies) {
        const resolve = (id: string, attr: string): string => {
            if (rename.has(id)) return rename.get(id)!;
            const base = measureOfId.get(id);
            const occs = base ? occurrences.get(base) : undefined;
            if (!occs) return id;
            const after = occs.find(o => o.pos >= here), before = [...occs].reverse().find(o => o.pos <= here);
            const nearest = [...occs].sort((a, b) => Math.abs(a.pos - here) - Math.abs(b.pos - here) || b.pos - a.pos)[0];
            const pick = FORWARD.has(attr) ? after ?? nearest : BACKWARD.has(attr) ? before ?? nearest : nearest;
            return pick.rename?.get(id) ?? id;
        };
        for (const el of inside) {
            for (let a = 0; a < el.attributes.length; a++) {
                const attr = el.attributes.item(a)!;
                const pointer = POINTERS.has(attr.name);
                if (!pointer && !attr.value.includes('#')) continue;
                const value = attr.value.split(/\s+/).map(t => {
                    const hash = t.startsWith('#');
                    if (!hash && !pointer) return t;
                    const id = hash ? t.slice(1) : t;
                    const to = resolve(id, attr.name);
                    return to === id ? t : `${hash ? '#' : ''}${to}`;
                }).join(' ');
                if (value !== attr.value) el.setAttribute(attr.name, value);
            }
        }
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
 * For the viewers and the games, as a score loads: its repeats and jumps
 * written out, when it has any this can write out. Measures without an id
 * get one first. True when the document changed (it must be serialised again).
 */
export function expandRepeats(doc: Document): boolean {
    if (doc.getElementsByTagName('parsererror').length > 0 || !hasRepeats(doc) || unexpandable(doc)) return false;
    const measures = all(doc, 'measure');
    const taken = new Set(all(doc, '*').map(el => el.getAttribute('xml:id')).filter(Boolean));
    let named = false;
    const name = (el: Element, stem: string) => {
        let id = stem;
        while (taken.has(id)) id += 'x';
        taken.add(id);
        el.setAttribute('xml:id', id);
    };
    measures.forEach((m, k) => {
        if (m.getAttribute('xml:id')) return;
        name(m, `m-${k + 1}`);
        named = true;
    });
    const plan = playingPlan(doc);
    if ('error' in plan) { console.warn(`Repeats not written out: ${plan.error}`); return named; }
    // The marks the jumps leave behind are found again in the copies by their ids.
    plan.spent.forEach((el, k) => { if (!el.getAttribute('xml:id')) name(el, `jump-${k + 1}`); });
    const spent = new Set(plan.spent.map(el => el.getAttribute('xml:id')!));
    const result = writeOutRepeats(doc, plan.order);
    if ('error' in result) { console.warn(`Repeats not written out: ${result.error}`); return named; }

    for (const el of [...all(doc, 'repeatMark'), ...all(doc, 'dir')]) {
        if (spent.has((el.getAttribute('xml:id') ?? '').replace(/-r\d+$/, ''))) el.parentNode?.removeChild(el);
    }
    for (const e of all(doc, 'expansion')) e.parentNode?.removeChild(e);
    // A double bar at each jump, and where the page ended before; the end only at the end.
    const played = all(doc, 'measure');
    for (const k of plan.joins) if (k < played.length - 1) played[k].setAttribute('right', 'dbl');
    played.forEach((m, k) => { if (k < played.length - 1 && m.getAttribute('right') === 'end') m.setAttribute('right', 'dbl'); });
    return true;
}

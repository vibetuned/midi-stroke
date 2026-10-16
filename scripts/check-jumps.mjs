/**
 * Checks for D.C., D.S., Fine and the coda written out as a score loads
 * (src/utils/expandRepeats.ts), as battuta plays them:
 *
 *   1. Every form, in the order a player follows: D.C., D.C. al Fine,
 *      D.C. al Coda, D.S., D.S. al Fine, D.S. al Coda — with repeats and
 *      endings before the jump, taken once, and only the last ending after.
 *      Each is written as MusicXML and read by Verovio, which makes its own
 *      playing order of it (an <expansion>): Verovio plays that order, this
 *      reads that order, and this reads the marks alone (the expansion taken
 *      away) — all three the order a player follows.
 *   2. Written out: the same notes at the same times as Verovio plays the
 *      original; no D.C., D.S., Fine, To Coda or segno left, the coda sign
 *      where the coda begins; a double bar at each jump; the end at the end.
 *   3. MEI's repeatMark as battuta writes it (a D.C. al Fine, the marks on
 *      notes) and as MuseScore does (its @type, its words): read the same.
 *   4. What is left alone: two jumps, a D.S. without a segno, a double segno
 *      or coda.
 *   5. A count-in bar: D.C. goes back to the music, not to it.
 *
 *   node scripts/check-jumps.mjs        (npm run check:jumps)
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'jumps-'));
writeFileSync(join(outDir, 'entry.ts'), `export * from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};`);
await build({ entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning' });
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);
rmSync(outDir, { recursive: true, force: true });

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none' });
const parse = text => new DOMParser().parseFromString(text, 'text/xml');
const serialize = dom => new XMLSerializer().serializeToString(dom);
const tags = (dom, tag) => { const l = dom.getElementsByTagName(tag); return Array.from({ length: l.length }, (_, i) => l.item(i)); };

// ------------------------------------------------------------ the forms, as MusicXML
// Each bar a whole note, named by its letter (its pitch); marks as a notation program writes them.
const PITCH = { A: ['A', 4], B: ['B', 4], C: ['C', 5], D: ['D', 5], E: ['E', 5], F: ['F', 5], G: ['G', 5], H: ['A', 5] };
const words = (w, sound) => `<direction placement="above"><direction-type><words>${w}</words></direction-type><sound ${sound}/></direction>`;
const sign = (s, sound) => `<direction placement="above"><direction-type><${s}/></direction-type><sound ${sound}/></direction>`;
const MARK = {
    segno: () => sign('segno', 'segno="s"'),
    coda: () => sign('coda', 'coda="c"'),
    fine: () => words('Fine', 'fine="yes"'),
    toCoda: () => words('To Coda', 'tocoda="c"'),
    dc: w => words(w, 'dacapo="yes"'),
    ds: w => words(w, 'dalsegno="s"'),
};
/** Bars as "A", "𝄋B", "B|Fine", "C|D.C. al Fine", "‖:A", "B:‖", "[1 C:‖", "[2 D" … */
function musicxml(bars) {
    const out = bars.map((b, k) => {
        let body = '', left = '', right = '';
        let [head, tail] = b.split('|');
        if (head.startsWith('‖:')) { left = '<barline location="left"><repeat direction="forward"/></barline>'; head = head.slice(2); }
        const ending = /^\[(\d)\s*/.exec(head);
        if (ending) { head = head.slice(ending[0].length); }
        if (head.endsWith(':‖')) { right = '<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>'; head = head.slice(0, -2); }
        // The signs are two UTF-16 code units each.
        if (head.startsWith('𝄋')) { body += MARK.segno(); head = head.slice('𝄋'.length); }
        if (head.startsWith('𝄌')) { body += MARK.coda(); head = head.slice('𝄌'.length); }
        const [step, octave] = PITCH[head];
        body += `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><type>whole</type></note>`;
        if (tail === 'Fine') body += MARK.fine();
        else if (tail === 'To Coda') body += MARK.toCoda();
        else if (tail?.startsWith('D.C.')) body += MARK.dc(tail);
        else if (tail?.startsWith('D.S.')) body += MARK.ds(tail);
        if (ending) {
            const n = ending[1];
            left = `<barline location="left"><ending number="${n}" type="start"/></barline>` + left;
            right = right
                ? right.replace('</barline>', `<ending number="${n}" type="stop"/></barline>`)
                : `<barline location="right"><ending number="${n}" type="discontinue"/></barline>`;
        }
        const attrs = k === 0 ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : '';
        return `<measure number="${k + 1}">${left}${attrs}${body}${right}</measure>`;
    }).join('');
    return `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1">${out}</part></score-partwise>`;
}

/** The bars a measure id stands for, by its note's letter. */
function lettersOf(dom) {
    const letter = {};
    for (const m of tags(dom, 'measure')) {
        const note = tags(m, 'note')[0];
        const key = Object.keys(PITCH).find(k => PITCH[k][0].toLowerCase() === note.getAttribute('pname') && PITCH[k][1] === Number(note.getAttribute('oct')));
        letter[m.getAttribute('xml:id')] = key;
    }
    return ids => ids.map(id => letter[id.replace(/-rend\d+$/, '')]).join(' ');
}
function verovioOrder(text) {
    tk.loadData(text);
    const order = [];
    for (const e of tk.renderToTimemap({ includeMeasures: true })) if (e.measureOn && order[order.length - 1] !== e.measureOn) order.push(e.measureOn);
    return order;
}
function onsets(text) {
    tk.loadData(text);
    return tk.renderToTimemap({ includeMeasures: true, includeRests: false }).filter(e => e.on?.length).map(e => `${Math.round(e.qstamp * 1000)}:${e.on.length}`);
}
/** What the note-ons sound: each one's pitch, in order. */
function melody(text) {
    tk.loadData(text);
    const mei = parse(tk.getMEI());
    const pitch = new Map(tags(mei, 'note').map(n => [n.getAttribute('xml:id'), `${n.getAttribute('pname')}${n.getAttribute('oct')}`]));
    return tk.renderToTimemap({ includeRests: false }).filter(e => e.on?.length).map(e => e.on.map(id => pitch.get(id.replace(/-rend\d+$/, '').replace(/-r\d+$/, ''))).join('+')).join(' ');
}

const FORMS = [
    ['D.C.', ['A', 'B', 'C|D.C.'], 'A B C A B C'],
    ['D.C. al Fine', ['A', 'B|Fine', 'C', 'D|D.C. al Fine'], 'A B C D A B'],
    ['D.C. al Coda', ['A', 'B|To Coda', 'C|D.C. al Coda', '𝄌D', 'E'], 'A B C A B D E'],
    ['D.S.', ['A', '𝄋B', 'C|D.S.'], 'A B C B C'],
    ['D.S. al Fine', ['A', '𝄋B', 'C|Fine', 'D|D.S. al Fine'], 'A B C D B C'],
    ['D.S. al Coda', ['A', '𝄋B', 'C|To Coda', 'D|D.S. al Coda', '𝄌E', 'F'], 'A B C D B C E F'],
    ['a repeat, then D.C. al Fine: the repeat taken once', ['‖:A', 'B:‖|Fine', 'C', 'D|D.C. al Fine'], 'A B A B C D A B'],
    // No ‖: — the repeat goes back to the start; after the D.S., only the second ending.
    ['endings, then D.S. al Coda: the last ending after the jump', ['A', '𝄋B', '[1 C:‖', '[2 D|To Coda', 'E|D.S. al Coda', '𝄌F'], 'A B C A B D E B D F'],
];

for (const [name, bars, want] of FORMS) {
    const xml = musicxml(bars);
    tk.loadData(xml);
    const mei = tk.getMEI();
    const dom = parse(mei);
    const letters = lettersOf(dom);
    const hasExpansion = tags(dom, 'expansion').length > 0;
    ok(`1. ${name}: Verovio makes a playing order of it`, hasExpansion);
    const verovio = letters(verovioOrder(mei));
    eq(`1. ${name}: Verovio plays it in the order a player follows`, verovio, want);
    const byExpansion = E.repeatOrder(parse(mei));
    eq(`1. ${name}: read by its <expansion>`, 'error' in byExpansion ? byExpansion.error : letters(byExpansion), want);
    const marksOnly = parse(mei);
    for (const x of tags(marksOnly, 'expansion')) x.parentNode.removeChild(x);
    eq(`1. ${name}: read by its marks alone`, E.unexpandable(marksOnly), null);
    const byMarks = E.repeatOrder(marksOnly);
    eq(`1. ${name}: …in the same order`, 'error' in byMarks ? byMarks.error : letters(byMarks), want);

    // 2. Written out, both ways.
    for (const [how, src] of [['from its expansion', parse(mei)], ['from its marks', marksOnly]]) {
        ok(`2. ${name} (${how}): written out`, E.expandRepeats(src) === true);
        const text = serialize(src);
        const out = parse(text);
        eq(`2. ${name} (${how}): the same notes at the same times as Verovio plays the original`, onsets(text), onsets(mei));
        eq(`2. ${name} (${how}): …the same pitches`, melody(text), melody(mei));
        const left = [...tags(out, 'repeatMark'), ...tags(out, 'dir')].map(E.formMarkOf).filter(Boolean);
        const codas = want.includes('𝄌') ? 1 : bars.some(b => b.includes('𝄌')) ? 1 : 0;
        eq(`2. ${name} (${how}): no jump left; the coda sign once, where the coda begins`, left, codas ? ['coda'] : []);
        if (codas) {
            const ms = tags(out, 'measure');
            const at = ms.findIndex(m => tags(m, 'repeatMark').some(r => E.formMarkOf(r) === 'coda'));
            eq(`2. ${name} (${how}): …on the coda's first bar`, letters([ms[at].getAttribute('xml:id').replace(/-r\d+$/, '')]), bars.find(b => b.startsWith('𝄌')).slice(2, 3));
        }
        const rights = tags(out, 'measure').map(m => m.getAttribute('right') ?? '');
        ok(`2. ${name} (${how}): no repeat signs, the end only at the end`, !rights.some(r => /^rpt/.test(r)) && rights.filter(r => r === 'end').length === 1 && rights.at(-1) === 'end', rights.join(','));
        eq(`2. ${name} (${how}): no playing order left to follow`, tags(out, 'expansion').length, 0);
    }
}
// The joins: a double bar after the D.S. bar, and after To Coda's bar the second time.
{
    tk.loadData(musicxml(['A', '𝄋B', 'C|To Coda', 'D|D.S. al Coda', '𝄌E']));
    const dom = parse(tk.getMEI());
    for (const x of tags(dom, 'expansion')) x.parentNode.removeChild(x);
    E.expandRepeats(dom);
    eq('2. a double bar at each jump: after the D.S., and after To Coda the second time', tags(dom, 'measure').map(m => m.getAttribute('right') || '-').join(' '), '- - - dbl - dbl end');
}

// ------------------------------------------------------------ 3. MEI as battuta and MuseScore write it
const meiScore = (measures, extra = '') => `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0"><music><body><mdiv><score>
<scoreDef meter.count="3" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
<section>${extra}${measures.map((m, k) => `<measure n="${k + 1}" xml:id="m${k + 1}"><staff n="1"><layer n="1">${m.notes ?? `<note xml:id="n${k + 1}" dur="2." pname="${'cdefgab'[k % 7]}" oct="4"/>`}</layer></staff>${m.marks ?? ''}</measure>`).join('')}</section></score></mdiv></body></music></mei>`;
const order = text => { const r = E.repeatOrder(parse(text)); return 'error' in r ? r.error : r.map(id => id.replace(/^m/, '').replace(/-rend\d+$/, "'")).join(' '); };
{
    // battuta's D.C. al Fine (the Air Basque's encoding): marks on notes, no words.
    const bars = Array.from({ length: 8 }, () => ({}));
    bars[3].marks = '<repeatMark xml:id="f" staff="1" startid="#n4" func="fine"/>';
    bars[7].marks = '<repeatMark xml:id="dc" staff="1" startid="#n8" func="daCapo"/>';
    const text = meiScore(bars);
    eq('3. battuta\'s D.C. al Fine: through, then back to Fine', order(text), "1 2 3 4 5 6 7 8 1' 2' 3' 4'");
    const dom = parse(text);
    E.expandRepeats(dom);
    eq('3. …written out: 12 bars, renumbered, a double bar at the D.C., the end at Fine', tags(dom, 'measure').map(m => `${m.getAttribute('n')}${m.getAttribute('right') ? ':' + m.getAttribute('right') : ''}`).join(' '), '1 2 3 4 5 6 7 8:dbl 9 10 11 12:end');
    eq('3. …the D.C. and the Fine gone, from the copies too', tags(dom, 'repeatMark').length, 0);
}
{
    // MuseScore's export: @type, words in the mark, a bare coda sign where the coda is.
    const kinds = [
        [{ func: 'segno', type: '' }, 'segno'],
        [{ func: 'coda', type: '' }, 'coda'],
        [{ func: 'coda', type: 'mscore-marker-to-coda', text: 'To Coda' }, 'toCoda'],
        [{ func: 'fine', type: '' }, 'fine'],
        [{ func: 'daCapo', type: 'mscore-jump-dc-al-fine', text: 'D.C. al Fine' }, 'daCapo'],
        [{ func: 'dalSegno', type: 'mscore-jump-ds-al-coda', text: 'D.S. al Coda' }, 'dalSegno'],
        [{ func: 'segno', type: 'mscore-marker-segno-variation' }, 'double'],
        [{ func: 'coda', type: 'mscore-marker-varied-coda' }, 'double'],
        [{ func: 'daCapo', type: 'mscore-jump-dc-al-double-coda', text: 'D.C. al Doppia Coda' }, 'double'],
        [{ func: 'dalSegno', type: 'mscore-jump-dss-al-fine', text: 'D.D.S. al Fine' }, 'double'],
    ];
    const got = kinds.map(([k]) => E.formMarkOf(parse(`<repeatMark xmlns="http://www.music-encoding.org/ns/mei" func="${k.func}"${k.type ? ` type="${k.type}"` : ''}>${k.text ?? ''}</repeatMark>`).documentElement));
    eq('3. MuseScore\'s marks, each read as what it is', got, kinds.map(k => k[1]));
    // Words alone, in a <dir>, as other programs write them.
    const dirs = [['D.C. al Fine', 'daCapo'], ['Da Capo', 'daCapo'], ['D. S. al Coda', 'dalSegno'], ['Dal Segno', 'dalSegno'], ['Fine', 'fine'], ['To Coda', 'toCoda'], ['Coda', 'coda'], ['\u{1D10B}', 'segno'], ['\u{1D10C}', 'coda'], ['dolce', null], ['finest', null]];
    eq('3. words in a <dir>: D.C., D.S., Fine, To Coda, the signs — and nothing else', dirs.map(([w]) => E.formMarkOf(parse(`<dir xmlns="http://www.music-encoding.org/ns/mei"><rend>${w}</rend></dir>`).documentElement)), dirs.map(d => d[1]));
    const glyph = E.formMarkOf(parse('<dir xmlns="http://www.music-encoding.org/ns/mei"><symbol glyph.auth="smufl" glyph.num="U+E047"/></dir>').documentElement);
    eq('3. a SMuFL segno symbol', glyph, 'segno');
}
{
    // MuseScore's D.S. al Coda: To Coda in words, the coda sign bare.
    const bars = Array.from({ length: 6 }, () => ({}));
    bars[1].marks = '<repeatMark func="segno" tstamp="0"/>';
    bars[2].marks = '<repeatMark type="mscore-marker-to-coda" func="coda" tstamp="0">To Coda</repeatMark>';
    bars[3].marks = '<repeatMark type="mscore-jump-ds-al-coda" func="dalSegno" tstamp="0">D.S. al Coda</repeatMark>';
    bars[4].marks = '<repeatMark func="coda" tstamp="0"/>';
    eq('3. MuseScore\'s D.S. al Coda', order(meiScore(bars)), "1 2 3 4 2' 3' 5 6");
    // Two bare coda signs: the one before the jump is where it leaves.
    bars[2].marks = '<repeatMark func="coda" tstamp="0"/>';
    eq('3. two bare coda signs: it leaves at the first, for the second', order(meiScore(bars)), "1 2 3 4 2' 3' 5 6");
    // To Coda and no sign where the coda is: it begins after the jump.
    bars[2].marks = '<repeatMark func="coda" tstamp="0">To Coda</repeatMark>';
    bars[4].marks = '';
    eq('3. To Coda and no coda sign: the coda is what follows the jump', order(meiScore(bars)), "1 2 3 4 2' 3' 5 6");
}

// ------------------------------------------------------------ 4. what is left alone
{
    const bars = Array.from({ length: 4 }, () => ({}));
    bars[1].marks = '<dir>D.C.</dir>';
    bars[3].marks = '<dir>D.C. al Fine</dir>';
    const two = parse(meiScore(bars));
    eq('4. two jumps: left alone', E.unexpandable(two), 'more than one D.C. or D.S.');
    eq('4. …and the document unchanged', E.expandRepeats(two), false);
    const noSegno = Array.from({ length: 3 }, () => ({}));
    noSegno[2].marks = '<dir>D.S. al Fine</dir>';
    eq('4. a D.S. without a segno: left alone', E.unexpandable(parse(meiScore(noSegno))), 'a D.S. without a segno');
    const double = Array.from({ length: 3 }, () => ({}));
    double[0].marks = '<repeatMark func="segno"/>';
    double[2].marks = '<repeatMark func="dalSegno">D.D.S. al Fine</repeatMark>';
    eq('4. a double segno: left alone', E.unexpandable(parse(meiScore(double))), 'a double segno or a double coda');
    const plain = parse(meiScore(Array.from({ length: 3 }, () => ({}))));
    eq('4. no repeats and no jumps: nothing to do', [E.hasRepeats(plain), E.expandRepeats(plain)], [false, false]);
    // A Fine alone, without a D.C. or D.S., is the end of a piece, not a jump.
    const fineOnly = Array.from({ length: 3 }, () => ({}));
    fineOnly[2].marks = '<dir>Fine</dir>';
    eq('4. a Fine with no jump: nothing to do', E.hasRepeats(parse(meiScore(fineOnly))), false);
}

// ------------------------------------------------------------ 5. a count-in bar
{
    const bars = [{ notes: '<rest dur="2."/>' }, {}, {}, {}];
    bars[3].marks = '<dir>D.C.</dir>';
    eq('5. D.C. goes back to the music, past the count-in bar', order(meiScore(bars)), "1 2 3 4 2' 3' 4'");
}

if (fails.length) {
    console.log(`✗ ${fails.length} of ${checks} checks failed:`);
    for (const f of fails) console.log('  ' + f);
    process.exit(1);
}
console.log(`✓ ${checks} checks passed`);

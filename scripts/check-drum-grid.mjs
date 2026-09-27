/**
 * Checks for the drums app's step grid (src/utils/drumGrid.ts), which
 * components/drums/VirtualDrums.tsx draws:
 *
 *   1. On every bundled chart it shows what the grid always showed — the same
 *      columns, the same hits in the same cells — now read from the timemap
 *      instead of re-parsing the MEI (the old parser is kept here to compare).
 *   2. It never moves: the columns stay, and as the playhead leaves one, it
 *      turns to the same step of the next bar — round a looping pattern, on
 *      through a long score, back to a loop range's start.
 *   3. Patterns loop, longer scores play through; the grooves' grid is 16
 *      sixteenths, or 12 triplet eighths for a shuffle, with the ride and the
 *      hi-hat foot on rows of their own.
 *
 *   node scripts/check-drum-grid.mjs        (npm run check:grid)
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser } from '@xmldom/xmldom';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'grid-'));
writeFileSync(join(outDir, 'entry.ts'), `
export * from ${JSON.stringify(join(ROOT, 'src/utils/drumGrid.ts'))};
export { extractTimemap } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { ensureCountInMeasure, ensureNoteIds } from ${JSON.stringify(join(ROOT, 'src/utils/mei.ts'))};
export { expandRepeats } from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};
export { readMidi, quantize, grooveMei } from ${JSON.stringify(join(ROOT, 'src/utils/grooveMidi.ts'))};
`);
await build({ entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning', define: { 'import.meta.env.BASE_URL': '"/"' } });
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);
rmSync(outDir, { recursive: true, force: true });

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none', breaks: 'none' });

/** The timemap of a score as the drums app loads it. */
function timemapOf(mei) {
    const dom = new DOMParser().parseFromString(mei, 'text/xml');
    E.expandRepeats(dom);
    E.ensureCountInMeasure(dom);
    E.ensureNoteIds(dom);
    tk.loadData(dom.toString());
    return E.extractTimemap(tk, dom);
}
/** Every hit on the grid, as "bar:row:column". */
function cellsOf(grid) {
    const out = [];
    grid.bars.forEach((b, i) => { for (const [row, cols] of b.hits) for (const c of cols) out.push(`${i}:${row}:${c}`); });
    return out.sort();
}

// --------------------------------------------------- the old grid, for comparison
// components/drums/VirtualDrums.tsx as it was: the MEI re-parsed, layer by layer.
const OLD_MAP = [
    ['Cymbal', 'a', '5', 'x'], ['OpenHiHat', 'g', '5', '+'], ['ClosedHiHat', 'g', '5', 'x'], ['Tambourine', 'f', '5', 'diamond', 'void'],
    ['Cowbell', 'f', '5', 'diamond'], ['HighTom', 'e', '5'], ['MediumTom', 'd', '5'], ['RimShot', 'c', '5', 'slash'], ['SnareDrum', 'c', '5'],
    ['Clap', 'e', '4', 'x'], ['LowTom', 'a', '4'], ['BassDrum', 'f', '4'],
];
const list = nl => Array.from({ length: nl.length }, (_, i) => nl.item(i));
function oldGrid(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const find = el => {
        const [pname, oct, head, fill] = ['pname', 'oct', 'head.shape', 'head.fill'].map(a => el.getAttribute(a) || null);
        for (const [id, p, o, h, f] of OLD_MAP) {
            let m = p === pname && o === oct;
            if (h !== undefined) m = m && h === head; else if (head) m = false;
            if (f !== undefined) m = m && f === fill;
            if (m) return id;
        }
        return null;
    };
    const Q = 192;
    const durOf = (n, mod) => { const d = parseInt(n.getAttribute('dur') || '', 10); if (!d) return 0; let t = 4 / d * Q; if (n.getAttribute('dots') === '1') t *= 1.5; return t * mod; };
    const ratio = n => (n.hasAttribute('num') && n.hasAttribute('numbase') ? (parseInt(n.getAttribute('numbase'), 10) || 2) / (parseInt(n.getAttribute('num'), 10) || 3) : 1);
    const sig = doc.getElementsByTagName('meterSig')[0];
    const count = parseInt(sig?.getAttribute('count') || '4', 10), unit = parseInt(sig?.getAttribute('unit') || '4', 10);
    const hasTuplets = doc.getElementsByTagName('tuplet').length > 0 || [...list(doc.getElementsByTagName('note')), ...list(doc.getElementsByTagName('chord'))].some(n => n.getAttribute('num') === '3');
    const triplet = (count === 12 && unit === 8) || (count === 4 && unit === 4 && hasTuplets);
    let tpc = Q / 4, columns, perMeasure = count * (4 / unit) * Q;
    if (triplet) { if (count === 12) { tpc = Q / 2; columns = 12; } else { tpc = Math.round(Q / 3); columns = 12; } perMeasure = columns * tpc; }
    else columns = Math.round(perMeasure / tpc);
    const cells = [];
    const measures = doc.getElementsByTagName('measure');
    let bar = -1, global = 0;
    for (let i = 0; i < measures.length; i++) {
        const m = measures[i];
        if (m.getAttribute('n') === '0') continue;
        bar++;
        const layers = m.getElementsByTagName('layer');
        for (let l = 0; l < layers.length; l++) {
            let t = global;
            const walk = (node, mod = 1) => {
                const tag = node.tagName;
                if (tag === 'note') {
                    const id = find(node);
                    if (id) cells.push([t - global, id, bar]);
                    if (node.parentNode.tagName !== 'chord') t += durOf(node, mod * ratio(node));
                } else if (tag === 'rest' || tag === 'space') t += durOf(node, mod * ratio(node));
                else if (tag === 'chord') {
                    for (const n of list(node.getElementsByTagName('note'))) { const id = find(n); if (id) cells.push([t - global, id, bar]); }
                    t += durOf(node, mod * ratio(node));
                } else if (tag === 'beam' || tag === 'tuplet') for (const c of list(node.childNodes).filter(c => c.nodeType === 1)) walk(c, mod * ratio(node));
            };
            for (const c of list(layers.item(l).childNodes).filter(c => c.nodeType === 1)) walk(c);
        }
        global += perMeasure;
    }
    const out = new Set();
    for (const [rel, id, b] of cells) { const col = Math.floor(Math.round(rel) / tpc); if (col >= 0 && col < columns) out.add(`${b}:${id}:${col}`); }
    return { columns, cells: [...out].sort() };
}

// ------------------------------------------------------------ 1. the bundled charts
{
    const charts = [];
    const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.mei')) charts.push(p); } };
    walk(join(ROOT, 'public/drums'));
    let same = 0;
    for (const file of charts) {
        const mei = readFileSync(file, 'utf8');
        const grid = E.buildDrumGrid(timemapOf(mei));
        const old = oldGrid(mei);
        const name = file.slice(ROOT.length + 1);
        const cells = cellsOf(grid);
        const alike = grid.columns === old.columns && JSON.stringify(cells) === JSON.stringify(old.cells);
        if (alike) same++;
        else ok(`1. ${name} shows what it always showed`, false, `${grid.columns} columns for ${old.columns}; ${cells.filter(c => !old.cells.includes(c)).slice(0, 3)} new, ${old.cells.filter(c => !cells.includes(c)).slice(0, 3)} gone`);
        ok(`1. ${name} loops`, grid.loops && E.drumScoreLoops(timemapOf(mei)));
    }
    console.log(`   ${same} of ${charts.length} bundled charts on the grid exactly as before`);
    eq('1. all 518 charts checked', charts.length, 518);
}

// ------------------------------------------------------------ 2. the rolling grid
{
    // Two bars of eighths on the hi-hat, a kick on 1 of bar 1 and a snare on 1 of bar 2.
    const bar = (kick) => `<measure><staff n="1"><layer n="1">${
        Array.from({ length: 8 }, (_, i) => `<note dur="8" pname="g" oct="5" head.shape="x"/>`).join('')}</layer><layer n="2">${
        kick ? '<note dur="1" pname="f" oct="4"/>' : '<note dur="1" pname="c" oct="5"/>'}</layer></staff></measure>`;
    const mei = (bars) => `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1"><music><body><mdiv><score>
<scoreDef><staffGrp><staffDef n="1" lines="5" clef.shape="perc"><meterSig count="4" unit="4"/></staffDef></staffGrp></scoreDef>
<section>${bars.join('')}</section></score></mdiv></body></music></mei>`;
    const two = E.buildDrumGrid(timemapOf(mei([bar(true), bar(false)])));
    eq('2. 16 columns, beats of 4', [two.columns, two.beatColumns], [16, 4]);
    eq('2. rows top to bottom: hi-hat, snare, kick', two.rows.map(r => r.label), ['CH', 'SD', 'BD']);
    const start = two.bars[0].start, step = two.ticksPerColumn;
    eq('2. in the count-in, the first bar waits whole', E.drumGridView(two, start - 10).barOf.every(b => b === 0), true);
    const v = E.drumGridView(two, start + 5 * step + 1);
    eq('2. on step 6 of bar 1: the cursor there, bar 2 behind it, bar 1 ahead', [v.bar, v.column, v.barOf.slice(0, 7)], [0, 5, [1, 1, 1, 1, 1, 0, 0]]);
    const w = E.drumGridView(two, two.bars[1].start + 2 * step);
    eq('2. a short pattern: behind the cursor in its last bar, its first again', [w.bar, w.column, w.barOf.slice(0, 3)], [1, 2, [0, 0, 1]]);
    // Eight bars: no loop, so nothing follows the last.
    const eight = E.buildDrumGrid(timemapOf(mei(Array.from({ length: 8 }, (_, i) => bar(i % 2 === 0)))));
    eq('2. eight bars play through', [eight.loops, E.drumScoreLoops(timemapOf(mei(Array.from({ length: 8 }, () => bar(true)))))], [false, false]);
    const last = E.drumGridView(eight, eight.bars[7].start + 4 * step);
    eq('2. …and after the last bar, nothing', last.barOf.slice(0, 5), [-1, -1, -1, -1, 7]);
    const mid = E.drumGridView(eight, eight.bars[3].start + 8 * step);
    eq('2. mid-score, the next bar follows', mid.barOf.slice(7, 9), [4, 3]);
    // A loop range over bars 3–4: after bar 4 comes bar 3.
    const looped = E.drumGridView(eight, eight.bars[3].start + 3 * step, { start: eight.bars[2].start, end: eight.bars[4].start });
    eq('2. a loop range: after its last bar, its first', looped.barOf.slice(0, 4), [2, 2, 2, 3]);
    // The columns never change, whatever the playhead.
    const widths = new Set([...Array(40).keys()].map(i => E.drumGridView(eight, eight.bars[0].start + i * 97).barOf.length));
    eq('2. the grid keeps its 16 columns throughout', [...widths], [16]);
}

// ------------------------------------------------------------ 3. the grooves
{
    const grooveGrid = (file) => {
        const q = E.quantize(E.readMidi(new Uint8Array(readFileSync(join(ROOT, 'public/groove/midi', file)))));
        return E.buildDrumGrid(timemapOf(E.grooveMei(q, { toBar: 16 })));
    };
    const funk = grooveGrid('drummer1/session1/1_funk_80_beat_4-4.mid');
    eq('3. a funk groove: 16 sixteenths, and it plays through', [funk.columns, funk.loops], [16, false]);
    ok('3. …with the hi-hat foot on its own row, under the kick', funk.rows.at(-1).label === 'HF' && funk.rows.at(-2).label === 'BD');
    const shuffle = grooveGrid('drummer1/session1/239_funk-purdieshuffle_130_beat_4-4.mid');
    eq('3. a Purdie shuffle: 12 triplet eighths, beats of 3', [shuffle.columns, shuffle.beatColumns], [12, 3]);
    const ride = grooveGrid('drummer5/session1/16_rock_136_beat_4-4.mid');
    ok('3. the ride has its row', ride.rows.some(r => r.label === 'RD'));
    const fill = E.buildDrumGrid(timemapOf(E.grooveMei(E.quantize(E.readMidi(new Uint8Array(readFileSync(join(ROOT, 'public/groove/midi/drummer1/session1/240_funk-purdieshuffle_130_fill_4-4.mid'))))))));
    eq('3. a two-bar fill loops', fill.loops, true);
}

if (fails.length) {
    console.log(`✗ ${fails.length} of ${checks} checks failed:`);
    for (const f of fails.slice(0, 40)) console.log('  ' + f);
    process.exit(1);
}
console.log(`✓ ${checks} checks passed`);

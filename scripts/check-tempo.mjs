/**
 * Validation for reading a score's tempo (src/utils/tempo.ts).
 *
 * Every way MEI can state a tempo, run through the real pipeline — Verovio
 * loads the document, extractTimemap resolves positions, the tempo reader
 * derives values — and checked against the value the encoding means:
 *
 *   1. the opening tempo from @midi.bpm, @midi.mspb, @mm (+ unit, + dots),
 *      on <scoreDef> or on a <tempo> element, and from tempo text;
 *   2. where Verovio reads an encoding correctly, we agree with its timemap;
 *      where it does not (@midi.mspb, dotted units, text), we are right and
 *      it is not — each such case is asserted explicitly;
 *   3. tempo changes land on the right tick (measure start, @tstamp,
 *      @startid), including after the viewer injects its count-in measure;
 *   4. the playback maths: the slider scales every section proportionally,
 *      and seconds are integrated across changes.
 *
 * Usage:  node scripts/check-tempo.mjs
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser } from '@xmldom/xmldom';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'tempo-'));
const entry = join(outDir, 'entry.ts');
writeFileSync(entry, `
export * from ${JSON.stringify(join(ROOT, 'src/utils/tempo.ts'))};
export { extractTimemap, TONE_PPQ } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { ensureCountInMeasure } from ${JSON.stringify(join(ROOT, 'src/utils/mei.ts'))};
`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning' });
const { extractTimemap, TONE_PPQ, ensureCountInMeasure, tempoFromText, effectiveBpm, ticksToSeconds, tempoAt } =
  await import(pathToFileURL(join(outDir, 'b.mjs')).href);

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none' });

const fails = [];
let checks = 0;
const eq = (label, got, want, tol = 1e-6) => {
  checks++;
  const ok = typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) <= tol : got === want;
  if (!ok) fails.push(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
};

const note = (p, id = '') => `<note${id ? ` xml:id="${id}"` : ''} dur="4" pname="${p}" oct="4"/>`;
const bar = (n, extra = '', ids = []) =>
  `<measure n="${n}" xml:id="m${n}"><staff n="1"><layer n="1">${['c', 'd', 'e', 'f'].map((p, i) => note(p, ids[i])).join('')}</layer></staff>${extra}</measure>`;
const doc = ({ scoreDef = '', m1 = '', m2 = '', meter = 'meter.count="4" meter.unit="4"', countIn = true, m2ids = [] } = {}) =>
  `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">`
  + `<meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score>`
  + `<scoreDef ${meter} ${scoreDef}><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>`
  + `<section>${countIn ? '<measure n="0" xml:id="m0"><staff n="1"><layer n="1"><rest dur="4"/></layer></staff></measure>' : ''}`
  + `${bar(1, m1)}${bar(2, m2, m2ids)}</section></score></mdiv></body></music></mei>`;

/** Run a document through the viewer's own path. */
function load(mei) {
  const dom = new DOMParser().parseFromString(mei, 'text/xml');
  const injected = ensureCountInMeasure(dom);
  tk.loadData(injected ? dom.toString() : mei);
  const verovio = tk.renderToTimemap({ includeMeasures: true }).filter(e => e.tempo !== undefined);
  return { map: extractTimemap(tk, dom), verovio };
}

// ---------------------------------------------------------- 1. opening tempo
const opening = [
  ['no tempo at all', doc(), null, null],
  ['scoreDef @midi.bpm', doc({ scoreDef: 'midi.bpm="96"' }), 96, 'midi.bpm'],
  ['scoreDef @midi.mspb (MIDI set-tempo)', doc({ scoreDef: 'midi.mspb="600000"' }), 100, 'midi.mspb'],
  ['scoreDef @mm, half-note unit', doc({ scoreDef: 'mm="50" mm.unit="2"' }), 100, 'mm'],
  ['scoreDef @mm, unit from the meter (6/8)', doc({ scoreDef: 'mm="90"', meter: 'meter.count="6" meter.unit="8"' }), 45, 'mm'],
  ['<tempo> @midi.bpm', doc({ m1: '<tempo tstamp="1" staff="1" midi.bpm="150">Allegro</tempo>' }), 150, 'midi.bpm'],
  ['<tempo> @midi.mspb', doc({ m1: '<tempo tstamp="1" staff="1" midi.mspb="750000"/>' }), 80, 'midi.mspb'],
  ['<tempo> dotted quarter = 60', doc({ m1: '<tempo tstamp="1" staff="1" mm="60" mm.unit="4" mm.dots="1"/>' }), 90, 'mm'],
  ['<tempo> dotted half = 40', doc({ m1: '<tempo tstamp="1" staff="1" mm="40" mm.unit="2" mm.dots="1"/>' }), 120, 'mm'],
  ['<tempo> @midi.bpm wins over @mm', doc({ m1: '<tempo tstamp="1" staff="1" midi.bpm="70" mm="140" mm.unit="4"/>' }), 70, 'midi.bpm'],
  ['<tempo> text "♩ = 132"', doc({ m1: '<tempo tstamp="1" staff="1">♩ = 132</tempo>' }), 132, 'text'],
  ['<tempo> SMuFL glyph in <rend>', doc({ m1: '<tempo tstamp="1" staff="1">Andante <rend fontname="VerovioText"></rend> = 72</tempo>' }), 72, 'text'],
  ['<tempo> text "♩. = 60"', doc({ m1: '<tempo tstamp="1" staff="1">♩. = 60</tempo>' }), 90, 'text'],
  ['<tempo> "Allegro" alone', doc({ m1: '<tempo tstamp="1" staff="1">Allegro</tempo>' }), null, null],
];
for (const [label, mei, bpm, source] of opening) {
  const { map } = load(mei);
  const initial = map.tempo?.initial ?? null;
  eq(`${label} → bpm`, initial ? +initial.bpm.toFixed(4) : null, bpm);
  eq(`${label} → source`, initial?.source ?? null, source);
}

// ------------------------------------- 2. where Verovio is right, we agree
for (const [label, mei] of [
  ['scoreDef @midi.bpm', doc({ scoreDef: 'midi.bpm="96"' })],
  ['scoreDef @mm, half-note unit', doc({ scoreDef: 'mm="50" mm.unit="2"' })],
  ['<tempo> @midi.bpm', doc({ m1: '<tempo tstamp="1" staff="1" midi.bpm="150"/>' })],
  ['<tempo> plain @mm', doc({ m1: '<tempo tstamp="1" staff="1" mm="72" mm.unit="4"/>' })],
]) {
  const { map, verovio } = load(mei);
  eq(`agrees with Verovio: ${label}`, map.tempo.initial.bpm, verovio[verovio.length - 1].tempo);
}
// …and where it is wrong, say so, so a Verovio fix is noticed.
{
  const { verovio } = load(doc({ scoreDef: 'midi.mspb="600000"' }));
  eq('Verovio still ignores @midi.mspb (reads the 120 default)', verovio[0].tempo, 120);
  const dotted = load(doc({ m1: '<tempo tstamp="1" staff="1" mm="60" mm.unit="4" mm.dots="1"/>' })).verovio;
  eq('Verovio still misreads a dotted unit (60 → 80, not 90)', dotted[dotted.length - 1].tempo, 80);
}

// ------------------------------------------------------ 3. change positions
const BAR = 4 * TONE_PPQ;
{
  // Count-in (1 beat) + bar 1 = bar 2 starts at 192 + 768.
  const { map, verovio } = load(doc({ scoreDef: 'midi.bpm="100"', m2: '<tempo tstamp="1" staff="1" midi.bpm="60"/>' }));
  eq('change at bar 2: two marks', map.tempo.marks.length, 2);
  eq('change at bar 2: tick', map.tempo.marks[1]?.tick, TONE_PPQ + BAR);
  eq('change at bar 2: Verovio puts it at the same place', map.tempo.marks[1]?.tick, Math.round(verovio[verovio.length - 1].qstamp * TONE_PPQ));
  eq('change at bar 2: bpm', map.tempo.marks[1]?.bpm, 60);
}
{
  const { map } = load(doc({ scoreDef: 'midi.bpm="100"', m2: '<tempo tstamp="3" staff="1" midi.bpm="60"/>' }));
  eq('change at beat 3 of bar 2', map.tempo.marks[1]?.tick, TONE_PPQ + BAR + 2 * TONE_PPQ);
}
{
  const { map } = load(doc({ scoreDef: 'midi.bpm="100"', m2: '<tempo startid="#n7" staff="1" midi.bpm="60"/>', m2ids: ['n5', 'n6', 'n7', 'n8'] }));
  eq('change attached to a note (@startid)', map.tempo.marks[1]?.tick, TONE_PPQ + BAR + 2 * TONE_PPQ);
}
{
  // No count-in in the file: the viewer injects one, and every position moves with it.
  const { map } = load(doc({ countIn: false, scoreDef: 'midi.bpm="100"', m2: '<tempo tstamp="1" staff="1" midi.bpm="60"/>' }));
  eq('injected count-in shifts the change too', map.tempo.marks[1]?.tick, TONE_PPQ + BAR);
}
{
  const { map } = load(doc({ scoreDef: 'midi.bpm="100"', m2: '<tempo tstamp="1" staff="1" midi.bpm="100"/>' }));
  eq('a mark repeating the tempo in force is not a change', map.tempo.marks.length, 1);
}

// ------------------------------------------------------------- 4. the maths
{
  const map = { initial: { tick: 0, bpm: 100, source: 'midi.bpm' },
                marks: [{ tick: 0, bpm: 100, source: 'midi.bpm' }, { tick: 960, bpm: 60, source: 'midi.bpm' }] };
  eq('tempoAt before the change', tempoAt(map, 500), 100);
  eq('tempoAt after the change', tempoAt(map, 960), 60);
  eq('slider at the score tempo: no scaling', effectiveBpm(map, 0, 100), 100);
  eq('half speed halves the opening', effectiveBpm(map, 0, 50), 50);
  eq('…and the later section keeps its proportion', effectiveBpm(map, 1000, 50), 30);
  eq('no score tempo: the slider is absolute', effectiveBpm(null, 1000, 88), 88);
  // 960 ticks at 100 bpm = 5 quarters = 3 s; then 192 ticks at 60 bpm = 1 s.
  eq('seconds across a change', ticksToSeconds(map, 960 + 192, 100), 4);
  eq('seconds at half speed double', ticksToSeconds(map, 960 + 192, 50), 8);
}
eq('text: bare number is ambiguous', tempoFromText('= 120'), null);
eq('text: circa', tempoFromText('♩ = c. 88'), 88);

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} tempo checks`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

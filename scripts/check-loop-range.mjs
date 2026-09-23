/**
 * Validation for the minimap's bar range (src/utils/loopRange.ts) — looped in
 * rhythm and practice, the passage to learn by ear:
 *
 *   1. The bar lines a range can snap to: every real bar, the count-in left
 *      out, the end of the piece last.
 *   2. Dragging a handle snaps to the nearest bar line, keeps at least one bar
 *      between the ends, and dragging back out to the whole piece clears it.
 *   3. The bar labels ("bars 2–3").
 *   4. By ear, a range trains just that passage: its notes only, and the call
 *      starts at once from the passage's first note.
 *   5. On a real bundled piece the bar lines match the score's own measures.
 *
 * The transport loop itself is Tone's (Transport.loop / setLoopPoints) and is
 * checked in the browser, not here.
 *
 * Usage:  node scripts/check-loop-range.mjs
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser } from '@xmldom/xmldom';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'loop-'));
writeFileSync(join(outDir, 'entry.ts'), `
export * from ${JSON.stringify(join(ROOT, 'src/utils/loopRange.ts'))};
export { extractMelody, callTimemap } from ${JSON.stringify(join(ROOT, 'src/utils/earTraining.ts'))};
export { extractTimemap } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { ensureCountInMeasure, ensureNoteIds } from ${JSON.stringify(join(ROOT, 'src/utils/mei.ts'))};
`);
await build({ entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning' });
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);

const fails = [];
let checks = 0;
const eq = (label, got, want) => {
  checks++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fails.push(`${label}: got ${g}, expected ${w}`);
};

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none' });
const load = mei => {
  const dom = new DOMParser().parseFromString(mei, 'text/xml');
  // Exactly what the score views do before loading.
  const countIn = E.ensureCountInMeasure(dom);
  const ids = E.ensureNoteIds(dom);
  tk.loadData(countIn || ids ? dom.toString() : mei);
  return E.extractTimemap(tk, dom);
};

// Three bars of quarter notes: C D E F | G A B C | D E F G.
const bar = notes => `<measure><staff n="1"><layer n="1">${notes.map(([p, o]) => `<note dur="4" pname="${p}" oct="${o}"/>`).join('')}</layer></staff></measure>`;
const mei = `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
<meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score>
<scoreDef meter.count="4" meter.unit="4" midi.bpm="120"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
<section>${bar([['c', 4], ['d', 4], ['e', 4], ['f', 4]])}${bar([['g', 4], ['a', 4], ['b', 4], ['c', 5]])}${bar([['d', 5], ['e', 5], ['f', 5], ['g', 5]])}</section>
</score></mdiv></body></music></mei>`;
const tm = load(mei);
const B = E.barBoundaries(tm);

// ------------------------------------------------ 1. bar lines
// The count-in is one quarter rest (192 ticks), then bars of 768.
eq('1. every real bar line, the count-in left out, the end last', B, [192, 960, 1728, 2496]);
eq('1. the last bar line is the end of the piece', B[B.length - 1], tm.totalTicks);

// ------------------------------------------------ 2. dragging the handles
const r1 = E.dragRangeEnd(B, null, 'start', 1000);
eq('2. dragging the start handle in snaps to the nearest bar line', r1, { start: 960, end: 2496 });
const r2 = E.dragRangeEnd(B, r1, 'end', 1700);
eq('2. …and the end handle too', r2, { start: 960, end: 1728 });
eq('2. the start cannot pass the end: one bar at least', E.dragRangeEnd(B, r2, 'start', 2400), { start: 960, end: 1728 });
eq('2. nor the end the start', E.dragRangeEnd(B, r2, 'end', 0), { start: 960, end: 1728 });
eq('2. dragged past the ends it stops at the piece', E.dragRangeEnd(B, r2, 'end', 99999), { start: 960, end: 2496 });
eq('2. the start stops at the first bar, never in the count-in', E.dragRangeEnd(B, r2, 'start', 0), { start: 192, end: 1728 });
eq('2. back out to the whole piece: no range at all', E.dragRangeEnd(B, { start: 192, end: 1728 }, 'end', 2496), null);

// ------------------------------------------------ 3. labels
eq('3. one bar', E.barSpanLabel(B, r2), 'bar 2');
eq('3. several', E.barSpanLabel(B, { start: 960, end: 2496 }), 'bars 2–3');
eq('3. inRange: start inclusive, end exclusive', [E.inRange(960, r2), E.inRange(1727, r2), E.inRange(1728, r2), E.inRange(959, r2)], [true, true, false, false]);
eq('3. no range is the whole piece', E.inRange(5, null), true);

// ------------------------------------------------ 4. by ear, a passage
// What EarTrainingProvider does: the staff's melody, cut to the range, renumbered.
const passage = E.extractMelody(tm, 1).filter(n => E.inRange(n.tick, r2)).map((n, index) => ({ ...n, index }));
eq('4. bar 2 only: G A B C', passage.map(n => n.midi), [67, 69, 71, 72]);
eq('4. numbered from the passage', passage.map(n => n.index), [0, 1, 2, 3]);
const call = E.callTimemap(passage, 2, 'written', tm.tempo);
eq('4. the call starts at once, from the passage (not bar 1)', call.onsets.map(o => [o.tick, o.notes[0].midi]), [[0, 67], [192, 69]]);
eq('4. …at the tempo in force there', call.tempo.marks[0].bpm, 120);

// ------------------------------------------------ 5. a real piece
{
  const real = load(readFileSync(join(ROOT, 'public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei'), 'utf8'));
  const b = E.barBoundaries(real);
  eq('5. Czerny op. 824/1: one bar line per measure after the count-in, plus the end', b.length, real.measureTicks.size);
  eq('5. …strictly increasing', b.every((t, i) => i === 0 || t > b[i - 1]), true);
  eq('5. …the first at or before the first note', b[0] <= real.onsets[0].tick, true);
  eq('5. …the last at the end of the piece', b[b.length - 1], real.totalTicks);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} loop range checks`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

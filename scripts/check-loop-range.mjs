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
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
export { placeMeasures } from ${JSON.stringify(join(ROOT, 'src/utils/placeMeasures.ts'))};
export * from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};
`);
await build({ entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning' });
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };
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
  const expanded = E.expandRepeats(dom);
  const countIn = E.ensureCountInMeasure(dom);
  const ids = E.ensureNoteIds(dom);
  tk.loadData(expanded || countIn || ids ? dom.toString() : mei);
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

// ------------------------------------------------ 6. the page, as played
// The scrolling views follow the playhead through the measures as played: a
// repeat's second time (Verovio's "-rend2" copies) on the bars it repeats.
// The library's scores have their repeats written out (7.), but a score
// people add may not.
{
  const placed = mei => {
    const dom = new DOMParser().parseFromString(mei, 'text/xml');
    E.ensureCountInMeasure(dom);
    E.ensureNoteIds(dom);
    tk.loadData(dom.toString());
    const tm = E.extractTimemap(tk, dom);
    // The page: the measures as drawn, 100 units each.
    const drawn = [...tm.measureTicks.keys()].filter(id => !/-rend\d+$/.test(id)).sort((a, b) => tm.measureTicks.get(a) - tm.measureTicks.get(b)).map((id, i) => ({ id, x: i * 100, width: 100 }));
    return { tm, drawn, ...E.placeMeasures(drawn, tm) };
  };
  // Two strains, each repeated: ‖ C D :‖: E F :‖ — the first repeat goes back to the start.
  const strains = `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
<meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score>
<scoreDef meter.count="4" meter.unit="4" midi.bpm="120"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
<section>${bar([['c', 4], ['d', 4], ['e', 4], ['f', 4]])}${bar([['g', 4], ['a', 4], ['b', 4], ['c', 5]]).replace('<measure>', '<measure right="rptend">')}${bar([['d', 5], ['e', 5], ['f', 5], ['g', 5]]).replace('<measure>', '<measure left="rptstart">')}${bar([['a', 5], ['g', 5], ['f', 5], ['e', 5]]).replace('<measure>', '<measure right="rptend">')}</section>
</score></mdiv></body></music></mei>`;
  const two = placed(strains);
  const whole = 4 * 192;
  eq('6. two repeated strains: played end to end, to the end of the piece', two.played.every((m, i) => i === 0 || m.startTick === two.played[i - 1].endTick) && two.played.at(-1).endTick === two.tm.totalTicks, true);
  eq('6. …no bar lasts longer than a bar — the one before a repeat sign used to last the whole repeat', Math.max(...two.played.slice(1).map(m => m.endTick - m.startTick)), whole);
  eq('6. …eight bars played on four drawn, and the count-in not played again', [two.played.length, two.drawn.length], [9, 5]);
  const back = two.played.map((m, i) => (i > 0 && m.x < two.played[i - 1].x ? i : -1)).filter(i => i >= 0);
  eq('6. …the page jumps back at each repeat sign: to bar 1, then to the second strain', back.map(i => two.played[i].x / 100), [1, 3]);
  eq('6. …and the page order, for dragging, is each bar its first time through', two.written.map(m => m.endTick - m.startTick).slice(1), Array(4).fill(whole));
  const cz = placed(readFileSync(join(ROOT, 'public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei'), 'utf8'));
  eq('6. no repeats (Czerny): as played is as written', JSON.stringify(cz.played) === JSON.stringify(cz.written), true);
}

// ------------------------------------------------ 7. the library reads straight through
// Its scores have their repeats written out (scripts/expand-repeats.mjs): one
// line to follow, and bars as written are bars as played.
{
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out); else if (name.endsWith('.mei')) out.push(p);
    }
    return out;
  };
  const files = ['piano', 'saxo', 'drums'].flatMap(d => walk(join(ROOT, 'public', d)));
  const repeats = files.filter(f => /\b(left|right)="rpt(start|end|both)"|<ending\b|<repeatMark\b/.test(readFileSync(f, 'utf8')));
  ok(`7. the library's ${files.length} scores have their repeats written out`, files.length > 500 && repeats.length === 0,
    `${repeats.map(f => f.slice(ROOT.length + 8)).join(', ')} — run npm run expand-repeats`);
}

// ------------------------------------------------ 8. repeats written out as a score loads
// A score people bring may have repeats: the viewers and the games write them
// out before anything reads it (utils/expandRepeats.ts), in the order a player
// follows. Plain repeats: the order Verovio plays. First and second endings,
// which Verovio does not play: checked against it playing the order made
// explicit (an <expansion>).
{
  const onsets = text => {
    tk.loadData(text);
    return tk.renderToTimemap({ includeMeasures: true, includeRests: false }).filter(e => e.on?.length)
      .map(e => `${Math.round(e.qstamp * 1000)}:${e.on.map(id => id.replace(/-rend\d+$/, '').replace(/-r\d+$/, '')).sort().join(',')}`);
  };
  const verovioOrder = text => {
    tk.loadData(text);
    const o = [];
    for (const e of tk.renderToTimemap({ includeMeasures: true })) if (e.measureOn && o.at(-1) !== e.measureOn) o.push(e.measureOn);
    return o;
  };
  const score = body => `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
<meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score>
<scoreDef meter.count="4" meter.unit="4" midi.bpm="120"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
<section xml:id="s1">${body}</section></score></mdiv></body></music></mei>`;
  const PITCH = { A: 'c', B: 'd', C: 'e', D: 'f', E: 'g', F: 'a' };
  const m = (id, attrs = '', noIds = false) => `<measure${noIds ? '' : ` xml:id="${id}"`}${attrs}><staff n="1"><layer n="1">${[0, 1, 2, 3].map(k => `<note${noIds ? '' : ` xml:id="${id}n${k}"`} dur="4" pname="${PITCH[id]}" oct="${4 + (k % 2)}"/>`).join('')}</layer></staff></measure>`;
  const read = text => { const dom = new DOMParser().parseFromString(text, 'text/xml'); return { changed: E.expandRepeats(dom), dom, text: dom.toString() }; };
  const explicit = (text, plist) => text.replace('<section xml:id="s1">', `<section xml:id="s1"><expansion xml:id="x1" plist="${plist.map(id => '#' + id).join(' ')}"/>`);
  const once = r => { const ids = [...r.text.matchAll(/xml:id="([^"]+)"/g)].map(x => x[1]); return ids.length === new Set(ids).size; };

  const strains = score(`${m('A')}${m('B', ' right="rptend"')}${m('C', ' left="rptstart"')}${m('D', ' right="rptend"')}`);
  const dom0 = new DOMParser().parseFromString(strains, 'text/xml');
  eq('8. plain repeats: the order a player follows is the one Verovio plays', E.repeatOrder(dom0), verovioOrder(strains));
  const r1 = read(strains);
  eq('8. ‖ A B :‖: C D :‖ written out: A B A B C D C D, no repeat signs, every id once', [r1.changed, r1.dom.getElementsByTagName("measure").length, E.hasRepeats(r1.dom), once(r1)], [true, 8, false, true]);
  eq('8. …and it plays as the original did: the same notes at the same times', onsets(r1.text), onsets(strains));

  const voltas = score(`${m('A', ' left="rptstart"')}${m('B')}<ending xml:id="e1" n="1">${m('C', ' right="rptend"')}</ending><ending xml:id="e2" n="2">${m('D', ' right="end"')}</ending>`);
  eq('8. first and second endings: A B, the first ending, A B again, the second', E.repeatOrder(new DOMParser().parseFromString(voltas, 'text/xml')), ['A', 'B', 'C', 'A-rend2', 'B-rend2', 'D']);
  const r2 = read(voltas);
  eq('8. …written out, the endings unwrapped', [r2.changed, r2.dom.getElementsByTagName("measure").length, r2.dom.getElementsByTagName('ending').length, once(r2)], [true, 6, 0, true]);
  eq('8. …and it plays as Verovio plays that order', onsets(r2.text), onsets(explicit(voltas, ['A', 'B', 'e1', 'A', 'B', 'e2'])));

  const three = score(`${m('A', ' left="rptstart"')}<ending xml:id="e1" n="1, 2">${m('B', ' right="rptend"')}</ending><ending xml:id="e2" n="3">${m('C')}</ending>${m('D', ' right="end"')}`);
  eq('8. a first ending for times one and two, a third for three: three times through, then on', E.repeatOrder(new DOMParser().parseFromString(three, 'text/xml')), ['A', 'B', 'A-rend2', 'B-rend2', 'A-rend3', 'C', 'D']);

  const r3 = read(score(`${m('A', ' right="rptend"', true)}${m('B', '', true)}`));
  eq('8. measures without ids are given them, and written out: A A B', [r3.changed, r3.dom.getElementsByTagName("measure").length, once(r3)], [true, 3, true]);
  const dc = score(`${m('A', ' right="rptend"')}${m('B')}`.replace('</layer></staff></measure>', '</layer></staff><dir staff="1" tstamp="4">D.C. al Fine</dir></measure>'));
  eq('8. a D.C. is left alone, repeats and all: it needs a reader', read(dc).changed, false);
  const plain = readFileSync(join(ROOT, 'public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei'), 'utf8');
  eq('8. a score without repeats is not touched', read(plain).changed, false);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} loop range checks`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

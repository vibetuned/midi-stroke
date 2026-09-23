/**
 * Validation for the rhythm games (src/games/):
 *
 *   1. Lessons: every bar adds up, notes land where the note values say, and
 *      each lesson's notation renders one note head per note, with its id.
 *   2. Songs: every song level builds from its piece, and every note's id is
 *      in the rendered notation of the level's bars — so results can colour it.
 *   3. Judging: the windows, a note's grade, the summary and the tips.
 *   4. The Slingshot course: the probe's ideal path is continuous; it is on
 *      each orbit's entry when the note starts and at the release mark when it
 *      ends; a note turns a quarter circle per beat; orbits never overlap.
 *   5. Calibration: the delay from taps along to clicks.
 *   (1b. The written note shown at each anchor, for every length.)
 *
 * Usage:  node scripts/check-games.mjs
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'games-'));
writeFileSync(join(outDir, 'entry.ts'), `
export * from ${JSON.stringify(join(ROOT, 'src/games/rhythm.ts'))};
export * from ${JSON.stringify(join(ROOT, 'src/games/judge.ts'))};
export * from ${JSON.stringify(join(ROOT, 'src/games/slingshot/course.ts'))};
export { measureLatency } from ${JSON.stringify(join(ROOT, 'src/games/latency.ts'))};
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
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };
const throws = (label, fn) => { checks++; try { fn(); fails.push(`${label}: did not throw`); } catch { /* expected */ } };

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none', breaks: 'auto', pageWidth: 2000, adjustPageHeight: true });

// ------------------------------------------------ 1. lessons
{
  const { notes, length } = E.parseBars('h hr | q. e h', 4);
  eq('1. note values: half at 0, then dotted quarter at 4, eighth at 5.5, half at 6', notes.map(n => [n.start, n.dur]), [[0, 2], [4, 1.5], [5.5, 0.5], [6, 2]]);
  eq('1. rests are gaps, and the level is two bars long', length, 8);
  eq('1. lessons sound at C3', E.LESSONS.every(l => l.notes.every(n => n.midi === 48)), true);
  throws('1. a bar that does not add up is refused', () => E.parseBars('h q', 4));
  throws('1. an unknown value is refused', () => E.parseBars('x x x x', 4));
  for (const l of E.LESSONS) {
    ok(`1. lesson "${l.title}" has notes`, l.notes.length > 0);
    ok(`1. lesson "${l.title}" fills whole bars`, l.length % l.beatsPerBar === 0);
    tk.loadData(l.source.mei);
    const svg = tk.renderToSVG(1, {});
    const heads = (svg.match(/class="note"/g) || []).length;
    eq(`1. lesson "${l.title}": one note head per note`, heads, l.notes.length);
    ok(`1. lesson "${l.title}": every note id is in the notation`, l.notes.every(n => svg.includes(`id="${n.id}"`)));
  }
}

// ------------------------------------------------ 2. songs
for (const song of E.SONGS) {
  const mei = readFileSync(join(ROOT, 'public', song.songKey), 'utf8');
  const dom = new DOMParser().parseFromString(mei, 'text/xml');
  E.ensureCountInMeasure(dom);
  E.ensureNoteIds(dom);
  const prepared = new XMLSerializer().serializeToString(dom);
  tk.loadData(prepared);
  const tm = E.extractTimemap(tk, dom);
  const lv = E.levelFromTimemap(tm, E.SONG_LEVEL_BARS);
  ok(`2. "${song.title}": a melody to play`, lv.notes.length >= 8, `${lv.notes.length} notes`);
  ok(`2. "${song.title}": notes in time order, none overlapping`, lv.notes.every((n, i) => n.dur > 0 && (i === 0 || n.start >= lv.notes[i - 1].start + lv.notes[i - 1].dur - 1e-9)));
  ok(`2. "${song.title}": inside the level`, lv.notes.every(n => n.start >= 0 && n.start + n.dur <= lv.length + 1e-9));
  ok(`2. "${song.title}": a sensible tempo`, lv.bpm >= 40 && lv.bpm <= 200, String(lv.bpm));
  tk.select({ measureRange: `2-${lv.bars + 1}` });
  tk.redoLayout();
  const svg = tk.renderToSVG(1, {});
  const missing = lv.notes.filter(n => !svg.includes(`id="${n.id}"`));
  eq(`2. "${song.title}": every note of the level is in its bars' notation`, missing.length, 0);
  tk.select({});
  console.log(`   ${song.title}: ${lv.bars} bars of ${lv.beatsPerBar} beats, ${lv.notes.length} notes, ♩ = ${Math.round(lv.bpm)}`);
}

// ------------------------------------------------ 1b. the written note at each anchor
{
  const shape = b => { const s = E.noteShape(b); return `${s.head}${s.stem ? '+stem' : ''}${s.flags ? '+' + s.flags + 'flag' : ''}${s.dotted ? '+dot' : ''}`; };
  eq('1b. whole: an open head, no stem', shape(4), 'open');
  eq('1b. half: open, with a stem', shape(2), 'open+stem');
  eq('1b. quarter: filled, with a stem', shape(1), 'filled+stem');
  eq('1b. eighth: one flag; sixteenth: two', [shape(0.5), shape(0.25)], ['filled+stem+1flag', 'filled+stem+2flag']);
  eq('1b. dotted half and dotted quarter', [shape(3), shape(1.5)], ['open+stem+dot', 'filled+stem+dot']);
  eq('1b. a tied note longer than a whole shows as a whole', shape(6), 'open');
  eq('1b. triplets are written as the plain value: eighth, quarter', [shape(1 / 3), shape(2 / 3)], ['filled+stem+1flag', 'filled+stem']);
  eq('1b. every lesson note has its exact shape', E.LESSONS.every(l => l.notes.every(n => {
    const s = E.noteShape(n.dur); return ({ 4: 'whole note', 3: 'dotted half note', 2: 'half note', 1.5: 'dotted quarter note', 1: 'quarter note', 0.5: 'eighth note' })[n.dur] === s.name;
  })), true);
}

// ------------------------------------------------ 3. judging
eq('3. windows', ['perfect', 'good', 'ok', 'miss'].map((_, i) => E.grade([0.04, -0.09, 0.16, 0.3][i], E.PRESS)), ['perfect', 'good', 'ok', 'miss']);
eq('3. no press is a miss', E.grade(null, E.PRESS), 'miss');
eq('3. letting go is judged more leniently', E.grade(0.06, E.RELEASE), 'perfect');
eq('3. a note is the worse of strike and let-go', E.noteGrade({ press: 'perfect', release: 'ok', pressError: 0, releaseError: 0.2 }), 'ok');
{
  const perfect = { press: 'perfect', release: 'perfect', pressError: 0.01, releaseError: -0.01 };
  const early = { press: 'good', release: 'good', pressError: 0, releaseError: -0.1 };
  const miss = { press: 'miss', release: 'miss', pressError: null, releaseError: null };
  const s = E.summarize([perfect, perfect, miss, perfect, early, early]);
  eq('3. best run counts notes without a miss', s.maxCombo, 3);
  eq('3. counts', s.counts, { perfect: 3, good: 2, ok: 0, miss: 1 });
  ok('3. accuracy weights grades', Math.abs(s.accuracy - (6 + 2.8) / 12) < 1e-9, String(s.accuracy));
  eq('3. stars', s.stars, 1);
  const hurried = { press: 'good', release: 'ok', pressError: 0, releaseError: -0.15 };
  const t = E.tip(E.summarize([perfect, hurried, hurried, hurried]));
  ok('3. letting go early, again and again, gets the tip about holding on', /let go .* early/.test(t ?? ''), t);
  eq('3. no tip when it is all on time', E.tip(E.summarize([perfect, perfect])), null);
}

// ------------------------------------------------ 4. the course
for (const level of [...E.LESSONS, { title: 'legato', notes: [{ start: 0, dur: 1 }, { start: 1, dur: 1 }, { start: 2, dur: 0.5 }, { start: 2.5, dur: 1.5 }] }]) {
  const beat = 60 / 90;
  const c = E.buildCourse(level.notes, { beat });
  eq(`4. ${level.title}: one orbit per note`, c.orbits.length, level.notes.length);
  let worst = 0, badStart = 0, badEnd = 0, overlap = 0;
  c.orbits.forEach((o, i) => {
    const at = (t) => E.idealPosition(c, t);
    const entry = E.onOrbit(o, c.radius, o.entry);
    const p0 = at(o.start);
    badStart = Math.max(badStart, Math.hypot(p0.x - entry.x, p0.y - entry.y));
    const exit = E.onOrbit(o, c.radius, o.entry + o.dir * level.notes[i].dur * Math.PI / 2);
    const p1 = at(o.end);
    badEnd = Math.max(badEnd, Math.hypot(p1.x - exit.x, p1.y - exit.y));
    const next = c.orbits[i + 1];
    if (next && Math.hypot(next.cx - o.cx, next.cy - o.cy) < 2 * c.radius - 1e-6) overlap++;
  });
  // Continuity: no jumps bigger than the fastest motion allows over a small step.
  const dt = 0.004, lastT = c.orbits[c.orbits.length - 1].end;
  const maxStep = Math.max(260, c.omega * c.radius) * dt * 1.5 + 1e-6;
  let prev = E.idealPosition(c, -c.leadIn);
  for (let t = -c.leadIn + dt; t <= lastT; t += dt) {
    const p = E.idealPosition(c, t);
    worst = Math.max(worst, Math.hypot(p.x - prev.x, p.y - prev.y) - maxStep);
    prev = p;
  }
  ok(`4. ${level.title}: on the entry when each note starts`, badStart < 1e-6, String(badStart));
  ok(`4. ${level.title}: at the release mark (a quarter turn a beat) when it ends`, badEnd < 1e-6, String(badEnd));
  eq(`4. ${level.title}: neighbouring orbits never overlap`, overlap, 0);
  ok(`4. ${level.title}: the path is continuous`, worst <= 0, `jump ${worst}`);
  ok(`4. ${level.title}: orbits turn in alternate directions`, c.orbits.every((o, i) => i === 0 || o.dir === -c.orbits[i - 1].dir));
}

// ------------------------------------------------ 5. calibration
{
  const clicks = Array.from({ length: 8 }, (_, k) => 10 + k * 0.6);
  const jitter = [0.01, -0.012, 0.004, 0.02, -0.006, 0, 0.008, -0.01];
  const taps = clicks.map((c, k) => c + 0.045 + jitter[k]);
  const m = E.measureLatency(clicks, taps);
  ok('5. the delay is the typical gap between click and tap', m && Math.abs(m.latency - 0.045) <= 0.01, JSON.stringify(m));
  ok('5. a stray tap does not move it', Math.abs(E.measureLatency(clicks, [...taps, 11.1]).latency - 0.045) <= 0.012);
  eq('5. too few taps: no result', E.measureLatency(clicks, taps.slice(0, 3)), null);
  eq('5. taps all over the place: no result', E.measureLatency(clicks, clicks.map((c, k) => c + [0.25, -0.2, 0.1, -0.28, 0.22, -0.1, 0.27, -0.25][k])), null);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} games checks`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

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
 *   6. Matching taps to any rhythm: nearest note, quick notes, extras.
 *   7. The Conductor: chords, tunes, the choir, lessons and folk songs with
 *      their piano, every note in the notation; the beats of a level, each
 *      beat's judging, the song's stretch, the tips, notes graded by beats.
 *   8. Rhythm echo: canons from a line and from two-voice pieces, the
 *      signals and when they reach the satellite, what reaches Earth, the
 *      summary and tips; every Kunz canon in the piano catalog is checked.
 *   9. Groove Builder: the drum charts as parts on the wheel's grid, the run
 *      loop by loop, where a tap lands, a take's score, the summary and tips.
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
export * from ${JSON.stringify(join(ROOT, 'src/games/choir.ts'))};
export * from ${JSON.stringify(join(ROOT, 'src/games/echo.ts'))};
export * from ${JSON.stringify(join(ROOT, 'src/games/groove.ts'))};
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
for (const song of [...E.SONGS, ...E.FOLK_SONGS]) {
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
  if (E.FOLK_SONGS.includes(song)) {
    // A repeat back to the start goes back to the first bar, not to the count-in the viewers add.
    const countInId = [...tm.measureTicks.entries()].sort((a, b) => a[1] - b[1])[0][0];
    ok(`2. "${song.title}": the count-in is not played again at a repeat`, ![...tm.measureTicks.keys()].some(k => k.startsWith(`${countInId}-rend`)));
    // The Slingshot holds every note: the quickest must still be a hold (a sixteenth at 100).
    const quickest = Math.min(...lv.notes.map(n => n.dur)) * 60 / lv.bpm;
    ok(`2. "${song.title}": no note too quick to hold`, quickest >= 0.149, `${Math.round(quickest * 1000)} ms`);
  }
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

// ------------------------------------------------ shared: a piece, prepared as the games prepare it
const loadPiece = (songKey) => {
  const dom = new DOMParser().parseFromString(readFileSync(join(ROOT, 'public', songKey), 'utf8'), 'text/xml');
  E.ensureCountInMeasure(dom);
  E.ensureNoteIds(dom);
  const mei = new XMLSerializer().serializeToString(dom);
  tk.loadData(mei);
  return { dom, mei, tm: E.extractTimemap(tk, dom) };
};
const svgOf = (mei, measureRange) => {
  tk.loadData(mei);
  if (measureRange) { tk.select({ measureRange }); tk.redoLayout(); }
  const svg = tk.renderToSVG(1, {});
  tk.select({});
  return svg;
};

// ------------------------------------------------ 6. matching taps to any rhythm
{
  const m = E.matchOnsets([0, 1, 2], [0.01, 1.02, 1.97]);
  eq('6. taps on the notes: each matched, no extras', [m.errors.map(e => Math.round(e * 100)), m.extras], [[1, 2, -3], 0]);
  const quick = E.matchOnsets([0, 0.15], [0.0, 0.07]);
  eq('6. two quick notes, two quick taps: the second goes to the free neighbour', [quick.errors.map(e => Math.round(e * 100)), quick.extras], [[0, -8], 0]);
  const far = E.matchOnsets([0, 1], [0.5]);
  eq('6. a tap far from every note is an extra, and the notes are missed', [far.errors, far.extras], [[null, null], 1]);
  const twice = E.matchOnsets([0], [0.02, -0.01]);
  eq('6. two taps on one note: the closer counts, the other is an extra', [Math.round(twice.errors[0] * 100), twice.extras], [-1, 1]);
}

// ------------------------------------------------ 7. the Conductor
{
  eq('7. pitches by name', [E.pitchOf('C4'), E.pitchOf('F#3'), E.pitchOf('Bb3'), E.pitchOf('A2')], [60, 54, 58, 45]);
  eq('7. a black key is written with a sharp', E.spell(61), { pname: 'c', oct: 4, accid: 's' });
  throws('7. a tune with too few pitches is refused', () => E.parseBars('q q h', 4, [60, 62]));
  throws('7. …and one with too many', () => E.parseBars('w', 4, [60, 62]));
  eq('7. chords: C, Am, G7', [E.chordTones('C'), E.chordTones('Am'), E.chordTones('G7')], [[0, 4, 7], [9, 0, 4], [7, 11, 2, 5]]);
  throws('7. an unknown chord is refused', () => E.chordTones('H'));
  const bk = E.chordBacking('C | F G', 4);
  eq('7. a chord a bar, or two sharing it: root low and the chord above', bk.map(n => [n.start, n.dur, n.midi]),
    [[0, 4, 36], [0, 4, 48], [0, 4, 52], [0, 4, 55], [4, 2, 41], [4, 2, 53], [4, 2, 57], [4, 2, 48], [6, 2, 43], [6, 2, 55], [6, 2, 59], [6, 2, 50]]);
  eq('7. one singer per pitch, lowest first', E.singersOf([{ midi: 67 }, { midi: 60 }, { midi: 64 }, { midi: 60 }]).map(x => x.name), ['C', 'E', 'G']);
  eq('7. a tune sung as written…', E.choirShift([{ midi: 60 }, { midi: 67 }]), 0);
  eq('7. …unless it sits too high for a choir', E.choirShift([{ midi: 84 }, { midi: 88 }, { midi: 91 }]), -12);
  eq('7. …or too low', E.choirShift([{ midi: 33 }, { midi: 36 }]), 12);
  for (const l of E.CHOIR_LESSONS) {
    const singers = E.singersOf(l.notes, E.choirShift(l.notes));
    ok(`7. "${l.title}": a few singers, a real tune`, singers.length >= 3 && singers.length <= 9, String(singers.length));
    eq(`7. "${l.title}": sung where it is written`, E.choirShift(l.notes), 0);
    ok(`7. "${l.title}": the piano plays every bar`, Array.from({ length: l.length / l.beatsPerBar }, (_, b) => b).every(b => l.backing.some(n => n.start >= b * l.beatsPerBar && n.start < (b + 1) * l.beatsPerBar)));
    ok(`7. "${l.title}": the piano stays inside the level`, l.backing.every(n => n.start >= 0 && n.start + n.dur <= l.length + 1e-9));
    const svg = svgOf(l.source.mei);
    eq(`7. "${l.title}": one note head per note, on a real staff`, [(svg.match(/class="note"/g) || []).length, l.notes.every(n => svg.includes(`id="${n.id}"`))], [l.notes.length, true]);
  }
  eq('7. the first lesson has three singers: C, E, G', E.singersOf(E.CHOIR_LESSONS[0].notes).map(x => x.name), ['C', 'E', 'G']);
  // Conducting, a beat at a time.
  const byId = id => E.CHOIR_LESSONS.find(l => l.id === id);
  const first = E.choirBeats(byId('first-voices'));
  eq('7. every beat of the level is a hold, the rests too', first.length, 32);
  eq('7. a half note: sung in the first beat, held over into the second, then a rest', first.slice(0, 4).map(b => [b.starts, b.held]), [[[0], null], [[], 0], [[], null], [[], null]]);
  const whole = E.choirBeats(byId('basses'));
  eq('7. a whole note is four holds on one note', whole.slice(0, 4).map(b => [b.starts.length, b.held]), [[1, null], [0, 0], [0, 0], [0, 0]]);
  eq('7. two eighths: two notes in one hold', E.choirBeats(byId('runs'))[0].starts.length, 2);
  eq('7. a dotted quarter carries into the next beat, and the eighth starts inside it', E.choirBeats(byId('dotted')).slice(0, 2).map(b => [b.starts, b.held]), [[[0], null], [[1], 0]]);
  eq('7. the note sounding at a point of the song, or none in a rest', [E.noteAt(byId('first-voices'), 1.5), E.noteAt(byId('first-voices'), 2.5)], [0, null]);
  const short = E.choirBeats({ notes: [{ start: 0, dur: 1.5 }], length: 1.5, beatsPerBar: 4 });
  eq('7. a short last beat is only as long as it is', short.map(b => b.length), [1, 0.5]);
  // 6/8: counted in eighths, or in dotted quarters when quick.
  eq('7. the counted beat: quarters in 4/4 and 2/4, eighths in 3/8 and a slow 6/8, dotted quarters in a quick 6/8 or 12/8',
    [E.pulseOf({ count: 4, unit: 4 }, 100), E.pulseOf({ count: 2, unit: 4 }, 60), E.pulseOf({ count: 3, unit: 8 }, 100), E.pulseOf({ count: 6, unit: 8 }, 60), E.pulseOf({ count: 6, unit: 8 }, 120), E.pulseOf({ count: 12, unit: 8 }, 90)],
    [1, 1, 0.5, 0.5, 1.5, 1.5]);
  const jig = { notes: [{ start: 0, dur: 1 }, { start: 1, dur: 0.5 }, { start: 1.5, dur: 1 }, { start: 2.5, dur: 0.5 }], length: 3 };
  eq('7. a bar of 6/8 in two: two holds, each a quarter and an eighth', E.choirBeats({ ...jig, beatsPerBar: 3, pulse: 1.5 }).map(b => [b.start, b.length, b.starts, b.held]), [[0, 1.5, [0, 1], null], [1.5, 1.5, [2, 3], null]]);
  eq('7. …and in six: six holds, the quarters over two', E.choirBeats({ ...jig, beatsPerBar: 3, pulse: 0.5 }).map(b => [b.starts, b.held]), [[[0], null], [[], 0], [[1], null], [[2], null], [[], 2], [[3], null]]);
  eq('7. the tempo as it is counted', [E.tempoMark(96), E.tempoMark(60, 0.5), E.tempoMark(108, 1.5)], ['♩ = 96', '♪ = 120', '♩. = 72']);
  {
    // Beats laid on the bar lines, a pickup counted back from the one after it.
    const c = (barLines, length, beatsPerBar = 2, pulse = 1) => E.countingOf({ beatsPerBar, length, barLines, pulse });
    const eighthUp = c([0, 0.5, 2.5], 4.5);
    eq('7. an eighth before a bar of 2/4: its beat starts an eighth early, then a beat on every bar line', eighthUp.beats.map(b => [b.start, b.inBar, b.bar]), [[-0.5, 1, 1], [0.5, 0, 2], [1.5, 1, 2], [2.5, 0, 3], [3.5, 1, 3]]);
    eq('7. …counted in "one two one", in on two', [eighthUp.countIn, [-3, -2, -1].map(k => eighthUp.inBar(k))], [3, [0, 1, 0]]);
    const quarterUp = c([0, 1, 4], 7, 3);
    eq('7. a quarter before a bar of 3/4: "one two", in on three', [quarterUp.beats[0].start, quarterUp.beats[0].inBar, quarterUp.countIn], [0, 2, 5]);
    eq('7. no pickup: a bar counted in — two of 2/4', [c(undefined, 8, 4).countIn, c(undefined, 6, 3).countIn, c(undefined, 4, 2).countIn, c(undefined, 6, 3, 0.5).countIn], [4, 3, 4, 6]);
    eq('7. an eighth before a bar of 6/8 in six: the pickup is a beat, five counted in', [c([0, 0.5], 3.5, 3, 0.5).beats[0].start, c([0, 0.5], 3.5, 3, 0.5).countIn], [0, 5]);
    const strains = c([0, 1, 3, 5, 5.5, 7.5], 9.5);
    eq('7. a strain ending on a one-beat bar, the next with an eighth pickup: the beats restart on its bar line, one of them short', strains.beats.map(b => [b.start, b.length]), [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 0.5], [5.5, 1], [6.5, 1], [7.5, 1], [8.5, 1]]);
    const through = c([0, 0.5, 2.5, 4, 4.5, 6.5], 8.5);
    eq('7. …ending on a bar and a half, the pickup making it up: beaten straight through the double bar', through.beats.map(b => [b.start, b.inBar, b.bar]), [[-0.5, 1, 1], [0.5, 0, 2], [1.5, 1, 2], [2.5, 0, 3], [3.5, 1, 3], [4.5, 0, 5], [5.5, 1, 5], [6.5, 0, 6], [7.5, 1, 6]]);
    const beats = E.choirBeats({ notes: [{ start: 0, dur: 0.5 }, { start: 0.5, dur: 1 }, { start: 1.5, dur: 1 }], length: 2.5, beatsPerBar: 2, barLines: [0, 0.5] });
    eq('7. conducting it: the first hold has the pickup in its second half, the next begins on the bar line', beats.map(b => [b.start, b.starts]), [[-0.5, [0]], [0.5, [1]], [1.5, [2]]]);
  }
  const g = r => [r.press, r.release];
  eq('7. the first beat comes in against the count-in', g(E.beatResult(0.03, -E.LIFT)), ['perfect', 'perfect']);
  eq('7. after that, against a beat after the last press: on it, a little late, a pause', [0.02, 0.08, 0.4].map(e => E.beatResult(e, -E.LIFT).press), ['perfect', 'good', 'miss']);
  eq('7. the let-go: a lift before the ring, right on it, early, far too long', [-E.LIFT, 0, -0.25, 0.3].map(h => E.beatResult(0, h).release), ['perfect', 'perfect', 'ok', 'miss']);
  {
    const beat = 0.75;
    const early = Array.from({ length: 8 }, () => E.beatResult(0, -0.2));
    const s = E.summarizeConductor(early);
    ok('7. letting go early every beat, but coming in on time: the song keeps its length', Math.abs(s.stretch + 0.2) < 1e-9, String(s.stretch));
    ok('7. …and the tip says to hold until the ring closes', /before the ring closes/.test(E.conductorTip(s) ?? ''), E.conductorTip(s));
    const dragging = Array.from({ length: 8 }, (_, k) => E.beatResult(k === 0 ? 0 : 0.1, -E.LIFT));
    const sd = E.summarizeConductor(dragging);
    ok('7. each beat 100 ms late: the song comes out 0.7 s long, and the tip says it drags', Math.abs(sd.stretch - (7 * 0.1 - E.LIFT)) < 1e-9 && /drags/.test(E.conductorTip(sd) ?? ''), `${sd.stretch} ${E.conductorTip(sd)}`);
    // Beat 1 held on (so beat 2 comes in late: that is the hold, not a pause), beat 5 cut short, a pause before beat 4.
    const bumpy = E.summarizeConductor([0, 1, 2, 3, 4, 5, 6, 7].map(k => E.beatResult(k === 4 ? 0.5 : k === 2 ? 0.49 : 0, k === 1 ? 0.45 : k === 5 ? -0.3 : -E.LIFT)));
    eq('7. what went wrong, by kind', bumpy.incidents, { heldOn: 1, cut: 1, lateIn: 1, rushed: 0 });
    eq('7. …and the tip says so, not that all went well', E.conductorTip(bumpy), 'A singer ran out of breath once, the choir was cut off once and the choir waited for you once. Let go as the ring closes.');
    const tight = E.summarizeConductor(Array.from({ length: 8 }, () => E.beatResult(0, -E.LIFT)));
    eq('7. a beat on every beat, let go a lift before each: every beat perfect', tight.counts.perfect, 8);
    ok('7. …and the song keeps its written length', Math.abs(tight.stretch + E.LIFT) < 1e-9 && Math.abs(tight.stretch) < 0.1 * beat);
    const bs = E.choirBeats(byId('basses'));
    const res = bs.map((_, k) => E.beatResult(0, k === 2 ? 0.3 : 0));
    const ng = E.noteGradesFromBeats(byId('basses'), bs, res);
    eq('7. a whole note takes the worst of its four beats; the next note is untouched', [ng[0], ng[1]], ['miss', 'perfect']);
  }
  for (const song of E.CHOIR_SONGS) {
    const { mei, tm } = loadPiece(song.songKey);
    const lv = E.levelFromTimemap(tm, E.SONG_LEVEL_BARS);
    const singers = E.singersOf(lv.notes, E.choirShift(lv.notes));
    ok(`7. "${song.title}": a tune for the choir`, lv.notes.length >= 12, String(lv.notes.length));
    ok(`7. "${song.title}": a piano part, inside the level`, lv.backing.length >= 8 && lv.backing.every(n => n.start >= 0 && n.start + n.dur <= lv.length + 1e-9), String(lv.backing.length));
    ok(`7. "${song.title}": the piano never doubles the tune`, !lv.backing.some(b => lv.notes.some(n => n.id === b.id)));
    ok(`7. "${song.title}": no more singers than a choir has rows for`, singers.length >= 3 && singers.length <= 12, String(singers.length));
    const svg = svgOf(mei, `2-${lv.bars + 1}`);
    eq(`7. "${song.title}": every note of the tune is in its bars' notation`, lv.notes.filter(n => !svg.includes(`id="${n.id}"`)).length, 0);
    console.log(`   ${song.title}: ${lv.bars} bars, ${lv.notes.length} notes for ${singers.length} singers, ${lv.backing.length} for the piano`);
  }
  for (const song of E.CHOIR_FOLK_SONGS) {
    const { dom, mei, tm } = loadPiece(song.songKey);
    const lv = E.levelFromTimemap(tm, E.SONG_LEVEL_BARS);
    const sig = dom.getElementsByTagName('meterSig').item(0);
    const pulse = E.pulseOf({ count: Number(sig.getAttribute('count')), unit: Number(sig.getAttribute('unit')) }, lv.bpm);
    const level = { ...lv, pulse };
    const beats = E.choirBeats(level);
    const meter = E.countingOf(level);
    const singers = E.singersOf(lv.notes, E.choirShift(lv.notes));
    const beatSec = pulse * 60 / lv.bpm;
    ok(`7. "${song.title}": a tune for the choir`, lv.notes.length >= 12, String(lv.notes.length));
    eq(`7. "${song.title}": a single line — the choir sings alone`, lv.backing.length, 0);
    ok(`7. "${song.title}": no more singers than a choir has rows for`, singers.length >= 3 && singers.length <= 12, String(singers.length));
    ok(`7. "${song.title}": a beat a conductor can hold (0.4 to 1 s)`, beatSec >= 0.4 && beatSec <= 1, `${beatSec.toFixed(2)} s`);
    ok(`7. "${song.title}": whole bars of beats`, Number.isInteger(lv.beatsPerBar / pulse));
    ok(`7. "${song.title}": every downbeat on a bar line`, beats.filter(b => b.inBar === 0).every(b => lv.barLines.some(t => Math.abs(b.start - t) < 1e-6)));
    ok(`7. "${song.title}": every full bar beaten from its bar line`, lv.barLines.every((t, i) => Math.abs((lv.barLines[i + 1] ?? lv.length) - t - lv.beatsPerBar) > 1e-6 || beats.some(b => Math.abs(b.start - t) < 1e-6 && b.inBar === 0)));
    ok(`7. "${song.title}": the beats, end to end`, beats.every((b, k) => k === 0 || Math.abs(beats[k - 1].start + beats[k - 1].length - b.start) < 1e-6) && Math.abs(beats.at(-1).start + beats.at(-1).length - lv.length) < 1e-6);
    ok(`7. "${song.title}": every note begins in exactly one beat`, lv.notes.every((_, i) => beats.filter(b => b.starts.includes(i)).length === 1));
    const svg = svgOf(mei, `2-${lv.bars + 1}`);
    eq(`7. "${song.title}": every note of the tune is in its bars' notation`, lv.notes.filter(n => !svg.includes(`id="${n.id}"`)).length, 0);
    const pickup = lv.barLines.length > 1 && lv.barLines[1] < lv.beatsPerBar ? lv.barLines[1] : 0;
    const short = beats.filter(b => b.length < pulse - 1e-6).length;
    console.log(`   ${song.title}: ${lv.bars} bars${pickup ? ` (a pickup of ${pickup})` : ''}${short ? `, ${short} short beats` : ''}, ${lv.notes.length} notes for ${singers.length} singers, ${E.tempoMark(lv.bpm, pulse)} (${beats.length} beats, ${meter.countIn} counted in)`);
  }
}

// ------------------------------------------------ 8. Rhythm echo
{
  const line = E.parseBars('q q h | w', 4, [60, 64, 67, 60]).notes;
  const c = E.canonFromLine(line, 4, 2, 1);
  eq('8. a line as a canon: the star sings it an octave up…', c.calls.map(n => [n.start, n.midi]), [[0, 72], [1, 76], [2, 79], [4, 72]]);
  eq('8. …you sing it a bar behind, as written, and the level runs a bar longer', [c.answers.map(n => [n.start, n.midi]), c.bars], [[[4, 60], [5, 64], [6, 67], [8, 60]], 3]);
  for (const l of E.CANON_LESSONS) {
    const shift = l.distance * l.beatsPerBar;
    ok(`8. "${l.title}": your voice is the star's, ${l.distance === 1 ? 'a bar' : `${l.distance} bars`} behind`, l.answers.length === l.calls.length && l.answers.every((a, k) => Math.abs(a.start - l.calls[k].start - shift) < 1e-9 && a.dur === l.calls[k].dur && a.midi === l.calls[k].midi - 12));
    const packets = E.packetsOf(l);
    ok(`8. "${l.title}": a signal for every note, arriving at the satellite as it is due, none hollow`, packets.length === l.answers.length && packets.every(p => p.answer !== null && Math.abs(p.arrive - l.answers[p.answer].start) < 1e-9 && Math.abs(p.arrive - p.emit - shift) < 1e-9));
    const svg = svgOf(l.notation.mei);
    eq(`8. "${l.title}": one note head per note, every answer in the notation`, [(svg.match(/class="note"/g) || []).length, l.answers.every(a => svg.includes(`id="${a.id}"`))], [l.answers.length, true]);
  }
  eq('8. the lessons: a bar behind, then a round two bars behind, and two bars behind to finish', E.CANON_LESSONS.map(l => l.distance), [1, 1, 1, 1, 2, 1, 1, 1, 2]);
  eq('8. Frère Jacques: 32 notes, a round at two bars', (l => [l.answers.length, l.distance, l.bars])(E.CANON_LESSONS.find(l => l.id === 'frere-jacques')), [32, 2, 10]);

  // What happened to each bolt.
  const r = (press, release, pe, re) => ({ press, release, pressError: pe, releaseError: re });
  eq('8. perfect and good are intercepted', [E.outcomeOf(r('perfect', 'perfect', 0, 0)), E.outcomeOf(r('good', 'perfect', 0.08, 0))], ['intercepted', 'intercepted']);
  eq('8. let go too soon, or never fired: down on the city', [E.outcomeOf(r('perfect', 'ok', 0, -0.18)), E.outcomeOf(r('miss', 'miss', null, null)), E.outcomeOf(r('perfect', 'miss', 0, -0.4))], ['city', 'city', 'city']);
  eq('8. held too long, or on until the game let go: the turret overheats', [E.outcomeOf(r('perfect', 'ok', 0, 0.18)), E.outcomeOf(r('good', 'miss', 0.06, null))], ['turret', 'turret']);
  {
    const all = E.summarizeEcho(Array.from({ length: 6 }, () => r('perfect', 'perfect', 0.01, -0.01)));
    eq('8. everything intercepted: counted, and the tip says so', [all.intercepted, all.city, all.turret, /second voice/.test(E.echoTip(all) ?? '')], [6, 0, 0, true]);
    const early = E.summarizeEcho(Array.from({ length: 6 }, () => r('perfect', 'good', 0, -0.1)));
    ok('8. letting go early every time gets the tip about firing until the tail has crossed', /let go .* early.*tail/.test(E.echoTip(early) ?? ''), E.echoTip(early));
    const long = E.summarizeEcho(Array.from({ length: 6 }, () => r('perfect', 'good', 0, 0.1)));
    ok('8. …and holding on, the one about the turrets overheating', /overheat/.test(E.echoTip(long) ?? ''), E.echoTip(long));
    const hits = E.summarizeEcho([r('perfect', 'perfect', 0, 0), r('miss', 'miss', null, null), r('perfect', 'perfect', 0, 0), r('miss', 'miss', null, null)]);
    ok('8. two bolts never fired on: they reached the cities', /2 bolts reached the cities/.test(E.echoTip(hits) ?? ''), E.echoTip(hits));
  }
  {
    // The cities: one a pitch of your voice, lowest on the left; the dome as your part ends.
    const fj = E.CANON_LESSONS.find(l => l.id === 'frere-jacques');
    eq('8. Frère Jacques: seven cities, G3 to A4, one per pitch of your voice', E.citiesOf(fj).map(c => c.name), ['G', 'C', 'D', 'E', 'F', 'G', 'A']);
    ok('8. …the dome charged as the last note of your voice ends: the end of the round', E.domeAt(fj) === fj.bars * fj.beatsPerBar, String(E.domeAt(fj)));
    ok('8. every bolt carries its pitch', E.CANON_LESSONS.every(l => E.packetsOf(l).every(p => typeof p.midi === 'number')));
  }

  // The library's canons, from the catalog — every one there is checked.
  const catalog = JSON.parse(readFileSync(join(ROOT, 'public/piano_files.json'), 'utf8'));
  const canons = E.canonsFrom(catalog);
  ok('8. the canons come from the piano catalog, in order, named by number', canons.length >= 7 && canons[0].title === 'Kunz · Canon 1' && canons[6].title === 'Kunz · Canon 7', canons.map(x => x.title).join(', '));
  const expect = { 1: [1, 1], 5: [2, 1], 7: [2, 2] };   // canon: [distance in bars, the staff that answers]
  for (const song of canons) {
    const { mei, tm } = loadPiece(song.songKey);
    const canon = E.canonFromTimemap(tm);
    ok(`8. "${song.title}": a canon`, canon !== null);
    if (!canon) continue;
    ok(`8. "${song.title}": a strict one — your voice imitates the star's`, canon.imitation >= 0.8, canon.imitation.toFixed(2));
    const n = parseInt(song.songKey.match(/(\d+)-canon/)?.[1] ?? '0', 10);
    if (expect[n]) {
      const answersHigh = canon.answers[0].midi > canon.calls[0].midi;
      eq(`8. "${song.title}": ${expect[n][0]} bar(s) behind, the ${expect[n][1] === 1 ? 'upper' : 'lower'} voice answering`, [canon.distance, answersHigh ? 1 : 2], expect[n]);
    }
    const level = { ...canon, id: 'x', title: song.title, detail: '', notation: { mei, bars: canon.bars } };
    const packets = E.packetsOf(level);
    const hollow = packets.filter(p => p.answer === null);
    ok(`8. "${song.title}": a signal for every note of your voice, on time`, level.answers.every((a, k) => packets.some(p => p.answer === k && Math.abs(p.arrive - a.start) < 1e-9)));
    ok(`8. "${song.title}": the hollow ones are the star's free ending`, hollow.every(p => p.emit >= (canon.bars - canon.distance - 2) * canon.beatsPerBar), hollow.map(p => p.emit).join(' '));
    // (One that comes a little sooner fades at the horizon: the dome is not up yet.)
    ok(`8. "${song.title}": they reach the horizon in your last bar or after, as the dome goes up`, hollow.every(p => p.arrive >= E.domeAt(level) - canon.beatsPerBar - 1e-9), `${hollow.map(p => p.arrive).join(' ')} vs ${E.domeAt(level)}`);
    ok(`8. "${song.title}": a city for every pitch, and not too many for the ground`, E.citiesOf(level).length >= 3 && E.citiesOf(level).length <= 12, String(E.citiesOf(level).length));
    const svg = svgOf(mei, `2-${canon.bars + 1}`);
    eq(`8. "${song.title}": every note of your voice is in the notation`, canon.answers.filter(a => !svg.includes(`id="${a.id}"`)).length, 0);
    console.log(`   ${song.title}: ${canon.bars} bars, ${canon.distance} behind, ${canon.answers.length} notes to relay, ${hollow.length} hollow, imitation ${(canon.imitation * 100).toFixed(0)} %`);
  }
  {
    const { tm } = loadPiece(E.SONGS[0].songKey);
    eq('8. a one-line song is no canon', E.canonFromTimemap(tm), null);
  }
}

// ------------------------------------------------ 9. Groove Builder
{
  eq('9. the grid: sixteenths, even for a groove of eighths', E.gridOf([0, 1, 2, 3], 4), 0.25);
  eq('9. …triplets make 24 steps a bar', E.gridOf([0, 1 / 3, 2 / 3], 4), 1 / 6);
  eq('9. …twelve-eight on eighths: 12 steps', E.gridOf([0, 1.5, 2.5], 6, 1.5), 0.5);
  const meterOf = dom => {
    const sig = dom.getElementsByTagName('meterSig').item(0), def = dom.getElementsByTagName('scoreDef').item(0);
    const count = parseInt(sig?.getAttribute('count') ?? def?.getAttribute('meter.count') ?? '4', 10), unit = parseInt(sig?.getAttribute('unit') ?? def?.getAttribute('meter.unit') ?? '4', 10);
    return { beatsPerBar: count * 4 / unit, pulse: unit === 8 && count % 3 === 0 ? 1.5 : 1 };
  };
  const built = {};
  for (const entry of E.GROOVES) {
    const { dom, tm } = loadPiece(entry.songKey);
    const { beatsPerBar, pulse } = meterOf(dom);
    const g = E.grooveFromTimemap(tm, beatsPerBar, pulse);
    ok(`9. "${entry.title}": parts to build`, g && g.layers.length >= 2, g ? String(g.layers.length) : 'none');
    if (!g) continue;
    const level = { ...g, id: entry.songKey, title: entry.title, detail: '', bpm: entry.bpm, pulse };
    built[entry.title] = level;
    eq(`9. "${entry.title}": the kick comes in first`, g.layers[0].voice, 'kick');
    ok(`9. "${entry.title}": every hit on a step of the wheel`, g.layers.every(l => l.hits.every(h => h >= 0 && h < g.loopBeats && Math.abs(h / g.step - Math.round(h / g.step)) < 1e-3)));
    ok(`9. "${entry.title}": 12, 16, 24 or 32 steps round the wheel`, [12, 16, 24, 32].includes(E.stepsOf(level)), String(E.stepsOf(level)));
    ok(`9. "${entry.title}": a tempo you can tap`, entry.bpm >= 60 && entry.bpm <= 140);
    const beat = 60 / entry.bpm;
    const fastest = Math.min(...g.layers.map(l => Math.min(...l.hits.slice(1).map((h, k) => (h - l.hits[k]) * beat), Infinity)));
    ok(`9. "${entry.title}": no part faster than ~6 taps a second`, fastest >= 0.155, `${Math.round(fastest * 1000)} ms`);
    console.log(`   ${entry.title}: ${g.layers.map(l => `${l.label} ${l.hits.length}`).join(', ')} — ${E.stepsOf(level)} steps`);
  }
  const rock = built.Rock;
  if (rock) {
    eq('9. Rock: kick on every beat, snare on two and four, hi-hat in eighths', rock.layers.map(l => [l.voice, l.hits]),
      [['kick', [0, 1, 2, 3]], ['snare', [1, 3]], ['hatClosed', [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]]]);
    eq('9. …on the wheel, the kick\'s steps', E.targetCells(rock, 0), [0, 4, 8, 12]);
    eq('9. the run: a bar counted in, a loop for each part, the groove twice, then the end',
      [0, 1, 2, 3, 4, 5, 6].map(j => { const t = E.turnOf(rock, j); return t.kind + ('layer' in t ? t.layer : ''); }),
      ['countin', 'record0', 'record1', 'record2', 'final', 'final', 'end']);
    const stepSec = 60 / 96 / 4;
    const early = E.cellOfTap(16 * stepSec - 0.03, stepSec, 16);
    eq('9. a tap a hair before a loop is that loop\'s first step', [early.loop, early.cell, Math.round(early.error * 1000)], [1, 0, -30]);
    const off = E.cellOfTap(16 * stepSec + 4 * stepSec + 0.7 * stepSec, stepSec, 16);
    eq('9. …and one late by more than half a step lands on the next step: the wrong one', [off.loop, off.cell], [1, 5]);
    const take = new Map();
    E.addTap(take, 4, 0.04); E.addTap(take, 4, -0.01);
    eq('9. a step keeps the tap closest to it', take.get(4), -0.01);
    const perfect = new Map([[0, 0.005], [4, -0.01], [8, 0], [12, 0.01]]);
    eq('9. the kick, every step hit: all of it', E.scoreTake(rock, 0, perfect).accuracy, 1);
    const faulty = E.scoreTake(rock, 0, new Map([[0, 0], [5, 0], [8, 0], [12, 0]]));
    eq('9. one hit a step late: a step missing and a step wrong, in the groove for good', [faulty.missed, faulty.wrong, faulty.correct.length], [[4], [5], 3]);
    ok('9. …and it costs', faulty.accuracy < 0.7, String(faulty.accuracy));
    const hats = new Map([0, 2, 4, 6, 8, 10, 12, 14].map(c => [c, -0.07]));
    const s = E.summarizeGroove(rock, [perfect, new Map([[4, 0], [12, 0]]), hats]);
    ok('9. parts weigh by their hits', Math.abs(s.accuracy - (4 * 1 + 2 * 1 + 8 * 0.7) / 14) < 1e-9, String(s.accuracy));
    ok('9. every hit on its step but early: the tip says you play ahead', /ahead of the beat/.test(E.grooveTip(rock, s) ?? ''), E.grooveTip(rock, s));
    const withWrong = E.summarizeGroove(rock, [faulty && new Map([[0, 0], [5, 0], [8, 0], [12, 0]]), new Map([[4, 0], [12, 0]]), hats]);
    ok('9. a wrong step: the tip names the part, and says it stayed', /kick landed on the wrong step once, and those hits stayed/.test(E.grooveTip(rock, withWrong) ?? ''), E.grooveTip(rock, withWrong));
    eq('9. an untouched part is all missing', E.scoreTake(rock, 1, new Map()).missed, [4, 12]);
  }
}

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} games checks`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

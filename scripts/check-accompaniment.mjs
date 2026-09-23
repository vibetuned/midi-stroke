/**
 * Validation for lining a recording up with a score
 * (src/utils/accompanimentSync.ts):
 *
 *   1. Bar 1 sits at the offset, and the score's end one score-length later.
 *   2. The score's length scales with the tempo, tempo changes included:
 *      every section keeps its proportion, as with the tempo slider.
 *   3. Dragging the end sets the tempo that puts the end there, bar 1 staying
 *      put — and it round-trips.
 *   4. The recording may be longer than the score at both ends, or shorter.
 *   5. The first guess starts the score where the sound starts.
 *   6. The waveform's peaks are exact, zoomed out or in.
 *   7. Which songs keep their accompaniment on the device.
 *
 * Usage:  node scripts/check-accompaniment.mjs
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
const outDir = mkdtempSync(join(tmpdir(), 'acc-'));
writeFileSync(join(outDir, 'entry.ts'), `
export * from ${JSON.stringify(join(ROOT, 'src/utils/accompanimentSync.ts'))};
export { barBoundaries } from ${JSON.stringify(join(ROOT, 'src/utils/loopRange.ts'))};
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
const near = (label, got, want, tol = 1e-6) => {
  checks++;
  if (!(Math.abs(got - want) <= tol)) fails.push(`${label}: got ${got}, expected ${want} (±${tol})`);
};
const LIMITS = { min: 20, max: 240 };

// A score of 4 bars of 4/4 after a one-beat count-in: bar 1 at tick 192, end at 192 + 4 × 768.
const plain = { tempo: null, startTick: 192, endTick: 192 + 4 * 768 };
// The same with a tempo change: 120, then twice as fast from bar 3.
const mark = (tick, bpm) => ({ tick, bpm, source: 'midi.bpm' });
const changing = {
  tempo: { initial: mark(0, 120), marks: [mark(0, 120), mark(192 + 2 * 768, 240)] },
  startTick: 192, endTick: 192 + 4 * 768,
};

// ------------------------------------------------ 1. where bar 1 and the end fall
{
  const sync = { offset: 3.25, bpm: 120 };
  near('1. bar 1 is at the offset', E.audioTimeAt(sync, plain, 192), 3.25);
  near('1. 4 bars of 4/4 at ♩ = 120 last 8 s', E.scoreDuration(plain, 120), 8);
  near('1. …so the end is at offset + 8 s', E.audioTimeAt(sync, plain, plain.endTick), 11.25);
  near('1. the count-in is before bar 1', E.audioTimeAt(sync, plain, 0), 2.75);
  near('1. bar 3 is 4 s in', E.audioTimeAt(sync, plain, 192 + 2 * 768), 7.25);
}

// ------------------------------------------------ 2. the tempo scales it all
near('2. at ♩ = 60 the same bars last twice as long', E.scoreDuration(plain, 60), 16);
near('2. a tempo change: 2 bars at 120 then 2 at 240 = 4 + 2 s', E.scoreDuration(changing, 120), 6);
near('2. …at half the opening tempo, every section halves', E.scoreDuration(changing, 60), 12);
near('2. bar 3 (where it speeds up) lands 4 s after bar 1', E.audioTimeAt({ offset: 1, bpm: 120 }, changing, 192 + 2 * 768), 5);

// ------------------------------------------------ 3. dragging the end sets the tempo
{
  const sync = { offset: 2, bpm: 120 };
  const bpm = E.bpmForEnd(sync, plain, 2 + 10, LIMITS);
  near('3. the end dragged to 10 s after bar 1: ♩ = 96', bpm, 96);
  near('3. …and the score then ends exactly there', E.audioTimeAt({ ...sync, bpm }, plain, plain.endTick), 12, 0.01);
  const bpm2 = E.bpmForEnd(sync, changing, 2 + 9, LIMITS);
  near('3. with a tempo change too', E.audioTimeAt({ ...sync, bpm: bpm2 }, changing, changing.endTick), 11, 0.01);
  eq('3. bar 1 does not move', E.audioTimeAt({ ...sync, bpm }, plain, 192), 2);
  eq('3. an end before bar 1 changes nothing', E.bpmForEnd(sync, plain, 1, LIMITS), 120);
  eq('3. the tempo stays within the slider', E.bpmForEnd(sync, plain, 2.1, LIMITS), 240);
}

// ------------------------------------------------ 4. longer and shorter recordings
{
  // A 60 s recording with a 12 s intro: the 8 s score sits inside it, with room after.
  const sync = { offset: 12, bpm: 120 };
  eq('4. an intro: the score starts 12 s in', E.audioTimeAt(sync, plain, 192), 12);
  eq('4. an outro: the score ends at 20 s of 60', E.audioTimeAt(sync, plain, plain.endTick) < 60, true);
  eq('4. a recording that starts after bar 1: negative times mean "not yet"', E.audioTimeAt({ offset: -1.5, bpm: 120 }, plain, 192), -1.5);
}

// ------------------------------------------------ 5. the first guess
{
  const sr = 1000;
  const a = new Float32Array(3000), b = new Float32Array(3000);
  a[1500] = 0.5; b[1200] = -0.3;
  near('5. the score starts where the first channel with sound does', E.firstSoundTime([a, b], sr), 1.2);
  eq('5. silence: from the top', E.firstSoundTime([new Float32Array(100)], sr), 0);
  eq('5. hiss below −40 dB is not sound', E.firstSoundTime([new Float32Array(100).fill(0.005)], sr), 0);
  eq('5. initialSync takes the score\'s tempo', E.initialSync([a, b], sr, 96), { offset: 1.2, bpm: 96 });
}

// ------------------------------------------------ 6. peaks
{
  const n = 10000;
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = Math.sin(i / 50) * 0.8; r[i] = Math.sin(i / 50) * 0.4; }
  const p = E.computePeaks([l, r], 256);
  eq('6. one entry per 256 samples', p.min.length, Math.ceil(n / 256));
  const [lo, hi] = E.peakRange(p, 0, n);
  near('6. channels are mixed: peak of (0.8 + 0.4) / 2', hi, 0.6, 1e-3);
  near('6. …and the trough', lo, -0.6, 1e-3);
  const [lo2, hi2] = E.peakRange(p, 0, 10);
  eq('6. a sub-block range still reads its block', lo2 <= 0 && hi2 >= 0, true);
}

// ------------------------------------------------ 7. which songs keep it
eq('7. a bundled piece keeps it', E.isKeptSong('piano/first_two_hand_exercises/x.mei'), true);
eq('7. a piece from a ZIP collection keeps it', E.isKeptSong('opfs:piano/my_songs/x.mei'), true);
eq('7. a score-server piece keeps it', E.isKeptSong('https://scores.example/api/piano/files/a/b.mei'), true);
eq('7. a generated exercise keeps it', E.isKeptSong('scale:C-major-parallel'), true);
eq('7. a local file opened on its own does not', E.isKeptSong('blob:http://localhost:5173/68bf'), false);
eq('7. times read as m:ss.s', [E.formatTime(187.24), E.formatTime(-1.5), E.formatTime(59.96, 0)], ['3:07.2', '−0:01.5', '1:00']);

// ------------------------------------------------ a real piece
{
  const tk = new VerovioToolkit(await createVerovioModule());
  const mei = readFileSync(join(ROOT, 'public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei'), 'utf8');
  const dom = new DOMParser().parseFromString(mei, 'text/xml');
  const c = E.ensureCountInMeasure(dom), i = E.ensureNoteIds(dom);
  tk.loadData(c || i ? dom.toString() : mei);
  const tm = E.extractTimemap(tk, dom);
  const span = { tempo: tm.tempo?.initial ? tm.tempo : null, startTick: E.barBoundaries(tm)[0], endTick: tm.totalTicks };
  // 16 bars of 4/4 = 64 beats: 32 s at ♩ = 120.
  near('Czerny op. 824/1: 16 bars of 4/4 last 32 s at ♩ = 120', E.scoreDuration(span, 120), 32);
  eq('…and bar 1 is the first bar after the count-in', span.startTick, 192);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} accompaniment checks`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

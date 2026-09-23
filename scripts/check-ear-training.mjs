/**
 * Validation for Learn by ear (src/utils/earTraining.ts), written against the
 * acceptance criteria of the specification (docs/learn-by-ear.md):
 *
 *   [1] one staff reduced to a strictly monophonic line (treble keeps the top
 *       note of each onset, bass the bottom);
 *   [2] notation ahead of the student stays masked until played;
 *   [3] round 1 prompts note 1, success adds a note, cumulatively to the end;
 *   [4] input is ignored while the call is sounding;
 *   [5] a wrong pitch stops the response at once and brings up the assessment;
 *   [6] "Retry from here" replays the same phrase without losing progress;
 *   [7] "Restart from beginning" goes back to the opening note, all veiled;
 *   [8] finishing the melody reveals the whole score and the summary.
 *
 * Plus the settings (exact octave vs any octave, written rhythm vs even
 * pulses) and the assessment figures (accuracy, depth, streak).
 *
 * Usage:  node scripts/check-ear-training.mjs
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
const outDir = mkdtempSync(join(tmpdir(), 'ear-'));
writeFileSync(join(outDir, 'entry.ts'), `
export * from ${JSON.stringify(join(ROOT, 'src/utils/earTraining.ts'))};
export { extractTimemap, TONE_PPQ } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { ticksToSeconds } from ${JSON.stringify(join(ROOT, 'src/utils/tempo.ts'))};
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

// ------------------------------------------------ [1] melodic reduction
// Treble: a melody over a chord and a second voice; bass: a line with a tie.
const grand = `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
<meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead><music><body><mdiv><score>
<scoreDef meter.count="4" meter.unit="4" midi.bpm="120"><staffGrp>
<staffDef n="1" lines="5" clef.shape="G" clef.line="2"/><staffDef n="2" lines="5" clef.shape="F" clef.line="4"/></staffGrp></scoreDef>
<section><measure n="1"><staff n="1">
  <layer n="1"><chord dur="4"><note pname="c" oct="4"/><note pname="e" oct="4"/><note pname="g" oct="4"/></chord><note dur="4" pname="a" oct="4"/><note dur="4" pname="a" oct="4"/><note dur="4" pname="f" oct="4"/></layer>
  <layer n="2"><note dur="2" pname="c" oct="4"/><note dur="2" pname="d" oct="4"/></layer>
</staff><staff n="2"><layer n="1">
  <note dur="2" pname="c" oct="3" tie="i"/><note dur="4" pname="c" oct="3" tie="t"/><chord dur="4"><note pname="g" oct="2"/><note pname="d" oct="3"/></chord>
</layer></staff></measure></section></score></mdiv></body></music></mei>`;
const tm = load(grand);
const treble = E.extractMelody(tm, 1);
const bass = E.extractMelody(tm, 2);
eq('[1] treble keeps the top note: chord C-E-G gives G, then A A F', treble.map(n => n.midi), [67, 69, 69, 65]);
eq('[1] a repeated pitch is two notes', treble.filter(n => n.midi === 69).length, 2);
eq('[1] bass keeps the bottom note: tied C3 is one note, chord G2-D3 gives G2', bass.map(n => n.midi), [48, 43]);
eq('[1] strictly monophonic: one note per onset', treble.every((n, i) => i === 0 || n.tick > treble[i - 1].tick), true);
eq('[1] a note never outlasts the next', treble.every((n, i) => i + 1 >= treble.length || n.endTick <= treble[i + 1].tick), true);
eq('[1] every melody note has its page id', treble.every(n => typeof n.id === 'string' && n.id.length > 0), true);
eq('[1] the staves that have notes', E.stavesWithNotes(tm), [1, 2]);

// A real bundled piano piece: the reduction must be monophonic and in time order.
const real = load(readFileSync(join(ROOT, 'public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei'), 'utf8'));
for (const staff of [1, 2]) {
  const m = E.extractMelody(real, staff);
  const onStaff = real.onsets.filter(o => o.notes.some(n => n.staff === staff)).length;
  eq(`[1] Czerny op. 824/1, staff ${staff}: has a melody at all`, m.length > 10, true);
  eq(`[1] Czerny op. 824/1, staff ${staff}: one melody note per onset on that staff`, m.length, onStaff);
  eq(`[1] Czerny op. 824/1, staff ${staff}: in time order`, m.every((n, i) => i === 0 || n.tick > m[i - 1].tick), true);
}

// --------------------------------------- [2]-[8] the call-and-response loop
const targets = [60, 62, 64, 65];              // C D E F
const run = (actions, exactOctave = true) =>
  actions.reduce((s, a) => E.earReducer(s, a, targets, exactOctave), E.initialEarState(targets.length));
const note = midi => ({ type: 'note', midi });
const round = k => [{ type: 'callDone' }, ...targets.slice(0, k).map(note), { type: 'breathDone' }];

let s = run([]);
eq('[2] nothing is revealed before the session starts', s.revealed, 0);
s = run([{ type: 'start' }]);
eq('[3] round 1 calls a phrase of one note', [s.phase, s.k], ['call', 1]);
eq('[4] a key during the call is ignored', run([{ type: 'start' }, note(60)]).stats.attempts, 0);
eq('[4] …and so is a key before the session starts', run([note(60)]).stats.attempts, 0);

s = run([{ type: 'start' }, { type: 'callDone' }, note(60)]);
eq('[3] after playing note 1: a short breath, then a phrase of two', [s.phase, s.k, s.i], ['breath', 2, 0]);
eq('[2] note 1 is now visible, nothing further', s.revealed, 1);
s = E.earReducer(s, { type: 'breathDone' }, targets, true);
eq('[3] the breath leads into the longer call', [s.phase, s.k], ['call', 2]);

s = run([{ type: 'start' }, ...round(1), ...round(2), { type: 'callDone' }, note(60), note(62)]);
eq('[2] mid-response: the notes played so far stay visible, the next is veiled', [s.phase, s.i, s.revealed], ['response', 2, 2]);

// [5] A wrong pitch stops everything.
s = run([{ type: 'start' }, ...round(1), ...round(2), { type: 'callDone' }, note(60), note(61)]);
eq('[5] a wrong pitch halts the response at once', s.phase, 'error');
eq('[5] …remembering where', s.stumbleAt, 2);
eq('[5] …and a key pressed after the stop is not counted', E.earReducer(s, note(62), targets, true).stats.attempts, s.stats.attempts);

// [6] Retry from here.
const beforeRetry = s;
s = E.earReducer(s, { type: 'retry' }, targets, true);
eq('[6] retry replays the same phrase', [s.phase, s.k], ['call', beforeRetry.k]);
eq('[6] …from its first note', s.i, 0);
eq('[6] …without re-veiling what was learned', s.revealed, beforeRetry.revealed);

// [7] Restart from beginning.
s = E.earReducer(beforeRetry, { type: 'restart' }, targets, true);
eq('[7] restart goes back to a phrase of one note', [s.phase, s.k, s.i], ['call', 1, 0]);
eq('[7] …with every note veiled again', s.revealed, 0);

// Every way into a call is a new call, so it is sounded even when nothing
// else about the phrase changed (a restart during the opening call).
{
  const a = run([{ type: 'start' }]);
  const b = E.earReducer(a, { type: 'restart' }, targets, true);
  eq('a restart during a call is a new call', [b.phase, b.k, b.callId > a.callId], ['call', 1, true]);
}

// [8] The whole melody in one response.
s = run([{ type: 'start' }, ...round(1), ...round(2), ...round(3), { type: 'callDone' }, ...targets.map(note)]);
eq('[8] the last full response completes the session', s.phase, 'complete');
eq('[8] …and the whole melody is revealed', s.revealed, targets.length);
eq('[8] depth equals the melody length', s.stats.depth, 4);

// ------------------------------------------------------- the assessment
s = run([{ type: 'start' }, ...round(1), { type: 'callDone' }, note(60), note(63)]);
eq('accuracy counts every key struck on the student’s turn', [s.stats.correct, s.stats.attempts], [2, 3]);
eq('accuracy as a share', Math.round(E.pitchAccuracy(s.stats) * 1000) / 1000, 0.667);
eq('depth is the longest phrase played back in full', s.stats.depth, 1);
eq('streak resets on a wrong note, the best is kept', [s.stats.streak, s.stats.bestStreak], [0, 2]);

// ------------------------------------------------------- the settings
eq('exact octave: C5 for C4 is wrong', run([{ type: 'start' }, { type: 'callDone' }, note(72)], true).phase, 'error');
eq('any octave: C5 for C4 is right', run([{ type: 'start' }, { type: 'callDone' }, note(72)], false).phase, 'breath');
eq('any octave: B3 for C4 is still wrong', run([{ type: 'start' }, { type: 'callDone' }, note(59)], false).phase, 'error');

const written = E.callTimemap(treble, 3, 'written', tm.tempo);
eq('written rhythm: the phrase starts at once', written.onsets[0].tick, 0);
eq('written rhythm: gaps as written', written.onsets.map(o => o.tick), [0, E.TONE_PPQ, 2 * E.TONE_PPQ]);
eq('written rhythm: carries the score tempo', written.tempo?.marks[0].bpm, 120);
const even = E.callTimemap(treble, 4, 'even', tm.tempo);
eq('even pulses: one per beat whatever the score', even.onsets.map(o => o.tick), [0, 1, 2, 3].map(j => j * E.TONE_PPQ));
eq('even pulses: detached, so a repeat is heard twice', even.onsets.every(o => o.notes[0].endTick < o.tick + E.TONE_PPQ), true);
eq('even pulses: ignore the score tempo', even.tempo, undefined);
eq('a phrase is never longer than the melody', E.callTimemap(treble, 99, 'written').onsets.length, treble.length);

// A call taken from later in a piece still starts at once, at the tempo in force there.
{
  const map = { initial: { tick: 0, bpm: 120, source: 'midi.bpm' },
                marks: [{ tick: 0, bpm: 120, source: 'midi.bpm' }, { tick: 1000, bpm: 60, source: 'midi.bpm' }] };
  const later = [{ index: 0, tick: 2000, endTick: 2192, midi: 60 }, { index: 1, tick: 2192, endTick: 2384, midi: 62 }];
  const c = E.callTimemap(later, 2, 'written', map);
  eq('a phrase after a tempo change opens at that tempo', c.tempo.marks[0].bpm, 60);
  eq('…and one beat there lasts a second (♩ = 60)', E.ticksToSeconds(c.tempo, E.TONE_PPQ, 120), 1);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} ear-training checks`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

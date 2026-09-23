/**
 * Validation for the drum controller's pad map (src/utils/drumMap.ts):
 *
 *   1. The General MIDI default scores exactly what the old fixed table did,
 *      pad for pad — nobody's kit changes behaviour by default.
 *   2. Clap, tambourine and cowbell, which the old table left out, now score.
 *   3. Practice mode's waiting pads are answered through the map, alternates
 *      notated in the same place included (rim for snare, open hat for closed).
 *   4. A re-mapped kit (Roland-style hi-hat edges on 22 and 26, a tom rim on
 *      58) scores through its own notes; unassigned notes score nothing.
 *   5. Learning a note for another voice moves it; stored maps round-trip and
 *      junk is dropped.
 *   6. Every drum notated in the bundled charts can be hit on a General MIDI
 *      kit, in rhythm mode and in practice mode.
 *
 * Usage:  node scripts/check-drum-map.mjs
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
const outDir = mkdtempSync(join(tmpdir(), 'pads-'));
writeFileSync(join(outDir, 'entry.ts'), `
export * from ${JSON.stringify(join(ROOT, 'src/utils/drumMap.ts'))};
export { padForScoreNote, PAD_TO_VOICE } from ${JSON.stringify(join(ROOT, 'src/utils/drumPads.ts'))};
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
const GM = E.GM_DRUM_MAP;

// ------------------------------------------------ 1. the default is unchanged
// The table useMidi.ts used to hard-code: pad → the pitch it scores as.
const OLD = { 36: 65, 38: 72, 37: 72, 40: 72, 42: 79, 46: 79, 49: 81, 57: 81, 53: 81, 51: 81, 55: 81,
  41: 69, 43: 69, 45: 74, 47: 74, 48: 76, 50: 76 };
for (const [pad, pitch] of Object.entries(OLD)) {
  eq(`1. GM pad ${pad} scores as before`, E.inputScorePitch(GM, +pad), pitch);
}

// ------------------------------------------------ 2. the three that never scored
eq('2. clap (39) now scores, at e4', E.inputScorePitch(GM, 39), 64);
eq('2. tambourine (54) now scores, at f5', E.inputScorePitch(GM, 54), 77);
eq('2. cowbell (56) now scores, at f5', E.inputScorePitch(GM, 56), 77);
eq('2. a note General MIDI has no drum for scores nothing', E.inputScorePitch(GM, 22), undefined);

// ------------------------------------------------ 3. practice mode
const rim = E.padForScoreNote(72, 'slash');
const openHat = E.padForScoreNote(79, '+');
eq('3. a notated rim shot waits for pad 37', rim, 37);
eq('3. …and the snare pad answers it (same drum)', E.inputAnswersPad(GM, rim, 38), true);
eq('3. the rim pad answers it too', E.inputAnswersPad(GM, rim, 37), true);
eq('3. a closed hat answers a notated open hat', E.inputAnswersPad(GM, openHat, 42), true);
eq('3. the kick does not answer a snare', E.inputAnswersPad(GM, 38, 36), false);
eq('3. a clap is answered by the clap pad', E.inputAnswersPad(GM, E.padForScoreNote(64, 'x'), 39), true);
eq('3. an unassigned note answers nothing', E.inputAnswersPad(GM, 38, 22), false);

// ------------------------------------------------ 4. a re-mapped kit
let kit = GM;
kit = E.assignNote(kit, 22, 'hatClosed');
kit = E.assignNote(kit, 26, 'hatOpen');
kit = E.assignNote(kit, 58, 'tomLow');
kit = E.assignNote(kit, 39, 'tomLow');          // this module's tom-4 rim, where GM has the clap
eq('4. a hi-hat edge on 22 scores as the hi-hat', E.inputScorePitch(kit, 22), 79);
eq('4. …and answers a notated closed hat in practice', E.inputAnswersPad(kit, 42, 22), true);
eq('4. a tom rim on 58 scores as the low tom', E.inputScorePitch(kit, 58), 69);
eq('4. 39 re-learned as a tom moves it off the clap', E.notesForVoice(kit, 'clap'), []);
eq('4. …and it now scores as the tom', E.inputScorePitch(kit, 39), 69);
eq('4. the low tom lists every note that plays it', E.notesForVoice(kit, 'tomLow'), [39, 41, 43, 58]);
eq('4. the kit sound follows the map too', E.voiceForInput(kit, 26), 'hatOpen');
eq('4. unassigning a note silences it', E.voiceForInput(E.assignNote(kit, 26, null), 26), undefined);
eq('4. the default is not touched by edits', E.voiceForInput(GM, 39), 'clap');

// ------------------------------------------------ 5. storage
eq('5. a map round-trips through storage', E.sameMap(E.parseDrumMap(E.serializeDrumMap(kit)), kit), true);
eq('5. junk entries are dropped', E.parseDrumMap('{"map":{"200":"kick","38":"banjo","40":"snare","x":"kick"}}'), { 40: 'snare' });
eq('5. unreadable storage falls back', E.parseDrumMap('{not json'), null);
eq('5. the default equals General MIDI', E.sameMap(GM, E.PAD_TO_VOICE), true);
eq('5. every voice has at least one GM pad', E.DRUM_VOICES.every(v => E.notesForVoice(GM, v.key).length > 0), true);

// ------------------------------------------------ 6. the bundled charts
const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none' });
const charts = [];
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.mei')) charts.push(p); } };
walk(join(ROOT, 'public/drums'));
let notes = 0;
const unplayable = new Map();
const newlyScoring = new Set();
for (const file of charts) {
  const mei = readFileSync(file, 'utf8');
  const dom = new DOMParser().parseFromString(mei, 'text/xml');
  const countIn = E.ensureCountInMeasure(dom);
  const ids = E.ensureNoteIds(dom);
  tk.loadData(countIn || ids ? dom.toString() : mei);
  const tm = E.extractTimemap(tk, dom);
  for (const onset of tm.onsets) for (const n of onset.notes) {
    const pad = E.padForScoreNote(n.midi, n.head);
    if (pad === undefined) continue;          // not a drum the app notates
    notes++;
    const rhythm = E.inputScorePitch(GM, pad) === n.midi;
    const practice = E.inputAnswersPad(GM, pad, pad);
    if (!rhythm || !practice) unplayable.set(`${n.midi}/${n.head ?? '-'}`, (unplayable.get(`${n.midi}/${n.head ?? '-'}`) ?? 0) + 1);
    if (OLD[pad] === undefined) newlyScoring.add(E.PAD_TO_VOICE[pad]);
  }
}
eq(`6. every drum in ${charts.length} bundled charts (${notes} notes) can be hit on a GM kit`, [...unplayable], []);
console.log(`   ${charts.length} bundled charts, ${notes} drum notes; voices there the old table could not score: ${[...newlyScoring].sort().join(', ') || 'none'}`);

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} drum pad map checks`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

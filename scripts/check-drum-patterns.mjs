/**
 * Validation harness for the drum-pattern generator (src/utils/drumPatternGen.ts).
 *
 * The generator is algorithmic rhythm with no runtime to catch mistakes, so
 * this sweeps every engine over every voice and hit count and checks:
 *
 *   1. Bjorklund reproduces the reference Euclidean rhythms (E(5,8) is the
 *      Cuban cinquillo, E(3,8) the tresillo, and so on).
 *   2. Every engine places *exactly* the number of hits asked for — that is
 *      the promise the sequencer's per-voice counter makes.
 *   3. Verovio loads and renders every generated score.
 *   4. Verovio's MIDI pitch for each note is the one the app's pad map aims
 *      at, so a pad press matches the engraved voice (f4 = kick, c5 = snare,
 *      g5 = hi-hat …) — this is what hit-detection compares.
 *   5. Every note is identifiable by the same pname/oct/head.shape rules
 *      VirtualDrums uses, so the step-sequencer grid shows the right rows.
 *   6. The timemap starts one beat after the count-in and every bar is full.
 *   7. Bar 1 of the score is exactly the pattern held in the URL, and the
 *      URL round-trips.
 *
 * Usage:  node scripts/check-drum-patterns.mjs
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const outDir = mkdtempSync(join(tmpdir(), 'drumgen-'));
const outFile = join(outDir, 'drumPatternGen.mjs');
await build({
  entryPoints: [join(ROOT, 'src/utils/drumPatternGen.ts')],
  bundle: true, format: 'esm', outfile: outFile, logLevel: 'warning',
});
const gen = await import(pathToFileURL(outFile).href);
const {
  DRUM_VOICES, DRUM_ALGOS, STEPS, bjorklund, generateVoicePattern,
  generateDrumMei, resolveDrumSpec, buildDrumUrl, parseDrumUrl, describeDrumUrl,
} = gen;

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ breaks: 'auto', adjustPageHeight: true, footer: 'none', header: 'none' });

const PNAME_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const pitchOf = v => (v.oct + 1) * 12 + PNAME_PC[v.pname];

const fails = [];
const fail = (label, what, url = '') => fails.push(`${label}: ${what}${url ? `  [${url}]` : ''}`);
const stats = { specs: 0, patterns: 0, notes: 0 };

// ---------------------------------------------------------------- 1. Euclid
const asBits = p => p.map(x => (x ? 1 : 0)).join('');
const EUCLID_REFERENCE = {
  '5,8': '10110110',   // Cuban cinquillo (the worked example in the spec)
  '3,8': '10010010',   // tresillo
  '4,16': '1000100010001000',
  '8,16': '1010101010101010',
  '16,16': '1111111111111111',
  '0,16': '0000000000000000',
};
for (const [key, want] of Object.entries(EUCLID_REFERENCE)) {
  const [k, n] = key.split(',').map(Number);
  const got = asBits(bjorklund(k, n));
  if (got !== want) fail('euclid', `E(${k},${n}) = ${got}, expected ${want}`);
}
// Bjorklund must always place exactly k onsets, evenly: no two gaps differing
// by more than one step (the defining property of a Euclidean rhythm).
for (let n = 2; n <= 32; n++) {
  for (let k = 0; k <= n; k++) {
    const p = bjorklund(k, n);
    const hits = p.filter(Boolean).length;
    if (hits !== k) fail('euclid', `E(${k},${n}) placed ${hits} onsets`);
    if (k >= 2 && k < n) {
      const idx = p.map((h, i) => (h ? i : -1)).filter(i => i >= 0);
      const gaps = idx.map((v, i) => (i + 1 < idx.length ? idx[i + 1] - v : n - v + idx[0]));
      if (Math.max(...gaps) - Math.min(...gaps) > 1) {
        fail('euclid', `E(${k},${n}) gaps ${gaps.join(',')} are not evenly spread`);
      }
    }
  }
}

// ------------------------------------------- 2. every engine honours the count
for (const algo of DRUM_ALGOS.map(a => a.value)) {
  for (const voice of DRUM_VOICES) {
    for (let k = 0; k <= STEPS; k++) {
      for (const seed of [1, 4242, 31337]) {
        const p = generateVoicePattern(algo, voice, k, seed, 0.1);
        stats.patterns++;
        if (p.length !== STEPS) fail(`${algo}/${voice.id}`, `pattern is ${p.length} steps`);
        const hits = p.filter(Boolean).length;
        if (hits !== k) fail(`${algo}/${voice.id}`, `asked for ${k} hits, got ${hits} (seed ${seed})`);
      }
    }
  }
}

// -------------------------------------------------- 3-7. the engraved score
function readTimemap(mei, label, url) {
  if (!tk.loadData(mei)) { fail(label, 'verovio rejected the MEI', url); return null; }
  if (tk.getPageCount() < 1) { fail(label, 'rendered no pages', url); return null; }
  if ((tk.renderToSVG(1, {}) || '').length < 200) fail(label, 'empty SVG', url);
  return tk.renderToTimemap({ includeMeasures: true });
}

function checkSpec(spec, label) {
  stats.specs++;
  const url = buildDrumUrl(spec);
  const back = parseDrumUrl(url);
  if (!back || back.algo !== spec.algo || back.bars !== spec.bars || back.seed !== spec.seed
      || back.variation !== spec.variation || back.accents !== spec.accents
      || back.pattern.length !== spec.pattern.filter(v => v.steps.some(Boolean)).length) {
    fail(label, 'url does not round-trip', url);
  } else {
    for (const v of back.pattern) {
      const want = spec.pattern.find(x => x.id === v.id);
      if (want && want.steps.join() !== v.steps.join()) fail(label, `voice ${v.id} pattern changed in the url`, url);
    }
  }
  if (!describeDrumUrl(url)) fail(label, 'no title', url);

  const resolved = resolveDrumSpec(spec);
  const mei = generateDrumMei(spec);
  if (!mei.includes('<measure n="0">')) fail(label, 'count-in measure missing', url);
  if (!mei.includes('clef.shape="perc"')) fail(label, 'not a percussion staff', url);

  const tmap = readTimemap(mei, label, url);
  if (!tmap) return;

  // Pitches: every sounding note must be a pitch the app's pad map targets.
  const wantPitches = new Set(spec.pattern.filter(v => v.steps.some(Boolean))
    .map(v => DRUM_VOICES.find(d => d.id === v.id)).filter(Boolean).map(pitchOf));
  const onsets = tmap.filter(e => e.on && e.on.length);
  let sounded = 0;
  const seen = new Set();
  for (const e of onsets) {
    for (const id of e.on) {
      const v = tk.getMIDIValuesForElement(id);
      if (!v || !v.pitch) { fail(label, `note ${id} has no MIDI pitch`, url); continue; }
      sounded++;
      seen.add(v.pitch);
      if (!wantPitches.has(v.pitch)) fail(label, `sounds pitch ${v.pitch}, not one of the kit's ${[...wantPitches].join('/')}`, url);
    }
  }
  stats.notes += sounded;
  if (sounded !== resolved.totalHits) fail(label, `score sounds ${sounded} notes, pattern has ${resolved.totalHits}`, url);
  for (const p of wantPitches) if (!seen.has(p)) fail(label, `voice at pitch ${p} never sounds`, url);

  // Timing: one beat of count-in, then a full bar per bar. A drum bar rarely
  // ends on a hit, so what must line up is the *bars*, not the last note-off.
  const qs = onsets.map(e => e.qstamp).sort((a, b) => a - b);
  if (qs.length && qs[0] < 1) fail(label, `first note at qstamp ${qs[0]}, before the count-in ends`, url);
  if (qs.length && qs[qs.length - 1] >= 1 + 4 * spec.bars) fail(label, `a note starts past the last barline`, url);
  const measureStamps = [...new Set(tmap.filter(e => e.measureOn).map(e => e.qstamp))].sort((a, b) => a - b);
  if (measureStamps.length !== spec.bars + 1) {
    fail(label, `${measureStamps.length} measures in the timemap, expected ${spec.bars + 1} (count-in + bars)`, url);
  } else if (measureStamps[measureStamps.length - 1] !== 1 + 4 * (spec.bars - 1)) {
    fail(label, `last bar starts at qstamp ${measureStamps[measureStamps.length - 1]}, expected ${1 + 4 * (spec.bars - 1)}`, url);
  }

  // Every layer of every bar must add up to exactly four quarters, or the
  // engraving is short and Verovio silently pads it.
  const SIXTEENTHS = { 16: 1, 8: 2, 4: 4, 2: 8, 1: 16 };
  const measureXml = [...mei.matchAll(/<measure n="(\d+)"[^>]*>([\s\S]*?)<\/measure>/g)];
  for (const [, n, body] of measureXml) {
    if (n === '0') continue;
    for (const [, layerBody] of body.matchAll(/<layer n="\d+">([\s\S]*?)<\/layer>/g)) {
      let total = 0;
      for (const el of layerBody.matchAll(/<(note|chord|space|rest)\b([^>]*)>/g)) {
        // Notes inside a chord carry no @dur — the chord holds it — so the
        // missing attribute is exactly what marks them as already counted.
        const dur = /dur="(\d+)"/.exec(el[2]);
        if (!dur) continue;
        let ticks = SIXTEENTHS[Number(dur[1])];
        if (/dots="1"/.test(el[2])) ticks *= 1.5;
        total += ticks;
      }
      if (total !== 16) fail(label, `bar ${n} layer adds up to ${total}/16 sixteenths`, url);
    }
  }

  // Bar 1 on the page must be the bar the sequencer holds.
  const firstBar = resolved.bars[0];
  for (const v of spec.pattern) {
    const voice = DRUM_VOICES.find(d => d.id === v.id);
    if (!voice) continue;
    const played = firstBar.map(hits => hits.some(h => h.voice.id === v.id));
    if (played.join() !== v.steps.join()) fail(label, `bar 1 of ${v.id} differs from the sequencer`, url);
  }

  // Identifiable by VirtualDrums' own rules (pname + oct + head.shape/fill).
  for (const m of mei.matchAll(/<note\b[^>]*\/?>/g)) {
    const attr = n => (new RegExp(`${n}="([^"]*)"`).exec(m[0]) || [])[1];
    const match = DRUM_VOICES.find(d => d.pname === attr('pname') && String(d.oct) === attr('oct')
      && (d.head ?? undefined) === attr('head.shape') && (d.headFill ?? undefined) === attr('head.fill'));
    if (!match) fail(label, `a note is not identifiable by the drum map: ${m[0].slice(0, 90)}`, url);
  }
}

// Sweep: every algorithm, a range of kits, bars and variation.
const KITS = [
  ['bd', 'sd', 'ch'],
  ['bd', 'sd', 'ch', 'oh', 'cy'],
  ['bd', 'sd', 'rs', 'lt', 'mt', 'ht', 'ch', 'oh', 'cy', 'cp', 'cb', 'tb'],
  ['cy'],
  ['bd'],
];
for (const algo of DRUM_ALGOS.map(a => a.value)) {
  for (const kit of KITS) {
    for (const bars of [1, 2, 4]) {
      for (const variation of [0, 3, 9]) {
        const seed = 1000 + bars * 7 + variation;
        const spec = {
          algo, bars, variation, seed, accents: variation % 2 === 0,
          pattern: kit.map(id => {
            const voice = DRUM_VOICES.find(d => d.id === id);
            const k = Math.max(1, (voice.propose[0] + voice.propose[1]) >> 1);
            return { id, steps: generateVoicePattern(algo, voice, k, seed, 0.1) };
          }),
        };
        checkSpec(spec, `${algo}/${kit.length}v/${bars}bar/j${variation}`);
      }
    }
  }
}
// Degenerate cases: an empty kit and a completely full bar.
checkSpec({ algo: 'euclid', bars: 1, variation: 0, seed: 7, accents: false, pattern: [] }, 'empty');
checkSpec({
  algo: 'euclid', bars: 1, variation: 0, seed: 7, accents: true,
  pattern: [{ id: 'ch', steps: new Array(16).fill(true) }, { id: 'bd', steps: new Array(16).fill(true) }],
}, 'full');

rmSync(outDir, { recursive: true, force: true });

console.log(`checked ${stats.specs} scores · ${stats.patterns} generated patterns · ${stats.notes} engraved notes`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails.slice(0, 25)) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

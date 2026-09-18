/**
 * Validation harness for the saxo jazz scale generator (src/utils/jazzScaleGen.ts).
 *
 * The generator is pure music theory with no runtime to catch mistakes, so this
 * sweeps a few thousand specs and checks the things that would silently produce
 * an unplayable or wrong exercise:
 *
 *   1. Verovio loads and renders every generated MEI (no malformed documents).
 *   2. Every note sits inside the horn's written range (the tessitura engine).
 *   3. Verovio's MIDI export sounds exactly the pitches the generator intended
 *      — this is what hit-detection compares the player against, so engraving
 *      and playback must not disagree (the @accid.ges question).
 *   4. The timemap starts one beat after the count-in measure and the last bar
 *      is complete — what the scrolling score view and the transport assume.
 *   5. Bebop scales keep their chord tones on the downbeats in straight
 *      eighths, through the turnarounds and across repeats — the property the
 *      whole family exists for.
 *   6. sax: URLs round-trip through parse/build, and every one has a title.
 *
 * Usage:  node scripts/check-jazz-scales.mjs
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Minimal standard-MIDI-file reader: every note-on, as {midi, tick}. Verovio
 * hands back a base64 SMF; this only needs the pitches and their order, so it
 * skips everything else rather than pulling in a MIDI library.
 */
function readNoteOns(base64) {
  const b = Buffer.from(base64, 'base64');
  const notes = [];
  let pos = 8 + b.readUInt32BE(4); // past MThd
  while (pos < b.length - 8) {
    const id = b.toString('ascii', pos, pos + 4);
    const len = b.readUInt32BE(pos + 4);
    const end = pos + 8 + len;
    if (id !== 'MTrk') { pos = end; continue; }
    let p = pos + 8;
    let tick = 0;
    let status = 0;
    while (p < end) {
      let delta = 0;
      for (;;) { const c = b[p++]; delta = (delta << 7) | (c & 0x7f); if (!(c & 0x80)) break; }
      tick += delta;
      if (b[p] & 0x80) status = b[p++];
      const hi = status & 0xf0;
      if (status === 0xff) { p++; let l = 0; for (;;) { const c = b[p++]; l = (l << 7) | (c & 0x7f); if (!(c & 0x80)) break; } p += l; }
      else if (status === 0xf0 || status === 0xf7) { let l = 0; for (;;) { const c = b[p++]; l = (l << 7) | (c & 0x7f); if (!(c & 0x80)) break; } p += l; }
      else if (hi === 0xc0 || hi === 0xd0) p += 1;
      else { const pitch = b[p]; const vel = b[p + 1]; p += 2; if (hi === 0x90 && vel > 0) notes.push({ midi: pitch, tick }); }
    }
    pos = end;
  }
  return notes;
}

// The generator is TypeScript; bundle it to a throwaway ESM file to import.
const outDir = mkdtempSync(join(tmpdir(), 'jazzgen-'));
const outFile = join(outDir, 'jazzScaleGen.mjs');
await build({
  entryPoints: [join(ROOT, 'src/utils/jazzScaleGen.ts')],
  bundle: true, format: 'esm', outfile: outFile, logLevel: 'warning',
});
const gen = await import(pathToFileURL(outFile).href);
const {
  JAZZ_SCALES, JAZZ_PATTERNS, HORNS, generateJazzMei, resolveJazzSpec,
  buildJazzUrl, parseJazzUrl, describeJazzUrl, WRITTEN_LOW, WRITTEN_HIGH, WRITTEN_HIGH_FS,
} = gen;

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ breaks: 'auto', adjustPageHeight: true, footer: 'none', header: 'none' });

const ROOTS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const BEBOP = JAZZ_SCALES.filter(s => s.group === 'Bebop').map(s => s.id);
const ALIGNED = JAZZ_SCALES.filter(gen.downbeatAligned).map(s => s.id);
const fails = [];
const stats = { specs: 0, notes: 0, minNotes: Infinity, maxNotes: 0, maxMeasures: 0 };
const fail = (label, what, url) => fails.push(`${label}: ${what}  [${url}]`);

function check(spec, label) {
  stats.specs++;
  const url = buildJazzUrl(spec);
  const resolved = resolveJazzSpec(spec);
  const mei = generateJazzMei(spec);

  const back = parseJazzUrl(url);
  const same = back && Object.keys(spec).every(k => back[k] === spec[k])
    && Object.keys(back).length === Object.keys(spec).length;
  if (!same) fail(label, `url does not round-trip (${JSON.stringify(back)})`, url);
  if (!describeJazzUrl(url)) fail(label, 'no title', url);
  if (!mei.includes('<measure n="0">')) fail(label, 'count-in measure missing', url);

  // 1. Verovio must accept it.
  if (!tk.loadData(mei)) { fail(label, 'verovio rejected the MEI', url); return; }
  if (tk.getPageCount() < 1) { fail(label, 'rendered no pages', url); return; }
  if ((tk.renderToSVG(1, {}) || '').length < 200) fail(label, 'empty SVG', url);

  // 2. Range.
  const high = spec.highFs ? WRITTEN_HIGH_FS : WRITTEN_HIGH;
  const out = resolved.notes.filter(n => n.midi < WRITTEN_LOW || n.midi > high);
  if (out.length) fail(label, `${out.length} notes outside ${WRITTEN_LOW}..${high} (e.g. ${out[0].midi})`, url);
  if (resolved.notes.length < 4) fail(label, `degenerate exercise: ${resolved.notes.length} notes`, url);
  stats.notes += resolved.notes.length;
  stats.minNotes = Math.min(stats.minNotes, resolved.notes.length);
  stats.maxNotes = Math.max(stats.maxNotes, resolved.notes.length);
  stats.maxMeasures = Math.max(stats.maxMeasures, (mei.match(/<measure /g) || []).length);

  // 3. Engraving vs playback.
  const played = readNoteOns(tk.renderToMIDI()).sort((a, b) => a.tick - b.tick || a.midi - b.midi);
  const want = resolved.notes.map(n => n.midi);
  if (played.length !== want.length) {
    fail(label, `MIDI has ${played.length} notes, engraving has ${want.length}`, url);
  } else {
    const bad = want.findIndex((m, i) => played[i].midi !== m);
    if (bad >= 0) fail(label, `MIDI pitch ${bad} sounds ${played[bad].midi}, engraved ${want[bad]}`, url);
  }

  // 4. Timemap: the score views need the one-beat count-in measure ahead of
  //    the first note, and the exercise has to close exactly on a barline.
  const tmap = tk.renderToTimemap({ includeMeasures: true });
  const onsets = tmap.filter(e => e.on && e.on.length).map(e => e.qstamp).sort((a, b) => a - b);
  const offs = tmap.filter(e => e.off && e.off.length).map(e => e.qstamp);
  const bars = (mei.match(/<measure /g) || []).length - 1; // minus the count-in
  if (onsets.length === 0) fail(label, 'timemap has no note onsets', url);
  else if (onsets[0] !== 1) fail(label, `first note at qstamp ${onsets[0]}, expected 1 (after the count-in)`, url);
  const lastOff = Math.max(...offs, 0);
  if (lastOff !== 1 + 4 * bars) fail(label, `ends at qstamp ${lastOff}, expected ${1 + 4 * bars} (${bars} full bars)`, url);

  // 5. Bebop downbeats: in straight eighths every chord tone falls on an even
  //    eighth (1, &-free), which is the whole point of the added passing tone.
  if (spec.pattern === 'scalar' && spec.rhythm === 'eighths' && gen.downbeatAligned(resolved.def)) {
    const chordPcs = new Set(resolved.def.chordTones
      .map(d => resolved.def.degrees.indexOf(d))
      .filter(i => i >= 0)
      .map(i => resolved.line.find(t => t.degree === i))
      .filter(Boolean)
      .map(t => ((t.midi % 12) + 12) % 12));
    const offbeat = resolved.notes
      .map((n, i) => ({ i, pc: ((n.midi % 12) + 12) % 12 }))
      .filter(({ i, pc }) => i % 2 === 1 && chordPcs.has(pc));
    if (offbeat.length) fail(label, `${offbeat.length} chord tones land on offbeats (first at note ${offbeat[0].i})`, url);
  }
}

// Every scale × every pattern.
for (const s of JAZZ_SCALES) for (const p of JAZZ_PATTERNS) {
  check({ root: 'Bb', domain: 'concert', scale: s.id, pattern: p.value, range: 'full',
          rhythm: 'eighths', reps: 1, horn: 'alto', artic: true, highFs: false }, `${s.id}/${p.value}`);
}
// Every root × every horn × both key domains.
for (const root of ROOTS) for (const h of HORNS) for (const domain of ['concert', 'written']) {
  check({ root, domain, scale: 'bebopdom', pattern: 'scalar', range: 'full',
          rhythm: 'eighths', reps: 1, horn: h.id, artic: true, highFs: false }, `${root}/${h.id}/${domain}`);
}
// Every rhythm × range × repeat count × flag combination.
for (const rhythm of ['quarters', 'eighths', '16ths', 'triplets']) for (const range of ['full', 1, 2, 3]) {
  for (const reps of [1, 2, 4]) for (const artic of [true, false]) for (const highFs of [true, false]) {
    check({ root: 'C', domain: 'concert', scale: 'bebopmaj', pattern: 'scalar', range,
            rhythm, reps, horn: 'alto', artic, highFs }, `${rhythm}/${range}/x${reps}`);
  }
}
// Every root × every scale (spelling blowups), and bebop repeats on every root.
for (const root of ROOTS) {
  for (const s of JAZZ_SCALES) {
    check({ root, domain: 'concert', scale: s.id, pattern: 'scalar', range: 2,
            rhythm: 'eighths', reps: 1, horn: 'tenor', artic: false, highFs: false }, `${root}/${s.id}`);
  }
  for (const scale of BEBOP) for (const reps of [1, 3]) {
    check({ root, domain: 'concert', scale, pattern: 'scalar', range: 'full',
            rhythm: 'eighths', reps, horn: 'alto', artic: true, highFs: false }, `${root}/${scale}/x${reps}`);
  }
}

rmSync(outDir, { recursive: true, force: true });

console.log(`checked ${stats.specs} specs · ${stats.notes} notes · shortest ${stats.minNotes}, longest ${stats.maxNotes} notes · up to ${stats.maxMeasures} measures`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURES`);
  for (const f of fails.slice(0, 30)) console.log('  ' + f);
  process.exit(1);
}
console.log('all checks passed');

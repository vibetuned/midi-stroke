/**
 * Offline pipeline: adapt concert-pitch piano MEI scores into single-voice
 * saxophone scores (alto by default), baked into public/saxo/ so the runtime
 * loading/selection code needs no per-load transformation.
 *
 * For each source file it:
 *   1. Transposes via Verovio (key-signature aware) by the sax interval.
 *   2. Drops the bass staff (staffDef/staff n="2" and anything @staff="2").
 *   3. Flattens chords to their top note (melody line).
 *   4. Strips fingerings and now-dangling control events (slurs/ties/dir…).
 *   5. Re-renders to validate and reports the resulting written range.
 *
 * Usage:  node scripts/build-saxo-scores.mjs
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import pkg from '@tonejs/midi';
const { Midi } = pkg;
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

// ---- Configuration -------------------------------------------------------
// Alto saxophone (Eb): the concert-pitch source is transposed UP a major
// sixth to produce the written alto part. Verovio interval syntax.
const SAX = { name: 'alto', interval: 'M6' };

// Flatten chords to the highest-sounding note (the melody).
const FLATTEN = 'top';

// Curated, in-range source files (relative to public/). A mix of recognizable
// folk tunes / studies plus two with treble chords to exercise flattening.
const SOURCES = [
  'piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei',
  'piano/first_two_hand_exercises/005_Beyer_Ferdinand_-_Op_101_-_Nr_8.mei',
  'piano/first_two_hand_exercises/014_Skandinavisches_Volkslied_-_Gubben_Noak.mei',
  'piano/first_two_hand_exercises/015_Deutsches_Volkslied_-_Hänschen_klein.mei',
  'piano/first_two_hand_exercises/021_Deutsches_Volkslied_-_Der_Kuckuck_und_der_Esel.mei',
  'piano/first_two_hand_exercises/022_Deutsches_Volkslied_-_Hänsel_und_Gretel.mei',
  'piano/first_two_hand_exercises/007_Beyer_Ferdinand_-_Op_101_-_Nr_10.mei',
  'piano/first_two_hand_exercises/105_Czerny_Carl_-_Recreations_-_Nr_3.mei',
];

const OUT_COLLECTION = 'saxo/first_two_hand_exercises';

// ---- Pitch helpers (for picking the top note of a chord) -----------------
const PNAME = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const ACCID = { s: 1, f: -1, ss: 2, ff: -2, n: 0, x: 2 };

function notePitch(note) {
  const p = note.getAttribute('pname');
  const o = note.getAttribute('oct');
  if (!p || o === null || o === '') return -Infinity;
  let m = (parseInt(o, 10) + 1) * 12 + (PNAME[p] ?? 0);
  const a = note.getAttribute('accid') || note.getAttribute('accid.ges');
  if (a && ACCID[a] !== undefined) m += ACCID[a];
  return m;
}

const els = (parent, tag) => Array.from(parent.getElementsByTagName(tag));

// ---- Surgery -------------------------------------------------------------
const TIMING_ATTRS = ['dur', 'dur.ppq', 'dots', 'num', 'numbase', 'tstamp'];

function dropBassStaff(doc) {
  // staffDef n="2" under the staffGrp, plus every <staff n="2"> in measures.
  for (const sd of els(doc, 'staffDef')) {
    if (sd.getAttribute('n') === '2') sd.parentNode?.removeChild(sd);
  }
  for (const st of els(doc, 'staff')) {
    if (st.getAttribute('n') === '2') st.parentNode?.removeChild(st);
  }
  // Any control event explicitly bound to staff 2 (dir/dynam/slur/hairpin…).
  for (const node of els(doc, '*')) {
    if (node.getAttribute && node.getAttribute('staff') === '2') {
      node.parentNode?.removeChild(node);
    }
  }
}

function flattenChords(doc) {
  let flattened = 0;
  for (const chord of els(doc, 'chord')) {
    const notes = els(chord, 'note');
    if (notes.length === 0) { chord.parentNode?.removeChild(chord); continue; }
    let keep = notes[0];
    for (const n of notes) {
      if (FLATTEN === 'top' ? notePitch(n) > notePitch(keep) : notePitch(n) < notePitch(keep)) keep = n;
    }
    // The chord carries the rhythm; migrate timing onto the surviving note.
    for (const attr of TIMING_ATTRS) {
      if (!keep.getAttribute(attr) && chord.getAttribute(attr)) {
        keep.setAttribute(attr, chord.getAttribute(attr));
      }
    }
    chord.parentNode?.replaceChild(keep, chord);
    flattened++;
  }
  return flattened;
}

function stripFingeringAndDangling(doc) {
  // Drop all fingerings (piano-specific, and they reference both staves).
  for (const f of els(doc, 'fing')) f.parentNode?.removeChild(f);

  // Collect surviving element ids, then remove any control event whose
  // startid/endid/plist points at something we deleted.
  const ids = new Set();
  for (const n of els(doc, '*')) {
    const id = n.getAttribute && n.getAttribute('xml:id');
    if (id) ids.add('#' + id);
  }
  const refAttrs = ['startid', 'endid'];
  for (const node of els(doc, '*')) {
    if (!node.getAttribute) continue;
    let dangling = false;
    for (const a of refAttrs) {
      const v = node.getAttribute(a);
      if (v && !ids.has(v)) dangling = true;
    }
    const plist = node.getAttribute('plist');
    if (plist && plist.split(/\s+/).some(r => r && !ids.has(r))) dangling = true;
    if (dangling) node.parentNode?.removeChild(node);
  }
}

// ---- Main ----------------------------------------------------------------
const VerovioModule = await createVerovioModule();
const tk = new VerovioToolkit(VerovioModule);

const outDir = join(PUBLIC, OUT_COLLECTION);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const manifest = [];
const report = [];

for (const rel of SOURCES) {
  const srcPath = join(PUBLIC, rel);
  if (!existsSync(srcPath)) { report.push({ file: basename(rel), status: 'MISSING SOURCE' }); continue; }
  const mei = readFileSync(srcPath, 'utf8');

  // 1) transpose (key-signature aware) and re-emit MEI
  tk.setOptions({ transpose: SAX.interval });
  tk.loadData(mei);
  const transposed = tk.getMEI({});

  // 2-4) structural surgery
  const doc = new DOMParser().parseFromString(transposed, 'text/xml');
  dropBassStaff(doc);
  const flattened = flattenChords(doc);
  stripFingeringAndDangling(doc);
  const out = new XMLSerializer().serializeToString(doc);

  // 5) validate by re-rendering + measuring the written range
  tk.setOptions({ transpose: '' }); // don't double-transpose during validation
  const ok = tk.loadData(out);
  const svg = ok ? tk.renderToSVG(1, {}) : '';
  let lo = null, hi = null, noteCount = 0;
  try {
    const midiB64 = tk.renderToMIDI();
    const midi = new Midi(Uint8Array.from(atob(midiB64), c => c.charCodeAt(0)));
    for (const t of midi.tracks) for (const n of t.notes) {
      noteCount++;
      lo = lo === null ? n.midi : Math.min(lo, n.midi);
      hi = hi === null ? n.midi : Math.max(hi, n.midi);
    }
  } catch (e) { /* reported below */ }

  const staff2Left = els(doc, 'staff').some(s => s.getAttribute('n') === '2');
  const chordsLeft = els(doc, 'chord').length;
  const hasCountIn = els(doc, 'measure').some(m => m.getAttribute('n') === '0');

  const name = basename(rel);
  writeFileSync(join(outDir, name), out, 'utf8');
  manifest.push({ path: OUT_COLLECTION, name });
  report.push({
    file: name, status: ok && svg.length > 0 ? 'ok' : 'RENDER FAIL',
    flattened, staff2Left, chordsLeft, hasCountIn, lo, hi, noteCount,
  });
}

// ---- Chromatic test scale (to audit fingering coverage) ------------------
// A single-staff chromatic run with a leading quarter-rest count-in (measure
// n="0") so it loads like any other saxo song. Authored directly, then
// normalized through Verovio. Pitches are WRITTEN (what appears on the staff /
// drives the fingering lookup). This written range A#3..F6 (58..89) is the
// device range A#2..F5 (46..77) shifted up by the +12 input offset — i.e. it
// covers exactly what the TravelSax can produce after mapping. No score-time
// transposition; the notes are authored at these written pitches directly.
const SCALE = { lo: 58, hi: 89, collection: 'saxo/test', name: 'chromatic_Bb3-F6.mei' };
const PC_SPELL = [['c', 0], ['c', 1], ['d', 0], ['d', 1], ['e', 0], ['f', 0], ['f', 1], ['g', 0], ['g', 1], ['a', 0], ['a', 1], ['b', 0]];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = m => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
const midiToNoteEl = (m) => {
  const [pname, sharp] = PC_SPELL[m % 12];
  const oct = Math.floor(m / 12) - 1;
  return `<note dur="4" oct="${oct}" pname="${pname}"${sharp ? ' accid="s"' : ''}/>`;
};
{
  const notes = [];
  for (let m = SCALE.lo; m <= SCALE.hi; m++) notes.push(m);
  const PER = 4; // quarter notes per 4/4 measure
  let measures = `<measure n="0"><staff n="1"><layer><rest dur="4"/></layer></staff></measure>`;
  for (let i = 0; i < notes.length; i += PER) {
    const chunk = notes.slice(i, i + PER).map(midiToNoteEl).join('');
    measures += `<measure n="${i / PER + 1}"><staff n="1"><layer>${chunk}</layer></staff></measure>`;
  }
  const scaleMei = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
<meiHead><fileDesc><titleStmt><title>Chromatic Test Scale ${nameOf(SCALE.lo)}-${nameOf(SCALE.hi)}</title></titleStmt><pubStmt/></fileDesc></meiHead>
<music><body><mdiv><score>
<scoreDef><staffGrp><staffDef n="1" lines="5" ppq="128"><clef shape="G" line="2"/><meterSig count="4" unit="4"/></staffDef></staffGrp></scoreDef>
<section>${measures}</section>
</score></mdiv></body></music></mei>`;

  tk.setOptions({ transpose: '' });
  const okScale = tk.loadData(scaleMei);
  const normalized = tk.getMEI({});
  const scaleDir = join(PUBLIC, SCALE.collection);
  if (!existsSync(scaleDir)) mkdirSync(scaleDir, { recursive: true });
  writeFileSync(join(scaleDir, SCALE.name), normalized, 'utf8');
  manifest.push({ path: SCALE.collection, name: SCALE.name });

  // Verify the rendered MIDI matches the intended notes, then audit coverage.
  let rendered = [];
  try {
    const midi = new Midi(Uint8Array.from(atob(tk.renderToMIDI()), c => c.charCodeAt(0)));
    rendered = midi.tracks.flatMap(t => t.notes.map(n => n.midi)).sort((a, b) => a - b);
  } catch { /* ignore */ }
  const fingeringSrc = readFileSync(join(ROOT, 'src/components/saxo/saxoFingering.ts'), 'utf8');
  const covered = new Set([...fingeringSrc.matchAll(/^\s*(\d+):\s*\{/gm)].map(mm => Number(mm[1])));
  const missing = notes.filter(m => !covered.has(m));
  const renderedOk = rendered.length === notes.length && rendered.every((v, i) => v === notes[i]);

  console.log(`\nTest scale: ${SCALE.collection}/${SCALE.name}`);
  console.log(`  range ${nameOf(SCALE.lo)}..${nameOf(SCALE.hi)} (${SCALE.lo}..${SCALE.hi}), ${notes.length} notes, render ${okScale ? 'ok' : 'FAIL'}, midi-matches-intended: ${renderedOk}`);
  console.log(`  fingering table covers: ${[...covered].sort((a, b) => a - b).map(nameOf).join(' ')}`);
  console.log(`  MISSING fingering (${missing.length}): ${missing.map(nameOf).join(' ') || 'none'}`);
}

// Manifest consumed by SongSelector/SongNavigator via /saxo_files.json
writeFileSync(join(PUBLIC, 'saxo_files.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// ---- Report --------------------------------------------------------------
console.log(`\nSax: ${SAX.name} (transpose ${SAX.interval}), flatten=${FLATTEN}`);
console.log(`Output: public/${OUT_COLLECTION}/  +  public/saxo_files.json\n`);
console.log('status      flat staff2 chords countIn  writtenLo-Hi  notes  file');
for (const r of report) {
  if (r.status === 'MISSING SOURCE') { console.log(`  MISSING  ${r.file}`); continue; }
  const range = r.lo === null ? '   -    ' : `${String(r.lo).padStart(3)}-${String(r.hi).padStart(3)}`;
  console.log(
    `  ${r.status.padEnd(10)} ${String(r.flattened).padStart(2)}   ` +
    `${String(r.staff2Left).padStart(5)}  ${String(r.chordsLeft).padStart(4)}   ` +
    `${String(r.hasCountIn).padStart(5)}    ${range}    ${String(r.noteCount).padStart(4)}  ${r.file}`
  );
}
console.log('');

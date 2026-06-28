/**
 * Generate public/saxo_files.json by scanning whatever .mei files are actually
 * in public/saxo/ (grouped by sub-folder). Use this after adding/organizing
 * saxo scores by hand. Each file is also validated through Verovio so the report
 * flags anything that won't load or isn't single-staff alto material.
 *
 * Usage:  node scripts/build-saxo-manifest.mjs   (or: npm run build:saxo-manifest)
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser } from '@xmldom/xmldom';
import pkg from '@tonejs/midi';
const { Midi } = pkg;
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const SAXO = join(PUBLIC, 'saxo');

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.toLowerCase().endsWith('.mei')) out.push(full);
  }
  return out;
}

const files = walk(SAXO).sort();
const manifest = [];
const report = [];

const VerovioModule = await createVerovioModule();
const tk = new VerovioToolkit(VerovioModule);

for (const full of files) {
  const rel = full.slice(PUBLIC.length + 1).split('\\').join('/'); // saxo/<dir>/<file>.mei
  const slash = rel.lastIndexOf('/');
  const path = rel.slice(0, slash);
  const name = rel.slice(slash + 1);
  manifest.push({ path, name });

  // Validate: parse, render, derive MIDI range + staff count.
  let staffDefs = 0, lo = null, hi = null, notes = 0, ok = false;
  try {
    const mei = readFileSync(full, 'utf8');
    const doc = new DOMParser().parseFromString(mei, 'text/xml');
    staffDefs = doc.getElementsByTagName('staffDef').length;
    ok = tk.loadData(mei) && tk.renderToSVG(1, {}).length > 0;
    const midi = new Midi(Uint8Array.from(atob(tk.renderToMIDI()), c => c.charCodeAt(0)));
    for (const t of midi.tracks) for (const n of t.notes) {
      notes++; lo = lo === null ? n.midi : Math.min(lo, n.midi); hi = hi === null ? n.midi : Math.max(hi, n.midi);
    }
  } catch { /* reported as fail */ }
  report.push({ path, name, ok, staffDefs, lo, hi, notes });
}

writeFileSync(join(PUBLIC, 'saxo_files.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`\nsaxo_files.json — ${manifest.length} files\n`);
let lastPath = '';
for (const r of report) {
  if (r.path !== lastPath) { console.log(`  ${r.path}/`); lastPath = r.path; }
  const status = r.ok ? 'ok  ' : 'FAIL';
  const staff = r.staffDefs === 1 ? '1 staff ' : `${r.staffDefs} STAVES`;
  const range = r.lo === null ? '   -   ' : `${nm(r.lo)}..${nm(r.hi)}`;
  const flag = r.staffDefs !== 1 ? '  ⚠ not single-staff' : '';
  console.log(`    ${status}  ${staff}  ${String(r.notes).padStart(3)} notes  ${range.padEnd(9)}  ${r.name}${flag}`);
}
console.log('');

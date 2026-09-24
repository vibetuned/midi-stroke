/**
 * Bring public/piano_files.json up to date with the .mei files actually in
 * public/piano/ (one collection per sub-folder). The list keeps its order:
 * files already listed stay where they are, files gone from disk are dropped,
 * and new ones are added at the end of their collection, in name order —
 * "010-canon" after "009-canon". Use it after adding scores by hand: the
 * Kunz canons dropped into public/piano/kunz_op14/ become Rhythm echo levels
 * (and piano pieces), and `npm run check:games` then checks every one is a
 * canon.
 *
 * Usage:  node scripts/build-piano-manifest.mjs   (or: npm run build:piano-manifest)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PIANO = join(PUBLIC, 'piano');
const MANIFEST = join(PUBLIC, 'piano_files.json');

// macOS may hand back decomposed accents (NFD); the list keeps them composed.
const nfc = s => s.normalize('NFC');
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });

const onDisk = new Map();   // "piano/<collection>" → file names
for (const dir of readdirSync(PIANO).sort(byName)) {
  if (!statSync(join(PIANO, dir)).isDirectory()) continue;
  const names = readdirSync(join(PIANO, dir)).filter(f => f.toLowerCase().endsWith('.mei')).map(nfc).sort(byName);
  if (names.length) onDisk.set(`piano/${nfc(dir)}`, names);
}

const listed = JSON.parse(readFileSync(MANIFEST, 'utf8')).map(e => ({ path: nfc(e.path), name: nfc(e.name) }));
const exists = e => onDisk.get(e.path)?.includes(e.name);
const kept = listed.filter(exists);
const dropped = listed.filter(e => !exists(e));

// New files join their collection, after what it already lists; new collections go at the end.
const out = [...kept];
let added = 0;
for (const [path, names] of onDisk) {
  const have = new Set(out.filter(e => e.path === path).map(e => e.name));
  const fresh = names.filter(n => !have.has(n)).map(name => ({ path, name }));
  if (!fresh.length) continue;
  const lastOfPath = out.map(e => e.path).lastIndexOf(path);
  out.splice(lastOfPath >= 0 ? lastOfPath + 1 : out.length, 0, ...fresh);
  added += fresh.length;
}

writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`piano_files.json — ${out.length} files (${added} added, ${dropped.length} dropped)`);
for (const [path, names] of onDisk) console.log(`  ${path}: ${names.length}`);
for (const e of dropped) console.log(`  dropped (not on disk): ${e.path}/${e.name}`);

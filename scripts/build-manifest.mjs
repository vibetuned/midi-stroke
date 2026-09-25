/**
 * Bring an instrument's song list, public/<instrument>_files.json, up to date
 * with the .mei files actually in public/<instrument>/ (one collection per
 * sub-folder). The list keeps its order: files already listed stay where they
 * are, files gone from disk are dropped, and new ones are added at the end of
 * their collection, in name order — "010-canon" after "009-canon"; a new
 * collection goes at the end. Use it after adding scores by hand: the Kunz
 * canons dropped into public/piano/kunz_op14/ become Rhythm echo levels (and
 * piano pieces), and `npm run check:games` then checks every one is a canon.
 *
 * Usage:  node scripts/build-manifest.mjs <piano|saxo|drums>
 *         (or: npm run build:piano-manifest, npm run build:saxo-manifest)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const INSTRUMENT = process.argv[2] ?? 'piano';
if (!/^[a-z0-9_-]+$/i.test(INSTRUMENT)) throw new Error(`Not an instrument: ${INSTRUMENT}`);
const FOLDER = join(PUBLIC, INSTRUMENT);
const MANIFEST = join(PUBLIC, `${INSTRUMENT}_files.json`);

// macOS may hand back decomposed accents (NFD); the list keeps them composed.
const nfc = s => s.normalize('NFC');
const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });

const onDisk = new Map();   // "<instrument>/<collection>" → file names
for (const dir of readdirSync(FOLDER).sort(byName)) {
  if (!statSync(join(FOLDER, dir)).isDirectory()) continue;
  const names = readdirSync(join(FOLDER, dir)).filter(f => f.toLowerCase().endsWith('.mei')).map(nfc).sort(byName);
  if (names.length) onDisk.set(`${INSTRUMENT}/${nfc(dir)}`, names);
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
console.log(`${INSTRUMENT}_files.json — ${out.length} files (${added} added, ${dropped.length} dropped)`);
for (const [path, names] of onDisk) console.log(`  ${path}: ${names.length}`);
for (const e of dropped) console.log(`  dropped (not on disk): ${e.path}/${e.name}`);

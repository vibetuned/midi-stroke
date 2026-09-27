/**
 * Bring the Groove MIDI Dataset into the drums app: copy its MIDI files from
 * groove/ (the dataset as downloaded, left out of git) to public/groove/midi/,
 * and write public/groove/index.json — every take with its drummer, style,
 * tempo, meter and length, and, from putting it on the grid
 * (src/utils/grooveMidi.ts), its bars and how much of it is swung.
 *
 *   node scripts/build-groove.mjs        (npm run build:groove)
 *
 * The dataset: https://magenta.tensorflow.org/datasets/groove (CC BY 4.0).
 */
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'groove');
const OUT = join(ROOT, 'public/groove');
if (!existsSync(join(SRC, 'info.csv'))) {
    console.error('groove/info.csv not found: download the Groove MIDI Dataset (MIDI only) into groove/ first.');
    process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'groove-'));
await build({
    entryPoints: [join(ROOT, 'src/utils/grooveMidi.ts')], bundle: true, format: 'esm',
    outfile: join(tmp, 'b.mjs'), logLevel: 'warning', define: { 'import.meta.env.BASE_URL': '"/"' },
});
const G = await import(pathToFileURL(join(tmp, 'b.mjs')).href);
rmSync(tmp, { recursive: true, force: true });

// info.csv: drummer,session,id,style,bpm,beat_type,time_signature,midi_filename,audio_filename,duration,split
const [head, ...lines] = readFileSync(join(SRC, 'info.csv'), 'utf8').trim().split(/\r?\n/);
const cols = head.split(',');
const rows = lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));

const takes = [];
let bytes = 0;
for (const r of rows) {
    const from = join(SRC, r.midi_filename);
    const to = join(OUT, 'midi', r.midi_filename);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    const data = new Uint8Array(readFileSync(from));
    bytes += data.length;
    const q = G.quantize(G.readMidi(data), 'auto');
    const { count } = G.grooveBars(q);
    const busy = new Set(q.hits.map(h => h.unit));
    const offBeat = q.grids.filter((g, u) => g !== 1 && busy.has(u));
    const swung = q.grids.filter((g, u) => g !== 1 && busy.has(u) && q.families[u] === 'T').length;
    const [, session, n] = r.id.split('/');
    takes.push([
        `${r.drummer}.${session}.${n}`,
        r.drummer.replace('drummer', ''),
        r.style,
        Number(r.bpm),
        r.beat_type === 'fill' ? 'fill' : 'beat',
        r.time_signature.replace('-', '/'),
        Math.round(Number(r.duration) * 10) / 10,
        count,
        offBeat.length ? Math.round(swung / offBeat.length * 100) / 100 : 0,
        r.midi_filename,
    ]);
}

const index = {
    source: 'Groove MIDI Dataset (GMD), Magenta, Google — https://magenta.tensorflow.org/datasets/groove',
    paper: 'J. Gillick, A. Roberts, J. Engel, D. Eck and D. Bamman, "Learning to Groove with Inverse Sequence Transformations", ICML 2019',
    licence: 'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/',
    fields: ['id', 'drummer', 'style', 'bpm', 'type', 'meter', 'seconds', 'bars', 'swing', 'file'],
    takes,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index).replace(/\],\[/g, '],\n['));
console.log(`${takes.length} takes, ${(bytes / 1e6).toFixed(1)} MB of MIDI → public/groove/`);

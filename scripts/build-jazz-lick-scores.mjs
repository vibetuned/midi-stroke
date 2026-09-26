/**
 * The 50 most common Jazzomat licks as library scores, for the saxophone and the piano:
 * public/saxo/jazz_licks/ and public/piano/jazz_licks/, then the two manifests brought up to date.
 *
 *   node scripts/build-jazz-lick-scores.mjs [count]      (or: npm run build:jazz-lick-scores)
 *
 * Each is its lick as the players played it (its usual rhythm, over its usual chords), round the
 * circle of fourths from concert C: for the saxophone in alto written pitch, for the piano with
 * the lick in the right hand and the chords as shells in the left. The same generator as the
 * saxophone's lick builder (src/utils/jazzLicks.ts); the licks' data is public/jazz/
 * jazzomat-licks.json (scripts/build-jazz-licks.py).
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COUNT = Number(process.argv[2] ?? 50);
const outDir = mkdtempSync(join(tmpdir(), 'lick-scores-'));
await build({
    entryPoints: [join(ROOT, 'src/utils/jazzLicks.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'),
    logLevel: 'warning', define: { 'import.meta.env.BASE_URL': '"/"' },
});
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);
const { licks } = JSON.parse(readFileSync(join(ROOT, 'public/jazz/jazzomat-licks.json'), 'utf8'));

/** "04 Cm7 F7 - C B♭ A G F E♭ D.mei": its rank, its chords and its notes over C. */
const nameOf = lick => {
    const chords = E.lickChords(lick).split(' → ').join(' ');
    return `${String(lick.rank).padStart(2, '0')} ${chords} - ${E.lickNotes(lick)}.mei`.replace(/\//g, '_');
};

for (const [dir, piano] of [['saxo', false], ['piano', true]]) {
    const folder = join(ROOT, 'public', dir, 'jazz_licks');
    mkdirSync(folder, { recursive: true });
    for (const f of readdirSync(folder)) if (f.endsWith('.mei')) unlinkSync(join(folder, f));
    for (const lick of licks.slice(0, COUNT)) {
        const spec = { rank: lick.rank, root: 'C', domain: 'concert', rhythm: 'played', keys: 'circle', horn: 'alto', chords: true };
        writeFileSync(join(folder, nameOf(lick)), E.generateLickMei(spec, lick, { piano }));
    }
    console.log(`${dir}: ${COUNT} licks in public/${dir}/jazz_licks/`);
    execFileSync('node', [join(ROOT, 'scripts/build-manifest.mjs'), dir], { stdio: 'inherit' });
}
rmSync(outDir, { recursive: true, force: true });

/**
 * Checks for the Groove MIDI Dataset in the drums app (src/utils/grooveMidi.ts,
 * public/groove/): every take, put on the grid, written out and read back
 * through Verovio as the app reads it, plays exactly the hits the grid placed —
 * each at its time, on its drum — in bars of the right length; the grid keeps
 * the playing (little moved, almost nothing lost); and the app's pads sound and
 * score each voice as the drum it is.
 *
 *   node scripts/check-groove.mjs            (npm run check:groove)
 *   node scripts/check-groove.mjs --quick    one take in ten
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUICK = process.argv.includes('--quick');
const outDir = mkdtempSync(join(tmpdir(), 'groove-check-'));
await build({
    entryPoints: { g: join(ROOT, 'src/utils/grooveMidi.ts'), p: join(ROOT, 'src/utils/drumPads.ts'), m: join(ROOT, 'src/utils/drumMap.ts') },
    bundle: true, format: 'esm', outdir: outDir, logLevel: 'warning', define: { 'import.meta.env.BASE_URL': '"/"' },
});
const G = await import(pathToFileURL(join(outDir, 'g.js')).href);
const P = await import(pathToFileURL(join(outDir, 'p.js')).href);
const M = await import(pathToFileURL(join(outDir, 'm.js')).href);
rmSync(outDir, { recursive: true, force: true });

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none', breaks: 'none' });

const PITCH = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const midiOf = n => 12 * (n.oct + 1) + PITCH[n.pname];

// ------------------------------------------------------------------ 1. the data
const index = JSON.parse(readFileSync(join(ROOT, 'public/groove/index.json'), 'utf8'));
const F = Object.fromEntries(index.fields.map((f, i) => [f, i]));
{
    eq('1. 1,150 takes', index.takes.length, 1150);
    ok('1. the licence and the source are in the index', /CC BY 4\.0/.test(index.licence) && /magenta/i.test(index.source));
    ok('1. every take\'s file is there', index.takes.every(t => existsSync(join(ROOT, 'public/groove/midi', t[F.file]))));
    ok('1. ids are unique', new Set(index.takes.map(t => t[F.id])).size === index.takes.length);
    ok('1. the credits are there', existsSync(join(ROOT, 'public/groove/CREDITS.md')));
    const beats = index.takes.filter(t => t[F.type] === 'beat').length;
    eq('1. 503 beats and 647 fills', [beats, index.takes.length - beats], [503, 647]);
}

// ------------------------------------------------------------------ 2. the pads
{
    // Every voice the grid writes sounds as its drum, and scores as it.
    const want = { kick: 36, pedal: 44, snare: 38, rim: 37, hatClosed: 42, hatOpen: 46, ride: 51, crash: 49, tomHigh: 48, tomMid: 47, tomLow: 43 };
    for (const [voice, n] of Object.entries(G.GROOVE_NOTATION)) {
        eq(`2. ${voice} is written where its pad plays`, P.padForScoreNote(midiOf(n), n.head), want[voice]);
    }
    // Rhythm mode matches a hit by where its voice is notated: the ride's pad answers the top line, the hi-hat's the foot.
    eq('2. the ride pad answers a ride on the top line', M.inputScorePitch(M.GM_DRUM_MAP, 51), M.drumScorePosition(77, 'x'));
    eq('2. a closed hi-hat answers the hi-hat foot', M.inputScorePitch(M.GM_DRUM_MAP, 42), M.drumScorePosition(62, 'x'));
    // …and the library's notes are where they always were.
    for (const [midi, head] of [[65], [69], [72], [72, 'slash'], [74], [76], [77, 'diamond'], [77], [79, 'x'], [79, '+'], [81, 'x'], [64, 'x']]) {
        eq(`2. a library note ${midi}${head ? ' ' + head : ''} scores where it is written`, M.drumScorePosition(midi, head), midi);
    }
}

// --------------------------------------------------------- 3. every take, read back
const t0 = Date.now();
let takes = 0, hitsTotal = 0, lostTotal = 0, lostLoud = 0, notesTotal = 0, shiftSum = 0, slowest = { ms: 0 };
for (const [i, t] of index.takes.entries()) {
    if (QUICK && i % 10) continue;
    takes++;
    const id = t[F.id];
    const perf = G.readMidi(new Uint8Array(readFileSync(join(ROOT, 'public/groove/midi', t[F.file]))));
    const q = G.quantize(perf, 'auto');
    const { first, count } = G.grooveBars(q);
    const mei = G.grooveMei(q, { title: id });
    const started = Date.now();
    if (!tk.loadData(mei)) { ok(`3. ${id} loads`, false); continue; }
    const perBarQ = q.meter.count * 4 / q.meter.unit;
    const unitQ = 4 / q.meter.unit;

    // The hits the grid placed, as quarter-note times and written pitches.
    const want = q.hits.map(h => `${((h.unit + h.step / h.grid) * unitQ - first * perBarQ).toFixed(3)}:${midiOf(G.GROOVE_NOTATION[h.voice])}`).sort();
    const got = [];
    const bars = [];
    for (const e of tk.renderToTimemap({ includeMeasures: true })) {
        if (e.measureOn) bars.push(e.qstamp);
        for (const nid of e.on ?? []) got.push(`${e.qstamp.toFixed(3)}:${tk.getMIDIValuesForElement(nid).pitch}`);
    }
    got.sort();
    const ms = Date.now() - started;
    if (ms > slowest.ms) slowest = { ms, id, bars: count };
    const same = got.length === want.length && got.every((g, k) => g === want[k]);
    ok(`3. ${id} plays its hits`, same, same ? '' : `${got.length} played, ${want.length} placed; first difference ${got.find((g, k) => g !== want[k])} vs ${want.find((w, k) => w !== got[k])}`);
    ok(`3. ${id} has its bars, each a full bar`, bars.length === count && bars.every((b, k) => Math.abs(b - k * perBarQ) < 1e-6), `${bars.length} bars for ${count}`);
    // Each head in the notation, as many as the hits of its voices.
    const heads = { x: 0, '+': 0, slash: 0 };
    for (const m of mei.matchAll(/head\.shape="([^"]+)"/g)) heads[m[1]]++;
    const byHead = { x: 0, '+': 0, slash: 0 };
    for (const h of q.hits) { const hd = G.GROOVE_NOTATION[h.voice].head; if (hd) byHead[hd]++; }
    eq(`3. ${id} writes each drum's notehead`, heads, byHead);
    hitsTotal += q.hits.length;
    lostTotal += q.stats.lost;
    lostLoud += q.stats.lostLoud;
    notesTotal += q.stats.notes;
    shiftSum += q.stats.meanShiftMs * q.stats.notes;
    eq(`3. ${id}: the index has its bars`, t[F.bars], count);
}
{
    const lostShare = lostTotal / notesTotal;
    const meanShift = shiftSum / notesTotal;
    console.log(`   ${takes} takes, ${notesTotal} notes → ${hitsTotal} hits; ${(lostShare * 100).toFixed(2)}% lost to the grid (${(lostLoud / notesTotal * 100).toFixed(2)}% loud), hits moved ${meanShift.toFixed(1)} ms on average; ${((Date.now() - t0) / 1000).toFixed(0)} s; slowest ${slowest.id} (${slowest.bars} bars) ${slowest.ms} ms`);
    ok('3. under 1.5% of the strokes are lost to the grid', lostShare < 0.015, (lostShare * 100).toFixed(2) + '%');
    ok('3. …and hardly a loud one: under 0.2%', lostLoud / notesTotal < 0.002, (lostLoud / notesTotal * 100).toFixed(2) + '%');
    ok('3. hits move under 16 ms on average', meanShift < 16, meanShift.toFixed(1) + ' ms');
}

// ------------------------------------------------------------ 4. the grid
{
    const beat = (unit, step, grid, voice = 'snare') => ({ unit, step, grid, voice, vel: 90 });
    // A straight bar with a swung beat: the feel decides.
    const hitsAt = pos => pos.map(t => ({ tick: Math.round(t * 480), note: 38, vel: 90 }));
    const perf = pos => ({ tpq: 480, bpm: 100, meter: { count: 4, unit: 4 }, hits: hitsAt(pos) });
    const straight = G.quantize(perf([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]));
    eq('4. straight eighths are eighths', straight.hits.map(h => h.step / h.grid), [0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0]);
    const swung = G.quantize(perf([0, 0.66, 1, 1.68, 2, 2.65, 3, 3.67, 4]));
    eq('4. swung eighths are triplets', swung.hits.map(h => Math.round(h.step / h.grid * 3)), [0, 2, 0, 2, 0, 2, 0, 2, 0]);
    const late = G.quantize(perf([0.03, 0.28, 0.53, 0.78, 1.03, 1.28, 1.53, 1.78, 2.03, 2.28, 2.53, 2.78, 3.03]));
    eq('4. sixteenths played behind the click are sixteenths', late.hits.map(h => h.step / h.grid), [0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75, 0]);
    eq('4. straight: never a triplet', G.quantize(perf([0, 0.66, 1, 1.68]), 'straight').grids.every(g => g % 3 !== 0), true);
    eq('4. triplets: only triplets', G.quantize(perf([0, 0.5, 1, 1.5]), 'triplets').grids.every(g => g === 1 || g % 3 === 0), true);
    // A flam's grace note is one with its stroke.
    const flam = G.quantize({ tpq: 480, bpm: 100, meter: { count: 4, unit: 4 }, hits: [{ tick: 470, note: 38, vel: 30 }, { tick: 480, note: 38, vel: 100 }] });
    eq('4. a flam is one stroke, as loud as its loudest', flam.hits.map(h => [h.unit, h.step, h.vel]), [[1, 0, 100]]);
    // Written out: a sextuplet, a triplet, a rest, a half note.
    const q = { bpm: 100, meter: { count: 4, unit: 4 }, grids: [6, 3, 1, 1], families: ['T', 'T', 'T', 'T'], hits: [beat(0, 0, 1), beat(0, 1, 6), beat(0, 2, 6), beat(1, 1, 3), beat(2, 0, 1)], stats: {} };
    const mei = G.grooveMei(q);
    ok('4. a sextuplet is written 6:4', /<tuplet num="6" numbase="4"/.test(mei));
    ok('4. a triplet is written 3:2, after a rest on the beat', /<tuplet num="3" numbase="2"[^>]*><beam><rest dur="8"\/>/.test(mei));
    ok('4. a stroke with nothing after it for two beats is a half note', /<note dur="2" stem.dir="up" pname="c"/.test(mei));
    ok('4. an empty kick part is a space', /<layer n="2"><mSpace\/><\/layer>/.test(mei));
    ok('4. the tempo is written', /midi\.bpm="100"/.test(mei) && /♩ = 100/.test(mei));
    const part = G.grooveMei({ ...q, hits: [beat(0, 0, 1), beat(4, 0, 1), beat(8, 0, 1)] }, { fromBar: 2, toBar: 3 });
    eq('4. a part of a take is its bars', [...part.matchAll(/<measure n="(\d+)"/g)].map(m => m[1]), ['2', '3']);
    // The URL.
    const spec = G.parseGrooveUrl('groove:drummer1.session1.1-triplets-b33-64');
    eq('4. a groove URL reads back', spec, { id: 'drummer1.session1.1', feel: 'triplets', fromBar: 33, toBar: 64 });
    eq('4. …and writes back', G.buildGrooveUrl(spec), 'groove:drummer1.session1.1-triplets-b33-64');
    eq('4. the whole take by default', G.parseGrooveUrl('groove:drummer7.eval_session.12-auto'), { id: 'drummer7.eval_session.12', feel: 'auto' });
    eq('4. nothing else is a groove', [G.parseGrooveUrl('groove:x'), G.parseGrooveUrl('lick:1-C')], [null, null]);
}

if (fails.length) {
    console.log(`✗ ${fails.length} of ${checks} checks failed:`);
    for (const f of fails.slice(0, 40)) console.log('  ' + f);
    process.exit(1);
}
console.log(`✓ ${checks} checks passed`);

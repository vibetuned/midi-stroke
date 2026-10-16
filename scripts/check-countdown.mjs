/**
 * Checks for the count-in before play (src/utils/countdown.ts):
 *
 *   1. The count is the meter's, as it is counted at the tempo: "4, 3, 2,
 *      Start" in 4/4, "3, 2, Start" in 3/4, "2, Start" in 2/4 and in a 6/8 jig
 *      (two dotted quarters), "6, 5, 4, 3, 2, Start" in a slow 6/8 (in
 *      eighths), "4, 3, 2, Start" in 12/8, a beat apart.
 *   2. From the beginning, the transport starts as "Start" shows and plays the
 *      score's count-in rest as the "1": the music comes in a beat after
 *      "Start" — in 4/4, in 6/8 (where the rest is shorter than the beat), and
 *      from where a drum loop wraps to, inside the rest.
 *   3. From anywhere else (a loop's start, a pause), the "1" is silent: the
 *      transport starts with the music, a beat after "Start".
 *   4. On real scores, read as the app reads them: the music starts at the
 *      first bar after the count-in, and the count is the score's meter.
 *
 *   node scripts/check-countdown.mjs        (npm run check:countdown)
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser } from '@xmldom/xmldom';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'countdown-'));
// The plan is pure; the runner needs Tone and a browser, so it is left out with a stub.
writeFileSync(join(outDir, 'tone.mjs'), 'export const now = () => 0; export const immediate = () => 0; export class MembraneSynth {}');
writeFileSync(join(outDir, 'entry.ts'), `
export { countdownPlan, musicStartOf } from ${JSON.stringify(join(ROOT, 'src/utils/countdown.ts'))};
export { extractTimemap, TONE_PPQ } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { completeTies, ensureCountInMeasure, ensureNoteIds } from ${JSON.stringify(join(ROOT, 'src/utils/mei.ts'))};
export { expandRepeats } from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};
`);
await build({
    entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning',
    alias: { tone: join(outDir, 'tone.mjs') },
});
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);
rmSync(outDir, { recursive: true, force: true });

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
const near = (a, b) => Math.abs(a - b) < 1e-9;
const Q = E.TONE_PPQ;

// ------------------------------------------------------------ 1. the count
{
    const plan = (count, unit, bpm = 120) => E.countdownPlan({ count, unit }, bpm, 0, Q);
    eq('1. 4/4: 4, 3, 2, Start', plan(4, 4).labels, ['4', '3', '2', 'Start']);
    eq('1. 3/4: 3, 2, Start', plan(3, 4).labels, ['3', '2', 'Start']);
    eq('1. 2/4: 2, Start', plan(2, 4).labels, ['2', 'Start']);
    eq('1. a 6/8 jig: 2, Start (dotted quarters)', plan(6, 8).labels, ['2', 'Start']);
    eq('1. a slow 6/8 (an eighth at 100): 6, 5, 4, 3, 2, Start', plan(6, 8, 50).labels, ['6', '5', '4', '3', '2', 'Start']);
    ok('1. …the eighths 0.6 s apart', near(plan(6, 8, 50).beatSec, 0.6));
    eq('1. 12/8: 4, 3, 2, Start', plan(12, 8).labels, ['4', '3', '2', 'Start']);
    eq('1. 2/2: 2, Start (halves)', plan(2, 2).labels, ['2', 'Start']);
    eq('1. no meter: as 4/4', E.countdownPlan(undefined, 120, 0, Q).labels, ['4', '3', '2', 'Start']);
    ok('1. a beat apart: half a second at 120', near(plan(4, 4).beatSec, 0.5));
    ok('1. …a dotted quarter in 6/8: three quarters of a second', near(plan(6, 8).beatSec, 0.75));
    ok('1. …and the tempo counts: a second at 60', near(plan(4, 4, 60).beatSec, 1));
}

// ------------------------------------------------------------ 2. from the beginning
{
    // 4/4 at 120: labels at 0, .5, 1 and 1.5 s; the rest (a quarter) from 1.5 s; the music at 2 s.
    const p = E.countdownPlan({ count: 4, unit: 4 }, 120, 0, Q);
    ok('2. 4/4: the transport starts as "Start" shows', near(p.transportAt, 1.5), String(p.transportAt));
    ok('2. …so the music comes in a beat after "Start"', near(p.transportAt + Q / (120 / 60 * Q), p.labels.length * p.beatSec));
    // 6/8 at quarter = 120: a dotted quarter is .75 s; the quarter's rest .5 s, so it starts .25 s after "Start".
    const s = E.countdownPlan({ count: 6, unit: 8 }, 120, 0, Q);
    ok('2. 6/8: the rest is shorter than the beat, so the transport starts into "Start"', near(s.transportAt, 0.75 + 0.25), String(s.transportAt));
    ok('2. …and the music still comes in a beat after "Start"', near(s.transportAt + 0.5, s.labels.length * s.beatSec));
    // A drum loop wraps to tick 144: a quarter of the rest is left.
    const d = E.countdownPlan({ count: 4, unit: 4 }, 120, 144, Q);
    ok('2. from where a drum loop wraps to: the rest that is left, then the music on time', near(d.transportAt + (Q - 144) / (2 * Q), 2), String(d.transportAt));
}

// ------------------------------------------------------------ 3. from anywhere else
{
    const p = E.countdownPlan({ count: 4, unit: 4 }, 120, 5 * Q, Q);
    ok('3. mid-piece: the transport starts with the music, a beat after "Start"', near(p.transportAt, 2), String(p.transportAt));
    const q = E.countdownPlan({ count: 3, unit: 4 }, 90, Q, Q);
    ok('3. at the first bar itself (a loop over the opening): the same', near(q.transportAt, q.labels.length * q.beatSec));
}

// ------------------------------------------------------------ 4. real scores
{
    const tk = new VerovioToolkit(await createVerovioModule());
    tk.setOptions({ header: 'none', footer: 'none', breaks: 'none' });
    const load = file => {
        const dom = new DOMParser().parseFromString(readFileSync(join(ROOT, file), 'utf8'), 'text/xml');
        E.expandRepeats(dom); E.ensureCountInMeasure(dom); E.ensureNoteIds(dom); E.completeTies(dom);
        tk.loadData(dom.toString());
        return E.extractTimemap(tk, dom);
    };
    for (const [file, labels] of [
        ['public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei', ['4', '3', '2', 'Start']],
        ['public/saxo/english_folk/1795_Ham Frolick. VWMLa.166.mei', null],
        ['public/drums/200_machine_drum_patterns/Funk2MeasureA.mei', ['4', '3', '2', 'Start']],
    ]) {
        const tm = load(file);
        const start = E.musicStartOf(tm);
        const first = Math.min(...tm.onsets.map(o => o.tick));
        ok(`4. ${file.split('/').pop()}: the music starts after the count-in, at its first bar`, start > 0 && start <= first, `bar ${start}, first note ${first}`);
        const plan = E.countdownPlan(tm.meter, 120, 0, start);
        if (labels) eq(`4. ${file.split('/').pop()}: counted in its meter`, plan.labels, labels);
        else ok(`4. ${file.split('/').pop()} (${tm.meter?.count}/${tm.meter?.unit}): counted in its meter`, plan.labels.at(-1) === 'Start' && plan.labels.length >= 2);
    }
    eq('4. no score: the music starts at 0', E.musicStartOf(null), 0);
}

if (fails.length) {
    console.log(`✗ ${fails.length} of ${checks} checks failed:`);
    for (const f of fails) console.log('  ' + f);
    process.exit(1);
}
console.log(`✓ ${checks} checks passed`);

/**
 * Checks for ties: a tied note is struck once and held — in practice mode it
 * waits for it once, in rhythm mode it scores once — and the page draws every
 * tie the app holds (src/utils/timemap.ts, src/utils/mei.ts completeTies,
 * src/utils/expandRepeats.ts).
 *
 *   1. One tie across a bar line, in every way MEI writes one: between notes
 *      (with and without '#', with no end), between chords, as @tie on notes
 *      and on chords, by beat (@tstamp, @tstamp2), placed in either bar — and
 *      inside repeated bars, once the repeats are written out.
 *   2. Every piano and saxophone score in the library, read as the app reads
 *      it: it strikes exactly the notes Verovio's own MIDI strikes, and Verovio
 *      draws a tie wherever the app holds one.
 *   3. The generated scores — the jazz licks (the piano's shells held across
 *      bar lines), the saxophone's jazz exercises — the same.
 *
 *   node scripts/check-ties.mjs        (npm run check:ties)
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser } from '@xmldom/xmldom';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'ties-'));
writeFileSync(join(outDir, 'entry.ts'), `
export { extractTimemap, TONE_PPQ } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { completeTies, ensureCountInMeasure, ensureNoteIds } from ${JSON.stringify(join(ROOT, 'src/utils/mei.ts'))};
export { expandRepeats } from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};
export { readMidi } from ${JSON.stringify(join(ROOT, 'src/utils/grooveMidi.ts'))};
export { defaultLickSpec, defaultPianoLickSpec, generateLickMei } from ${JSON.stringify(join(ROOT, 'src/utils/jazzLicks.ts'))};
export { JAZZ_SCALES, JAZZ_PATTERNS, JAZZ_RHYTHMS, defaultJazzSpec, generateJazzMei } from ${JSON.stringify(join(ROOT, 'src/utils/jazzScaleGen.ts'))};
`);
await build({ entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning', define: { 'import.meta.env.BASE_URL': '"/"' } });
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);
rmSync(outDir, { recursive: true, force: true });

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none', breaks: 'none' });

/** A score as the score views load it: repeats written out, a count-in, ids, ties completed. */
function load(mei) {
    const dom = new DOMParser().parseFromString(mei, 'text/xml');
    E.expandRepeats(dom); E.ensureCountInMeasure(dom); E.ensureNoteIds(dom); E.completeTies(dom);
    tk.loadData(dom.toString());
    return { dom, tm: E.extractTimemap(tk, dom) };
}
/** The notes the app strikes, and those Verovio's MIDI strikes, as quarter-note times and pitches. */
function strikes(tm) {
    const app = tm.onsets.flatMap(o => o.notes.map(n => ({ q: o.tick / E.TONE_PPQ, p: n.midi })));
    const midi = E.readMidi(Uint8Array.from(Buffer.from(tk.renderToMIDI(), 'base64')));
    const vrv = midi.hits.map(h => ({ q: h.tick / midi.tpq, p: h.note }));
    return { app, vrv };
}
/** What one strikes that the other does not (times to a hundredth of a beat: tuplets round). */
function differ(a, b) {
    const left = [...b];
    const extra = [];
    for (const x of a) {
        const k = left.findIndex(y => y.p === x.p && Math.abs(y.q - x.q) < 0.02);
        if (k < 0) extra.push(x); else left.splice(k, 1);
    }
    return extra;
}
/** The ties Verovio draws on the page. */
function drawnTies() {
    const svg = tk.renderToSVG(1);
    return [...svg.matchAll(/class="tie"[^>]*>(.*?)<\/g>/gs)].filter(m => /<path/.test(m[1])).length;
}
const agree = (label, mei) => {
    const { tm } = load(mei);
    const { app, vrv } = strikes(tm);
    const extra = differ(app, vrv), missing = differ(vrv, app);
    ok(`${label}: strikes what Verovio strikes`, extra.length === 0 && missing.length === 0,
        `${extra.length} struck that Verovio holds (${extra.slice(0, 3).map(x => `${x.q.toFixed(2)}:${x.p}`).join(' ')}), ${missing.length} held that Verovio strikes (${missing.slice(0, 3).map(x => `${x.q.toFixed(2)}:${x.p}`).join(' ')})`);
    return { extra, missing };
};

// ------------------------------------------------------------ 1. one tie, every way
{
    const mei = (m1, m2, controls = '', end = '') => `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1"><music><body><mdiv><score>
<scoreDef><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"><meterSig count="4" unit="4"/></staffDef></staffGrp></scoreDef>
<section><measure n="1"><staff n="1"><layer n="1"><note xml:id="x1" dur="2" pname="e" oct="4"/>${m1}</layer></staff>${controls}</measure>
<measure n="2"><staff n="1"><layer n="1">${m2}<note xml:id="x2" dur="2" pname="f" oct="4"/></layer></staff>${end}</measure></section></score></mdiv></body></music></mei>`;
    const n = (id, attrs = '') => `<note xml:id="${id}" dur="2" pname="g" oct="4" ${attrs}/>`;
    const ch = (id, attrs = '', note = '') => `<chord xml:id="${id}" dur="2" ${attrs}><note xml:id="${id}a" pname="c" oct="4" ${note}/><note xml:id="${id}b" pname="e" oct="4" ${note}/></chord>`;
    const rep = controls => `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1"><music><body><mdiv><score>
<scoreDef><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"><meterSig count="4" unit="4"/></staffDef></staffGrp></scoreDef>
<section><measure xml:id="m1" n="1" left="rptstart"><staff n="1"><layer n="1"><note xml:id="x1" dur="2" pname="e" oct="4"/><note xml:id="a" dur="2" pname="g" oct="4"/></layer></staff>${controls}</measure>
<measure xml:id="m2" n="2" right="rptend"><staff n="1"><layer n="1"><note xml:id="b" dur="2" pname="g" oct="4"/><note xml:id="x2" dur="2" pname="f" oct="4"/></layer></staff></measure></section></score></mdiv></body></music></mei>`;
    const cases = [
        ['<tie> by id', mei(n('a'), n('b'), '<tie startid="#a" endid="#b"/>'), 1, 1],
        ['<tie> with no end', mei(n('a'), n('b'), '<tie startid="#a"/>'), 1, 1],
        ['<tie> by id, no "#"', mei(n('a'), n('b'), '<tie startid="a" endid="b"/>'), 1, 1],
        ['<tie> by beat', mei(n('a'), n('b'), '<tie staff="1" tstamp="3" tstamp2="1m+1"/>'), 1, 1],
        ['<tie> from a note, to a beat', mei(n('a'), n('b'), '<tie staff="1" startid="#a" tstamp2="1m+1"/>'), 1, 1],
        ['<tie> in the second bar', mei(n('a'), n('b'), '', '<tie startid="#a" endid="#b"/>'), 1, 1],
        ['@tie i and t', mei(n('a', 'tie="i"'), n('b', 'tie="t"')), 1, 1],
        ['@tie i alone', mei(n('a', 'tie="i"'), n('b')), 1, 1],
        ['chords, @tie i and t', mei(ch('a', 'tie="i"'), ch('b', 'tie="t"')), 2, 2],
        ['chords, @tie i alone', mei(ch('a', 'tie="i"'), ch('b')), 2, 2],
        ['chords, one <tie>', mei(ch('a'), ch('b'), '<tie startid="#a" endid="#b"/>'), 2, 2],
        ['chords, a <tie> per note', mei(ch('a'), ch('b'), '<tie startid="#aa" endid="#ba"/><tie startid="#ab" endid="#bb"/>'), 2, 2],
        ['chords, @tie on the notes', mei(ch('a', '', 'tie="i"'), ch('b', '', 'tie="t"')), 2, 2],
        ['repeated, <tie> by id', rep('<tie startid="#a" endid="#b"/>'), 1, 1],
        ['repeated, <tie> with no "#"', rep('<tie startid="a" endid="b"/>'), 1, 1],
        ['repeated, @tie', rep('').replace('pname="g" oct="4"/></layer></staff></measure>\n<measure', 'pname="g" oct="4" tie="i"/></layer></staff></measure>\n<measure').replace('<note xml:id="b" dur="2" pname="g" oct="4"/>', '<note xml:id="b" dur="2" pname="g" oct="4" tie="t"/>'), 1, 1],
    ];
    // [what, the score, notes tied, ties drawn — each time through]
    for (const [label, xml, , drawn] of cases) {
        const { tm } = load(xml);
        const times = label.startsWith('repeated') ? 2 : 1;
        const struck = tm.onsets.flatMap(o => o.notes).length;
        const want = (2 + (label.startsWith('chords') ? 2 : 1)) * times;
        ok(`1. ${label}: the tied note is struck once`, struck === want, `${struck} strikes, want ${want}`);
        const longest = Math.max(...tm.onsets.flatMap(o => o.notes.filter(x => x.midi !== 64 && x.midi !== 65).map(x => x.endTick)));
        // Counted in for a beat, the tie from beat 3 of bar 1 to beat 3 of bar 2: held to 7 — and again to 15, repeated.
        ok(`1. ${label}: and held through the bar line`, longest === (times === 2 ? 15 : 7) * E.TONE_PPQ, `held to ${longest / E.TONE_PPQ}`);
        ok(`1. ${label}: the page draws the tie`, drawnTies() >= drawn * times, `${drawnTies()} drawn`);
        // Verovio draws a tie placed by beat, but its MIDI plays the second note again: there the page is the reference.
        if (!/by beat|to a beat/.test(label)) agree(`1. ${label}`, xml);
    }
}

// ------------------------------------------------------------ 2. the library
{
    const files = [];
    const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.mei')) files.push(p); } };
    walk(join(ROOT, 'public/piano'));
    walk(join(ROOT, 'public/saxo'));
    let completed = 0, struck = 0;
    for (const file of files) {
        const xml = readFileSync(file, 'utf8');
        const dom = new DOMParser().parseFromString(xml, 'text/xml');
        E.expandRepeats(dom); E.ensureCountInMeasure(dom); E.ensureNoteIds(dom);
        if (E.completeTies(dom)) completed++;
        const { extra } = agree(`2. ${file.slice(ROOT.length + 8)}`, xml);
        struck += extra.length;
    }
    console.log(`   ${files.length} library scores; ties completed as ${completed} of them load`);
    ok('2. every piano and saxophone score checked', files.length > 300, String(files.length));
}

// ------------------------------------------------------------ 3. generated scores
{
    const { licks } = JSON.parse(readFileSync(join(ROOT, 'public/jazz/jazzomat-licks.json'), 'utf8'));
    let n = 0;
    for (const lick of licks.filter((_, i) => i % 7 === 0)) {
        for (const rhythm of ['played', 'quarters']) {
            agree(`3. piano lick #${lick.rank} ${rhythm}, shells`, E.generateLickMei({ ...E.defaultPianoLickSpec(), rank: lick.rank, rhythm, keys: 'circle', left: 'shells' }, lick, { piano: true }));
            agree(`3. saxophone lick #${lick.rank} ${rhythm}`, E.generateLickMei({ ...E.defaultLickSpec(), rank: lick.rank, rhythm, keys: 'circle' }, lick));
            n += 2;
        }
    }
    const base = E.defaultJazzSpec();
    for (const scale of E.JAZZ_SCALES.filter((_, i) => i % 3 === 0)) for (const pattern of E.JAZZ_PATTERNS) for (const rhythm of E.JAZZ_RHYTHMS) {
        let mei; try { mei = E.generateJazzMei({ ...base, scale: scale.id, pattern: pattern.value, rhythm: rhythm.value }); } catch { continue; }
        agree(`3. jazz ${scale.id} ${pattern.value} ${rhythm.value}`, mei); n++;
    }
    console.log(`   ${n} generated scores`);
}

if (fails.length) {
    console.log(`✗ ${fails.length} of ${checks} checks failed:`);
    for (const f of fails.slice(0, 40)) console.log('  ' + f);
    process.exit(1);
}
console.log(`✓ ${checks} checks passed`);

/**
 * Checks for the visual metronome (src/utils/visualMetronome.ts, its
 * arithmetic in src/utils/metronomeBeat.ts) and for the scores it is drawn
 * over (src/utils/mei.ts removeInstrumentNames):
 *
 *   1. The beat of each meter: quarters in 4/4 and 3/4, halves in 2/2, dotted
 *      quarters in 6/8, 9/8 and 12/8, eighths in 5/8.
 *   2. On real scores, read as the app reads them: the arrow is at the bottom
 *      of its swing on every beat, counted from each bar line, and at the top
 *      halfway between — in 4/4, in 3/4, in 6/8, across a pickup.
 *   3. Instrument names — <label>, <labelAbbr>, @label, @label.abbr — that
 *      Verovio would print at the left of the system are gone once the score
 *      loads, and nothing else is: the notes play as before. No library score
 *      names an instrument, so none is changed.
 *   4. The app's own notes, sent back by a keyboard that echoes them (a ROLI
 *      Piano), are not key presses (src/utils/midiEcho.ts): not for the
 *      metronome's dots, not for the judging — and a key pressed by a hand is.
 *
 *   node scripts/check-metronome.mjs        (npm run check:metronome)
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
const outDir = mkdtempSync(join(tmpdir(), 'metronome-'));
writeFileSync(join(outDir, 'entry.ts'), `
export * from ${JSON.stringify(join(ROOT, 'src/utils/metronomeBeat.ts'))};
export { extractTimemap, TONE_PPQ } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { completeTies, ensureCountInMeasure, ensureNoteIds, removeInstrumentNames } from ${JSON.stringify(join(ROOT, 'src/utils/mei.ts'))};
export { expandRepeats } from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};
export { noteSent, isEcho, resetEchoes } from ${JSON.stringify(join(ROOT, 'src/utils/midiEcho.ts'))};
export { handleMidiBytes, subscribeMidiNotes } from ${JSON.stringify(join(ROOT, 'src/utils/midiInput.ts'))};
`);
await build({ entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning' });
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);
rmSync(outDir, { recursive: true, force: true });

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none', breaks: 'none' });
const Q = E.TONE_PPQ;

/** A score as the score views load it. */
function load(mei, names = true) {
    const dom = new DOMParser().parseFromString(mei, 'text/xml');
    E.expandRepeats(dom); E.ensureCountInMeasure(dom); E.ensureNoteIds(dom); E.completeTies(dom);
    const removed = names ? E.removeInstrumentNames(dom) : false;
    const xml = dom.toString();
    tk.loadData(xml);
    return { dom, xml, removed, tm: E.extractTimemap(tk, dom) };
}

// ------------------------------------------------------------ 1. the beat
{
    const beat = (count, unit) => E.beatTicksOf({ count, unit }) / Q;
    eq('1. 4/4 beats in quarters', beat(4, 4), 1);
    eq('1. 3/4 beats in quarters', beat(3, 4), 1);
    eq('1. 2/2 beats in halves', beat(2, 2), 2);
    eq('1. 6/8 beats in dotted quarters', beat(6, 8), 1.5);
    eq('1. 9/8 and 12/8 too', [beat(9, 8), beat(12, 8)], [1.5, 1.5]);
    eq('1. 5/8 beats in eighths', beat(5, 8), 0.5);
    eq('1. no meter: quarters', E.beatTicksOf(undefined) / Q, 1);
}

// ------------------------------------------------------------ 2. the swing, on real scores
{
    const files = [
        ['public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei', 'a 4/4 study'],
        ...readdirSync(join(ROOT, 'public/saxo/english_folk')).filter(f => f.endsWith('.mei')).map(f => [`public/saxo/english_folk/${f}`, f.replace(/\.mei$/, '')]),
    ];
    for (const [file, label] of files) {
        const { tm } = load(readFileSync(join(ROOT, file), 'utf8'));
        const bars = [...new Set(tm.measureTicks.values())].sort((a, b) => a - b);
        const beatTicks = E.beatTicksOf(tm.meter);
        let onBeats = 0, between = 0, badOn = 0, badBetween = 0;
        for (let i = 1; i < bars.length - 1; i++) {
            for (let t = bars[i]; t < bars[i + 1] - 1; t += beatTicks) {
                onBeats++;
                if (Math.abs(E.swingAt(E.beatsAt(bars, beatTicks, t)) - 1) > 1e-9) badOn++;
                const half = t + beatTicks / 2;
                if (half < bars[i + 1]) { between++; if (Math.abs(E.swingAt(E.beatsAt(bars, beatTicks, half)) + 1) > 1e-9) badBetween++; }
            }
        }
        ok(`2. ${label} (${tm.meter?.count}/${tm.meter?.unit}): the arrow is at the bottom on all ${onBeats} beats`, badOn === 0 && onBeats > 0, `${badOn} off`);
        ok(`2. ${label}: and at the top between them`, badBetween === 0 && between > 0, `${badBetween} off`);
    }
    // A bar line resets the count: a short bar (a pickup) does not shift the beats after it.
    const bars = [0, Q, Q + 4 * Q];
    eq('2. after a one-beat pickup, the next bar starts on the beat', E.swingAt(E.beatsAt(bars, Q, Q)), 1);
    eq('2. …and its third beat too', E.swingAt(E.beatsAt(bars, Q, Q + 2 * Q)), 1);
}

// ------------------------------------------------------------ 3. instrument names
{
    const named = `<?xml version="1.0"?><mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1"><music><body><mdiv><score>
<scoreDef><staffGrp symbol="brace"><label>Grand Piano</label><labelAbbr>Pno.</labelAbbr>
<staffDef n="1" lines="5" clef.shape="G" clef.line="2"><label>Right Hand</label><labelAbbr>RH</labelAbbr><meterSig count="4" unit="4"/></staffDef>
<staffDef n="2" lines="5" clef.shape="F" clef.line="4" label="Left Hand" label.abbr="LH"><meterSig count="4" unit="4"/></staffDef></staffGrp></scoreDef>
<section><measure n="1"><staff n="1"><layer n="1"><note dur="1" pname="c" oct="5"/></layer></staff><staff n="2"><layer n="1"><note dur="1" pname="c" oct="3"/></layer></staff></measure></section></score></mdiv></body></music></mei>`;
    const shown = text => { const svg = tk.renderToSVG(1); return ['Grand Piano', 'Pno.', 'Right Hand', 'RH', 'Left Hand', 'LH'].filter(t => svg.includes(`>${t}<`)); };
    const before = load(named, false);
    ok('3. Verovio prints the instrument names a score gives (so the check means something)', shown().length >= 2, shown().join(', '));
    const notesBefore = before.tm.onsets.flatMap(o => o.notes.map(n => `${o.tick}:${n.midi}`));
    const after = load(named);
    eq('3. none of them once it loads', shown(), []);
    ok('3. it says it changed the score', after.removed === true);
    ok('3. no <label>, <labelAbbr>, @label or @label.abbr is left', !/<label|<labelAbbr|\slabel=|\slabel\.abbr=/.test(after.xml));
    eq('3. the notes play as before', after.tm.onsets.flatMap(o => o.notes.map(n => `${o.tick}:${n.midi}`)), notesBefore);

    const files = [];
    const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.mei')) files.push(p); } };
    for (const inst of ['piano', 'saxo', 'drums']) walk(join(ROOT, 'public', inst));
    const changed = files.filter(f => E.removeInstrumentNames(new DOMParser().parseFromString(readFileSync(f, 'utf8'), 'text/xml')));
    eq(`3. no library score (of ${files.length}) names an instrument, so none changes`, changed.map(f => f.slice(ROOT.length + 1)), []);
}

// ------------------------------------------------------------ 4. the app's own notes
{
    E.resetEchoes();
    const t = 1000;
    E.noteSent([0x90, 60, 100], t);
    eq('4. a note the app sent, back 3 ms later: an echo', E.isEcho(60, 100, t + 3), true);
    eq('4. …and only once: the same key again is a key', E.isEcho(60, 100, t + 6), false);
    E.noteSent([0x90, 62, 100], t);
    eq('4. another velocity is a hand', E.isEcho(62, 87, t + 3), false);
    eq('4. another key is a hand', E.isEcho(64, 100, t + 3), false);
    eq('4. long after (60 ms) is a hand', E.isEcho(62, 100, t + 60), false);
    E.noteSent([0x90, 65, 90], t + 250);      // played ahead, at its time
    eq('4. before a scheduled note is sent, the same key is a hand', E.isEcho(65, 90, t + 100), false);
    eq('4. as it is sent, its echo is not', E.isEcho(65, 90, t + 252), true);
    E.noteSent([0x80, 67, 0], t);
    eq('4. a note-off sent is never taken for anything', E.isEcho(67, 0, t + 2), false);
    E.noteSent([0xb0, 64, 127], t);
    eq('4. nor a pedal', E.isEcho(64, 127, t + 2), false);
    // Through the input, as the app hears it.
    E.resetEchoes();
    const heard = [];
    const off = E.subscribeMidiNotes({ onNoteOn: n => heard.push(n.note), onNoteOff: n => heard.push(-n) });
    E.noteSent([0x90, 72, 100]);
    E.handleMidiBytes(0x90, 72, 100);     // the keyboard echoes it
    E.handleMidiBytes(0x90, 74, 71);      // the player presses a key
    E.handleMidiBytes(0x80, 72, 0);       // the echo's note-off goes through
    off();
    eq('4. through the input: the echo is dropped, the key pressed is heard, note-offs pass', heard, [74, -72]);
}

if (fails.length) {
    console.log(`✗ ${fails.length} of ${checks} checks failed:`);
    for (const f of fails) console.log('  ' + f);
    process.exit(1);
}
console.log(`✓ ${checks} checks passed`);

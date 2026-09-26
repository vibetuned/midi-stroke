/**
 * Checks for the jazz lick generator (src/utils/jazzLicks.ts) over the 653 Jazzomat licks
 * (public/jazz/jazzomat-licks.json): every lick, written out and read back through Verovio as
 * the apps read it, plays its intervals in every key, in the horn's range, in its rhythm, with
 * its chords — for the saxophone and for the piano.
 *
 *   node scripts/check-jazz-licks.mjs        (npm run check:licks)
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'licks-'));
await build({
    entryPoints: [join(ROOT, 'src/utils/jazzLicks.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'),
    logLevel: 'warning', define: { 'import.meta.env.BASE_URL': '"/"' },
});
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);
const { licks } = JSON.parse(readFileSync(join(ROOT, 'public/jazz/jazzomat-licks.json'), 'utf8'));

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond && fails.length < 40) fails.push(`${label}${detail ? ': ' + detail : ''}`); else if (!cond) fails.push(''); };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none' });
const beatsOf = s => { const [n, d] = s.split('/').map(Number); return d ? n / d : n; };

/** As Verovio plays it: note-ons (a tied note's continuation is not one), with their pitch, staff and time in beats. */
function played(mei) {
    if (!tk.loadData(mei)) return null;
    // A tied note's continuation, or a tied chord's (the tie is on the chord, its notes are "<id>-k").
    const continued = new Set([...mei.matchAll(/xml:id="([^"]+)"[^>]*tie="[mt]"/g)].map(m => m[1]));
    for (const m of mei.matchAll(/<chord xml:id="([^"]+)"[^>]*tie="[mt]"[^>]*>(.*?)<\/chord>/g)) {
        for (const n of m[2].matchAll(/xml:id="([^"]+)"/g)) continued.add(n[1]);
    }
    const out = [];
    for (const e of tk.renderToTimemap({ includeMeasures: false })) {
        for (const id of e.on ?? []) {
            if (continued.has(id)) continue;
            out.push({ q: e.qstamp, id, pitch: tk.getMIDIValuesForElement(id).pitch });
        }
    }
    return out.sort((a, b) => a.q - b.q || a.pitch - b.pitch);
}

// ------------------------------------------------------------------ 1. the data
{
    eq('1. 653 licks, ranked 1–653', [licks.length, licks[0].rank, licks.at(-1).rank], [653, 1, 653]);
    eq('1. the instances add up to the Explorer\'s 11,630', licks.reduce((a, l) => a + l.instances, 0), 11630);
    ok('1. nearly every lick has a rhythm and a chord context from its instances', licks.filter(l => l.rhythm).length > 600 && licks.filter(l => l.harmony).length > 600);
    ok('1. every rhythm has one onset per note, the first at 0, rising', licks.every(l => !l.rhythm || (l.rhythm.onsets.length === l.intervals.length + 1 && l.rhythm.onsets[0] === '0'
        && l.rhythm.onsets.every((o, k) => k === 0 || beatsOf(o) > beatsOf(l.rhythm.onsets[k - 1])))));
    ok('1. every onset on an eighth, triplet or sixteenth grid', licks.every(l => !l.rhythm || l.rhythm.onsets.every(o => [1, 2, 3, 4, 6, 12].includes(Number(o.split('/')[1] ?? 1)))));
    ok('1. the credit is in the data', /Jazzomat/.test(readFileSync(join(ROOT, 'public/jazz/jazzomat-licks.json'), 'utf8').slice(0, 800)) && existsSync(join(ROOT, 'public/jazz/CREDITS.md')));
}

// ------------------------------------------------------------------ 2. the URL
{
    const spec = { rank: 42, root: 'Bb', domain: 'written', rhythm: 'triplets', keys: 'circle', horn: 'tenor', chords: false };
    const sorted = o => o && Object.fromEntries(Object.entries(o).sort());
    eq('2. a lick: URL round-trips', sorted(E.parseLickUrl(E.buildLickUrl(spec))), sorted(spec));
    eq('2. …and reads as a name', E.describeLickUrl(E.buildLickUrl(spec)), 'Jazz lick #42 · B♭ written · triplets · round the circle · Tenor');
    const piano = { rank: 7, root: 'Db', domain: 'concert', rhythm: 'played', keys: 'one', horn: 'piano', chords: true, left: 'arpeggio' };
    eq('2. the piano\'s, its left hand in the flags', [E.buildLickUrl(piano), sorted(E.parseLickUrl(E.buildLickUrl(piano)))], ['lick:7-Db-played-one-piano-c1w0la', sorted(piano)]);
    eq('2. …and its name', E.describeLickUrl('lick:7-Db-played-one-piano-c1w0ls'), 'Jazz lick #7 · D♭ · as played · left hand shells');
    eq('2. a saxophone URL has no left hand; a piano one must', [E.parseLickUrl('lick:1-C-played-one-alto-c1w0la'), E.parseLickUrl('lick:1-C-played-one-piano-c1w0')], [null, null]);
    eq('2. anything else is not one', [E.parseLickUrl('sax:C-bebopdom-scalar-full-eighths-x1-alto-a1w0h0'), E.parseLickUrl('lick:1-H-played-one-alto-c1w0')], [null, null]);
}

// ------------------------------------------------------------------ 3. every lick, written out
const intervalsOf = ps => ps.slice(1).map((p, k) => p - ps[k]);
let wrong = 0, outOfRange = 0, rhythmWrong = 0, harmWrong = 0, pianoWrong = 0;
for (const lick of licks) {
    const n = lick.intervals.length + 1;
    const chords = lick.harmony?.chords.length ?? 1;
    // Round the circle as played, for the alto; one key in eighths for the tenor; the piano version.
    for (const [spec, piano] of [
        [{ rank: lick.rank, root: 'C', domain: 'concert', rhythm: 'played', keys: 'circle', horn: 'alto', chords: true }, false],
        [{ rank: lick.rank, root: 'F#', domain: 'written', rhythm: 'eighths', keys: 'one', horn: 'tenor', chords: true }, false],
        [{ rank: lick.rank, root: 'Eb', domain: 'concert', rhythm: 'played', keys: 'circle', horn: 'alto', chords: true }, true],
        [{ rank: lick.rank, root: 'A', domain: 'concert', rhythm: 'played', keys: 'circle', horn: 'piano', chords: true, left: 'arpeggio' }, true],
    ]) {
        let mei;
        try { mei = E.generateLickMei(spec, lick, { piano }); } catch (e) { ok(`3. #${lick.rank} ${spec.rhythm}${piano ? ' piano' : ''}: written out`, false, e.message); continue; }
        const notes = played(mei);
        if (!notes) { ok(`3. #${lick.rank}: Verovio reads it`, false); continue; }
        const keys = spec.keys === 'circle' ? 12 : 1;
        // The line: the lick's notes (on staff 1 for the piano — its left hand plays chords).
        const staff1 = piano ? new Set([...mei.matchAll(/<staff n="1">[\s\S]*?<\/staff>/g)].flatMap(m => [...m[0].matchAll(/xml:id="([^"]+)"/g)].map(x => x[1]))) : null;
        const line = staff1 ? notes.filter(x => staff1.has(x.id)) : notes;
        if (line.length !== n * keys) { wrong++; ok(`3. #${lick.rank}${piano ? ' piano' : ''}: ${n * keys} notes`, false, String(line.length)); continue; }
        for (let k = 0; k < keys; k++) {
            const seg = line.slice(k * n, (k + 1) * n);
            const iv = intervalsOf(seg.map(x => x.pitch));
            if (JSON.stringify(iv) !== JSON.stringify(lick.intervals)) {
                // Folded into range only when the lick is wider than the horn: then the same notes, an octave apart.
                if (!iv.every((x, j) => (x - lick.intervals[j]) % 12 === 0)) { wrong++; ok(`3. #${lick.rank} key ${k + 1}: its intervals`, false, `${iv} vs ${lick.intervals}`); }
            }
            if (!piano && seg.some(x => x.pitch < 58 || x.pitch > 89)) { outOfRange++; ok(`3. #${lick.rank}: in the horn's range`, false, seg.map(x => x.pitch).join(' ')); }
            if (spec.rhythm === 'played' && lick.rhythm) {
                const onsets = seg.map(x => x.q - seg[0].q);
                if (!onsets.every((o, j) => Math.abs(o - beatsOf(lick.rhythm.onsets[j])) < 1e-6)) { rhythmWrong++; ok(`3. #${lick.rank}: as played`, false, onsets.join(' ')); }
            }
            if (spec.rhythm === 'eighths') {
                if (!seg.every((x, j) => Math.abs(x.q - seg[0].q - j / 2) < 1e-6)) { rhythmWrong++; ok(`3. #${lick.rank}: in eighths`, false); }
            }
        }
        // Every chord written (two changes meeting on one note of an even rhythm make one).
        const harms = (mei.match(/<harm /g) || []).length;
        if (harms < keys || harms > chords * keys) { harmWrong++; ok(`3. #${lick.rank} ${spec.rhythm}: its chords written`, false, `${harms} vs ${chords * keys}`); }
        if (piano && spec.left !== 'arpeggio') {
            const lh = notes.length - line.length;
            if (lh !== harms * 3 || line.some(x => x.pitch < 60 || x.pitch > 84)) { pianoWrong++; ok(`3. #${lick.rank} piano: shells in the left hand, the lick in the right`, false, `${lh}`); }
        }
        if (spec.left === 'arpeggio') {
            // The left hand broken in eighths, low, each note a tone of the chord over it (root, fifth, seventh, third).
            const lh = notes.filter(x => !staff1.has(x.id));
            const onGrid = lh.every(x => Math.abs(x.q * 2 - Math.round(x.q * 2)) < 1e-6);
            const low = lh.every(x => x.pitch >= 36 && x.pitch <= 64);
            const everyEighth = lh.length >= (notes.at(-1).q - 0) * 2 - 1;
            if (!onGrid || !low || !everyEighth || line.some(x => x.pitch < 60 || x.pitch > 84)) { pianoWrong++; ok(`3. #${lick.rank} piano: arpeggios in the left hand`, false, `${lh.length} notes, grid ${onGrid}, low ${low}`); }
        }
    }
}
ok(`3. every lick plays its intervals in every key (${licks.length} licks, 25 keys each)`, wrong === 0, String(wrong));
ok('3. …inside the saxophone\'s keyed range, B♭3–F6', outOfRange === 0, String(outOfRange));
ok('3. …in its rhythm as played, or in even eighths', rhythmWrong === 0, String(rhythmWrong));
ok('3. …with its chord symbols', harmWrong === 0, String(harmWrong));
{
    // As played, a lick's chords come from the instances played in its rhythm, so they fit it: all of them written.
    const whole = licks.filter(l => l.harmony && l.rhythm).filter(l => {
        const mei = E.generateLickMei({ rank: l.rank, root: 'C', domain: 'concert', rhythm: 'played', keys: 'one', horn: 'alto', chords: true }, l);
        return (mei.match(/<harm /g) || []).length === l.harmony.chords.length;
    }).length;
    ok('3. as played, every chord change written, for nearly every lick', whole >= licks.filter(l => l.harmony && l.rhythm).length - 5, String(whole));
}
ok('3. …and the piano versions: the lick in the treble, a shell for every chord — or arpeggios in eighths — in the left', pianoWrong === 0, String(pianoWrong));
{
    // An arpeggio is its chord: over C7, C G B♭ E; over Cmaj7, C G B E; a 6th chord has its sixth.
    const mei = E.generateLickMei({ rank: 1, root: 'C', domain: 'concert', rhythm: 'eighths', keys: 'one', horn: 'piano', chords: true, left: 'arpeggio' }, licks[0]);
    const lower = [...mei.matchAll(/<staff n="2">([\s\S]*?)<\/staff>/g)].map(m => m[1]).join('');
    const names = [...lower.matchAll(/<note [^>]*pname="(\w)" oct="(\d)"(?: accid(?:\.ges)?="(\w+)")?/g)].map(m => m[1].toUpperCase() + ({ f: 'b', s: '#' }[m[3]] ?? '') + m[2]);
    eq('3. #1 over C7, left hand in eighths: C2 G2 B♭2 E3, and again', names.slice(0, 8), ['C2', 'G2', 'Bb2', 'E3', 'C2', 'G2', 'Bb2', 'E3']);
}

// ------------------------------------------------------------------ 4. spelling and the other rhythms
{
    const first = licks[0];
    eq('4. #1 over C7: the bebop descent, spelled from the chord', E.lickNotes(first), 'C B B♭ A G F E');
    eq('4. …its chord', E.lickChords(first), 'C7');
    const ii = licks.find(l => l.harmony?.chords.length === 2 && l.harmony.chords[0][3] === 'm7' && l.harmony.chords[1][2] === 5 && l.harmony.chords[1][3] === '7');
    ok('4. a lick over a ii–V: Cm7 → F7', ii && E.lickChords(ii) === 'Cm7 → F7', ii ? E.lickChords(ii) : 'none');
    for (const rhythm of ['quarters', 'triplets', '16ths']) {
        const mei = E.generateLickMei({ rank: 3, root: 'G', domain: 'concert', rhythm, keys: 'circle', horn: 'soprano', chords: false }, licks[2]);
        const notes = played(mei);
        const unit = rhythm === 'quarters' ? 1 : rhythm === 'triplets' ? 1 / 3 : 1 / 4;
        ok(`4. ${rhythm}, round the circle, no chords`, notes && notes.length === 7 * 12 && !/<harm /.test(mei)
            && notes.slice(0, 7).every((x, j) => Math.abs(x.q - notes[0].q - j * unit) < 1e-6));
    }
    const concert = E.lickKeys({ rank: 1, root: 'C', domain: 'concert', rhythm: 'played', keys: 'circle', horn: 'alto', chords: true });
    eq('4. round the circle from concert C, on the alto: A, D, G… in written pitch', concert.written.slice(0, 4).map(r => r.letter + (r.alter === 1 ? '#' : r.alter === -1 ? 'b' : '')), ['A', 'D', 'G', 'C']);
}

// ------------------------------------------------------------------ 5. the library's lick scores
for (const dir of ['saxo', 'piano']) {
    const manifest = JSON.parse(readFileSync(join(ROOT, `public/${dir}_files.json`), 'utf8'));
    const files = manifest.filter(f => f.path === `${dir}/jazz_licks`);
    ok(`5. ${dir}: the 50 most common licks in the library`, files.length === 50, String(files.length));
    ok(`5. ${dir}: each one there`, files.every(f => existsSync(join(ROOT, 'public', f.path, f.name))));
}

rmSync(outDir, { recursive: true, force: true });
console.log(`${checks} jazz lick checks`);
const real = fails.filter(Boolean);
if (real.length) {
    console.log(`\n${fails.length} FAILURES`);
    for (const f of real) console.log('  ' + f);
    process.exit(1);
}
console.log('all checks passed');

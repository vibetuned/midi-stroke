/**
 * Checks for the results at the end of a piece (src/components/SessionResults.tsx):
 * the session as it is played (src/utils/sessionLog.ts) and what is made of
 * it (src/utils/sessionResults.ts).
 *
 *   1. The log: events kept in order, time counted only while playing, both
 *      cleared together — and still counting after a clear mid-play.
 *   2. The record: missed notes told apart from wrong keys, precision out of
 *      the notes to play, accuracy as the header shows it, the hits' timing in
 *      ms — at one tempo and across a tempo change.
 *   3. The notes to play on a real score: a chord is one, and one hand plays
 *      only its own staff's.
 *   4. The history: the newest kept past fifty; this session against the
 *      last and the best.
 *   5. The wave on a real score: a session played exactly on its notes puts
 *      every note on a beat in a trough, starting after the count-in.
 *
 *   node scripts/check-session.mjs        (npm run check:session)
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
const outDir = mkdtempSync(join(tmpdir(), 'session-'));
writeFileSync(join(outDir, 'entry.ts'), `
export * from ${JSON.stringify(join(ROOT, 'src/utils/sessionLog.ts'))};
export * from ${JSON.stringify(join(ROOT, 'src/utils/sessionResults.ts'))};
export { beatsAt, swingAt, pulseTicksOf } from ${JSON.stringify(join(ROOT, 'src/utils/metronomeBeat.ts'))};
export { musicStartOf } from ${JSON.stringify(join(ROOT, 'src/utils/countdown.ts'))};
export { extractTimemap, TONE_PPQ } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { completeTies, ensureCountInMeasure, ensureNoteIds, removeInstrumentNames } from ${JSON.stringify(join(ROOT, 'src/utils/mei.ts'))};
export { expandRepeats } from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};
`);
// countdown.ts (musicStartOf) imports Tone, which the checks never run: a stand-in.
writeFileSync(join(outDir, 'tone.mjs'), 'export const now = () => 0; export const immediate = () => 0; export class MembraneSynth {}');
await build({ entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning', alias: { tone: join(outDir, 'tone.mjs') } });
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);
rmSync(outDir, { recursive: true, force: true });

const fails = [];
let checks = 0;
const ok = (label, cond, detail = '') => { checks++; if (!cond) fails.push(`${label}${detail ? ': ' + detail : ''}`); };
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
const Q = E.TONE_PPQ;

// ------------------------------------------------------------ 1. the log
{
    E.clearSessionLog(0);
    E.sessionPlaying(false, 0);
    E.clearSessionLog(0);
    E.logSessionEvent({ tick: 10, kind: 'hit', offset: 2 });
    E.logSessionEvent({ tick: 20, kind: 'wrong' });
    E.logSessionEvent({ tick: 30, kind: 'miss' });
    eq('1. events kept in the order they happened', E.sessionEvents().map(e => e.kind), ['hit', 'wrong', 'miss']);
    E.sessionPlaying(true, 1000);
    E.sessionPlaying(true, 1500);              // again: still the same stretch
    E.sessionPlaying(false, 3000);
    E.sessionPlaying(false, 3500);             // again: nothing more
    E.sessionPlaying(true, 10000);             // a pause of 6.5 s, not counted
    eq('1. time is counted while playing, pauses left out', E.sessionPlayedMs(10500), 2500);
    E.clearSessionLog(11000);
    eq('1. a clear empties the events', E.sessionEvents().length, 0);
    eq('1. …and the time, still counting if it is playing', E.sessionPlayedMs(12000), 1000);
    E.sessionPlaying(false, 12000);
    E.clearSessionLog(13000);
    eq('1. a clear while paused starts from nothing', E.sessionPlayedMs(20000), 0);
}

// ------------------------------------------------------------ 2. the record
{
    const msPerTick120 = 60000 / (120 * Q);
    const events = [
        { tick: 192, kind: 'hit', offset: 0 },
        { tick: 384, kind: 'hit', offset: Math.round(20 / msPerTick120) },     // ~20 ms late
        { tick: 576, kind: 'hit', offset: -Math.round(20 / msPerTick120) },    // ~20 ms early
        { tick: 600, kind: 'wrong' },
        { tick: 768, kind: 'miss' },
        { tick: 960, kind: 'miss' },
    ];
    const t = { at: 1, notes: 6, score: 3, correct: 3, wrongsCounted: 3, maxCombo: 3, bpm: 120, playedMs: 4321.4 };
    const r = E.summarizeSession(t, events);
    eq('2. missed notes are counted apart from wrong keys', [r.misses, r.wrongs], [2, 1]);
    eq('2. precision: right first time out of the notes to play', r.precision, 0.5);
    eq('2. accuracy: right out of right, wrong and missed, as the header shows', r.accuracy, 0.5);
    eq('2. the time played, in whole ms', r.playedMs, 4321);
    ok('2. timing: early and late cancel in the mean', Math.abs(r.timing.meanMs) <= 1, JSON.stringify(r.timing));
    ok('2. …and show in the spread (~16 ms)', Math.abs(r.timing.spreadMs - 16) <= 1, JSON.stringify(r.timing));
    const late = E.timingOf([0, 1, 2].map(i => ({ tick: i * Q, kind: 'hit', offset: 19.2 })), 120);   // a tenth of a beat
    eq('2. a tenth of a beat late at ♩ = 120 is 50 ms late', late, { meanMs: 50, spreadMs: 0 });
    const changing = E.timingOf([0, 1, 2].map(i => ({ tick: i * 4 * Q, kind: 'hit', offset: 19.2 })), tick => tick < 4 * Q ? 120 : 60);
    eq('2. at the tempo of each note: 50 ms at ♩ = 120, 100 ms at ♩ = 60', changing.meanMs, Math.round((50 + 100 + 100) / 3));
    eq('2. no timing with fewer than three timed hits', E.timingOf(events.slice(0, 2), 120), null);
    eq('2. practice hits carry no offset, so no timing', E.summarizeSession(t, [{ tick: 1, kind: 'hit' }, { tick: 2, kind: 'hit' }, { tick: 3, kind: 'hit' }]).timing, undefined);
    eq('2. precision never above 100%', E.summarizeSession({ ...t, score: 9 }, []).precision, 1);
    eq('2. nothing to play: 0, not NaN', [E.summarizeSession({ ...t, notes: 0, correct: 0, wrongsCounted: 0 }, []).precision, E.summarizeSession({ ...t, notes: 0, correct: 0, wrongsCounted: 0 }, []).accuracy], [0, 0]);
}

// ------------------------------------------------------------ 3. the notes to play
const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none', breaks: 'none' });
function load(file) {
    const dom = new DOMParser().parseFromString(readFileSync(join(ROOT, file), 'utf8'), 'text/xml');
    E.expandRepeats(dom); E.ensureCountInMeasure(dom); E.ensureNoteIds(dom); E.completeTies(dom); E.removeInstrumentNames(dom);
    tk.loadData(dom.toString());
    return E.extractTimemap(tk, dom);
}
const czerny = load('public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei');
{
    const both = E.countNotes(czerny);
    const right = E.countNotes(czerny, s => s === 1);
    const left = E.countNotes(czerny, s => s === 2);
    eq('3. both hands: every moment with a note, a chord as one', both, czerny.onsets.length);
    ok('3. one hand: only its own staff\'s moments', right > 0 && left > 0 && right <= both && left <= both && right + left >= both, `right ${right}, left ${left}, both ${both}`);
    const chordMoments = czerny.onsets.filter(o => o.notes.length > 1).length;
    ok('3. the study has chords (so the count means something)', chordMoments > 0, String(chordMoments));
}

// ------------------------------------------------------------ 4. the history
{
    const rec = (i, p = i / 100) => ({ at: i, precision: p, accuracy: p, notes: 10, correct: 0, wrongs: 0, misses: 0, maxCombo: 0, bpm: 120, playedMs: 0 });
    let h;
    for (let i = 1; i <= 60; i++) h = E.appendHistory(h, rec(i));
    eq(`4. the newest ${E.HISTORY_MAX} are kept, oldest first`, [h.length, h[0].at, h[h.length - 1].at], [E.HISTORY_MAX, 11, 60]);
    const first = E.compareSessions([], rec(1, 0.7));
    eq('4. the first time: nothing to compare with', [first.last, first.best, first.delta, first.personalBest], [null, null, null, false]);
    const prev = [rec(1, 0.6), rec(2, 0.9), rec(3, 0.8)];
    const better = E.compareSessions(prev, rec(4, 0.86));
    eq('4. against the last session, in points', better.delta, 6);
    eq('4. …and the best before', [better.best, better.personalBest], [0.9, false]);
    eq('4. a new best', E.compareSessions(prev, rec(4, 0.95)).personalBest, true);
    eq('4. equalling the best is not a new one', E.compareSessions(prev, rec(4, 0.9)).personalBest, false);
    eq('4. worse than last time', E.compareSessions(prev, rec(4, 0.75)).delta, -5);
}

// ------------------------------------------------------------ 5. the wave, on a real score
{
    const span = E.musicSpan(czerny);
    eq('5. the wave starts after the count-in, where the music does', span.start, E.musicStartOf(czerny));
    eq('5. …and ends with the piece', span.end, czerny.totalTicks);
    const beatTicks = E.pulseTicksOf(czerny.meter, 120);
    // A session played exactly on the notes, as useGameLogic logs it.
    const events = czerny.onsets.map(o => ({ tick: o.tick, kind: 'hit', offset: 0 }));
    const onBeat = events.filter(e => Math.abs(E.beatsAt(span.bars, beatTicks, e.tick) % 1) < 1e-9);
    const inTrough = onBeat.filter(e => Math.abs(E.swingAt(E.beatsAt(span.bars, beatTicks, e.tick)) - 1) < 1e-9);
    ok('5. most of the study\'s notes are on a beat (so the check means something)', onBeat.length > events.length / 2, `${onBeat.length} of ${events.length}`);
    eq('5. every note on a beat, played on it, is in a trough', inTrough.length, onBeat.length);
    ok('5. none of them before the music starts', events.every(e => e.tick >= span.start), '');
    const r = E.summarizeSession({ at: 0, notes: E.countNotes(czerny), score: E.countNotes(czerny), correct: events.length, wrongsCounted: 0, maxCombo: events.length, bpm: 120, playedMs: 0 }, events);
    eq('5. played exactly: 100%, on time', [r.precision, r.accuracy, r.timing.meanMs, r.timing.spreadMs], [1, 1, 0, 0]);
}

// ------------------------------------------------------------ the words
eq('formatPlayed', [E.formatPlayed(0), E.formatPlayed(61_400), E.formatPlayed(151_000)], ['0:00', '1:01', '2:31']);
eq('describeTiming', [E.describeTiming(4), E.describeTiming(-9), E.describeTiming(18), E.describeTiming(-12)], ['on time', 'on time', '18 ms late', '12 ms early']);

if (fails.length) {
    console.log(`✗ ${fails.length} of ${checks} checks failed:`);
    for (const f of fails) console.log('  ' + f);
    process.exit(1);
}
console.log(`✓ ${checks} checks passed`);

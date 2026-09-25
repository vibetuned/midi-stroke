/**
 * Write a score's repeats out in the file, so the page reads straight
 * through, as the library's scores do. The same step the viewers and the
 * games take as a score loads, for one people bring (src/utils/expandRepeats.ts);
 * here it is baked in, and checked before the file is written:
 *   - with plain repeats, the order must be the one Verovio plays, and the
 *     written-out score must play as the original does;
 *   - with first and second endings (which Verovio does not play), it must
 *     play as the original does with that order made explicit (an
 *     <expansion>, which Verovio follows).
 * The same notes at the same times, and no repeats left. A score it can't
 * write out (D.C., D.S., segno or coda marks) is reported and left alone.
 *
 * Usage:  node scripts/expand-repeats.mjs [file.mei …]
 *         (no files: every MEI under public/ with a repeat sign or an ending)
 *         npm run expand-repeats
 */
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

const outDir = mkdtempSync(join(tmpdir(), 'expand-'));
writeFileSync(join(outDir, 'entry.ts'), `export * from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};`);
await build({ entryPoints: [join(outDir, 'entry.ts')], bundle: true, format: 'esm', outfile: join(outDir, 'b.mjs'), logLevel: 'warning' });
const E = await import(pathToFileURL(join(outDir, 'b.mjs')).href);

const REPEAT_SIGN = /\b(left|right)="rpt(start|end|both)"|<ending\b/;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith('.mei')) out.push(p);
    }
    return out;
}

const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none' });

/** The measures in the order Verovio plays them, a bar played again as "<id>-rend2". */
function verovioOrder(text) {
    tk.loadData(text);
    const order = [];
    for (const e of tk.renderToTimemap({ includeMeasures: true })) if (e.measureOn && order[order.length - 1] !== e.measureOn) order.push(e.measureOn);
    return order;
}

/** Every note-on as Verovio plays it: its time and its notes, the copies' suffixes taken off. */
function onsets(text) {
    tk.loadData(text);
    return tk.renderToTimemap({ includeMeasures: true, includeRests: false })
        .filter(e => e.on?.length)
        .map(e => `${Math.round(e.qstamp * 1000)}:${e.on.map(id => id.replace(/-rend\d+$/, '').replace(/-r\d+$/, '')).sort().join(',')}`);
}

const files = process.argv.length > 2
    ? process.argv.slice(2).map(f => resolve(f))
    : walk(PUBLIC).filter(f => REPEAT_SIGN.test(readFileSync(f, 'utf8')));
if (files.length === 0) console.log('No repeats to write out.');
let failed = 0;
for (const file of files) {
    const name = relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    if (!E.hasRepeats(dom)) { console.log(`  ${name}: no repeats`); continue; }
    const why = E.unexpandable(dom);
    if (why) { console.log(`✗ ${name}: ${why} — write these out by hand`); failed++; continue; }
    const order = E.repeatOrder(dom);
    if ('error' in order) { console.log(`✗ ${name}: ${order.error}; left alone`); failed++; continue; }
    // What to check it against: the original as Verovio plays it, or — with endings — as it plays the order made explicit.
    let reference = text;
    if (dom.getElementsByTagName('ending').length === 0) {
        const verovio = verovioOrder(text);
        if (verovio.join(' ') !== order.join(' ')) { console.log(`✗ ${name}: the order is not the one Verovio plays (${verovio.join(' ')}); left alone`); failed++; continue; }
    } else {
        const explicit = new DOMParser().parseFromString(text, 'text/xml');
        const section = explicit.getElementsByTagName('section').item(0);
        // Verovio's <expansion> names an ending by the ending, not the measures in it.
        const byId = new Map();
        const ms = explicit.getElementsByTagName('measure');
        for (let k = 0; k < ms.length; k++) byId.set(ms.item(k).getAttribute('xml:id'), ms.item(k));
        const plist = [];
        order.forEach((id, k) => {
            const el = byId.get(id.replace(/-rend\d+$/, ''));
            const ending = el.parentNode.nodeName === 'ending' ? el.parentNode : null;
            if (ending && !ending.getAttribute('xml:id')) ending.setAttribute('xml:id', `expand-repeats-ending-${k}`);
            const ref = `#${ending ? ending.getAttribute('xml:id') : el.getAttribute('xml:id')}`;
            if (!ending || plist[plist.length - 1] !== ref) plist.push(ref);
        });
        const expansion = explicit.createElementNS(explicit.documentElement.namespaceURI, 'expansion');
        expansion.setAttribute('xml:id', 'expand-repeats-check');
        expansion.setAttribute('plist', plist.join(' '));
        section.insertBefore(expansion, section.firstChild);
        reference = new XMLSerializer().serializeToString(explicit);
    }
    const r = E.writeOutRepeats(dom, order);
    if ('error' in r) { console.log(`✗ ${name}: ${r.error}; left alone`); failed++; continue; }
    const result = new XMLSerializer().serializeToString(dom);
    const before = onsets(reference), after = onsets(result);
    const at = before.findIndex((o, k) => o !== after[k]);
    if (before.length !== after.length || at >= 0 || REPEAT_SIGN.test(result)) {
        console.log(`✗ ${name}: the written-out score does not play as the original (${REPEAT_SIGN.test(result) ? 'repeats left' : `note-on ${at}: ${before[at]} vs ${after[at]}`}); left alone`);
        failed++;
        continue;
    }
    writeFileSync(file, result);
    console.log(`✓ ${name}: ${r.bars[0]} bars written out to ${r.bars[1]}, ${after.length} note-ons as before`);
}
rmSync(outDir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

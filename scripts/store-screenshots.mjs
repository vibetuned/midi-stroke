/**
 * The App Store and Google Play screenshots, at the sizes each asks for, and
 * Google Play's feature graphic — made from the app itself, so they follow it
 * as it changes:
 *
 *   ios-iphone-6.9      2868 × 1320   iPhone 6.9″, held sideways (the phone layout)
 *   ios-ipad-13         2752 × 2064   iPad 13″ (the desktop layout)
 *   android-phone       1920 × 1080   16:9 (the phone layout)
 *   android-tablet      2560 × 1440   16:9 (the desktop layout)
 *   google-play/feature-graphic.png   1024 × 500
 *
 * Each set: the instruments; the piano, played; the results at the end of a
 * piece; a drum groove; the saxophone, played. "Played" by a stand-in MIDI
 * keyboard that presses each note at its time, as a player would; the results
 * are those of the piece played twice, a rough take and a clean one.
 *
 *   npm run store:screenshots        → store/screenshots/<set>/NN-<scene>.png
 *
 * Starts the dev server and a headless Google Chrome itself (CHROME=… for
 * another browser path). Takes a few minutes.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { DOMParser } from '@xmldom/xmldom';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store', 'screenshots');
const PORT = 5179, CDP = 9339;
const BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SETS = [
    { id: 'ios-iphone-6.9', w: 956, h: 440, dpr: 3, layout: 'mobile' },
    { id: 'ios-ipad-13', w: 1376, h: 1032, dpr: 2, layout: 'desktop' },
    { id: 'android-phone', w: 960, h: 540, dpr: 2, layout: 'mobile' },
    { id: 'android-tablet', w: 1600, h: 900, dpr: 1.6, layout: 'desktop' },
];
const PIECES = {
    czerny: { file: 'public/piano/first_two_hand_exercises/001_Czerny_Carl_-_Op_824_-_Nr_1.mei', collection: 'first two hand exercises', title: '001 Czerny' },
    hanon: { file: 'public/piano/virtuoso_pianist_part_1/01.mei', collection: 'virtuoso pianist part 1', title: '' },
    grenadiers: { file: 'public/saxo/english_folk/1810_British Grenadiers. RH.171.mei', collection: 'english folk', title: 'British Grenadiers' },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const children = [];
const stop = () => { for (const c of children) { try { c.kill(); } catch { /* gone */ } } };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

// ------------------------------------------------------------ the notes, as the app reads them
const tmp = mkdtempSync(join(tmpdir(), 'store-shots-'));
writeFileSync(join(tmp, 'entry.ts'), `
export { extractTimemap } from ${JSON.stringify(join(ROOT, 'src/utils/timemap.ts'))};
export { completeTies, ensureCountInMeasure, ensureNoteIds, removeInstrumentNames } from ${JSON.stringify(join(ROOT, 'src/utils/mei.ts'))};
export { expandRepeats } from ${JSON.stringify(join(ROOT, 'src/utils/expandRepeats.ts'))};
`);
await build({ entryPoints: [join(tmp, 'entry.ts')], bundle: true, format: 'esm', outfile: join(tmp, 'b.mjs'), logLevel: 'error' });
const E = await import(pathToFileURL(join(tmp, 'b.mjs')).href);
const tk = new VerovioToolkit(await createVerovioModule());
tk.setOptions({ header: 'none', footer: 'none', breaks: 'none' });
function onsetsOf(file) {
    const dom = new DOMParser().parseFromString(readFileSync(join(ROOT, file), 'utf8'), 'text/xml');
    E.expandRepeats(dom); E.ensureCountInMeasure(dom); E.ensureNoteIds(dom); E.completeTies(dom); E.removeInstrumentNames(dom);
    tk.loadData(dom.toString());
    return E.extractTimemap(tk, dom).onsets.map(o => ({ tick: o.tick, notes: o.notes.map(n => n.midi) }));
}
// The Hanon study's file name, whatever it is: the collection's first.
{
    const list = JSON.parse(readFileSync(join(ROOT, 'public/piano_files.json'), 'utf8'));
    const first = list.find(f => f.path === 'piano/virtuoso_pianist_part_1');
    PIECES.hanon.file = `public/piano/virtuoso_pianist_part_1/${first.name}`;
    PIECES.hanon.title = first.name.replace(/\.mei$/, '').replace(/_/g, ' ').slice(0, 12);
}
const NOTES = Object.fromEntries(Object.entries(PIECES).map(([k, p]) => [k, onsetsOf(p.file)]));
rmSync(tmp, { recursive: true, force: true });

// ------------------------------------------------------------ the dev server and the browser
function start(cmd, args, opts) {
    const c = spawn(cmd, args, { cwd: ROOT, stdio: 'ignore', ...opts });
    children.push(c);
    return c;
}
async function waitFor(url, ms = 30000) {
    const t = Date.now();
    for (;;) {
        try { if ((await fetch(url)).ok) return; } catch { /* not yet */ }
        if (Date.now() - t > ms) throw new Error(`${url} did not come up`);
        await sleep(300);
    }
}
// Plain http, as the Tauri shell's dev server (vite.config.ts serves https only outside it).
start('npx', ['vite', '--port', String(PORT), '--strictPort', '--mode', 'tauri']);
const profile = mkdtempSync(join(tmpdir(), 'store-chrome-'));
start(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--hide-scrollbars', 'about:blank']);
await waitFor(BASE);
await waitFor(`http://127.0.0.1:${CDP}/json/version`);

/** A fresh tab, driven over the DevTools protocol, with a MIDI keyboard that plays what it is told. */
async function tab() {
    const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', e => {
        const m = JSON.parse(e.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async x => {
        const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
        return r.result?.result?.value;
    };
    const until = async (x, ms = 30000) => { const t0 = Date.now(); for (;;) { if (await ev(x) === true) return; if (Date.now() - t0 > ms) throw new Error(`timed out: ${x.slice(0, 80)}`); await sleep(150); } };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      (() => { const listeners = new Set();
        const input = { name: 'Digital Piano', id: 'store', type: 'input', state: 'connected',
          addEventListener: (t, fn) => { if (t === 'midimessage') listeners.add(fn); }, removeEventListener: (t, fn) => listeners.delete(fn) };
        const access = { inputs: new Map([['store', input]]), outputs: new Map(), onstatechange: null, sysexEnabled: false };
        navigator.requestMIDIAccess = () => Promise.resolve(access);
        window.__midi = (n, v) => listeners.forEach(fn => fn({ data: new Uint8Array([v ? 0x90 : 0x80, n, v]) }));
      })();` });
    return { ws, send, ev, until, close: () => ws.close() };
}

// ------------------------------------------------------------ the scenes
const clickText = (ev, text) => ev(`(() => { const bs = [...document.querySelectorAll('button,[role=button],[role=option],.app-card')];
    const el = bs.find(b => b.innerText.trim() === ${JSON.stringify(text)}) ?? bs.find(b => b.innerText.includes(${JSON.stringify(text)}));
    if (!el) return false; el.click(); return true; })()`);
const key = async (send, k, code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
};

/** Press each onset's keys at its time, as the transport is heard; `miss` skips some, `shift` transposes. */
const player = (ev, onsets, { miss = 0, shift = 0 } = {}) => ev(`(async () => {
    const { heardTicks } = await import('/src/utils/visualMetronome.ts');
    const onsets = ${JSON.stringify(onsets)};
    let i = 0;
    const from = heardTicks();
    while (i < onsets.length && onsets[i].tick < from - 1) i++;
    const step = () => {
        if (i >= onsets.length) return;
        const o = onsets[i];
        const late = ((i * 37) % 17) - 5;
        if (heardTicks() >= o.tick + late) {
            if (!(${miss} && i % ${miss} === 4)) {
                const keys = o.notes.map(n => n + ${shift});
                keys.forEach(n => window.__midi(n, 64 + (i * 13) % 40));
                setTimeout(() => keys.forEach(n => window.__midi(n, 0)), 140);
            }
            i++;
        }
        requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
})()`);

async function openApp(t, set, instrument) {
    await t.send('Page.navigate', { url: `${BASE}?layout=${set.layout}` });
    await t.until(`/Select your instrument/.test(document.body.innerText)`);
    await sleep(700);
    await clickText(t.ev, instrument);
    await t.until(`/Start Training/.test(document.body.innerText)`);
    await clickText(t.ev, 'Start Training');
    await t.until(`!/Start Training/.test(document.body.innerText)`);
    if (await t.ev(`/Skip \\(Use Standard/i.test(document.body.innerText)`)) await clickText(t.ev, 'Skip (Use Standard');
    await t.until(`/Select Music/.test(document.body.innerText)`);
    await sleep(300);
}
async function openPiece(t, piece) {
    await clickText(t.ev, piece.collection);
    await sleep(400);
    await t.ev(`[...document.querySelectorAll('button')].find(b => b.innerText.split('\\n')[0].includes(${JSON.stringify(piece.title)}))?.click()`);
    await t.until(`!/Loading Score|Rendering SVG|Slicing Textures/.test(document.body.innerText) && !!document.querySelector('canvas')`, 60000);
    await sleep(1200);
}
const play = t => t.ev(`(document.querySelector('.mobile-play') ?? [...document.querySelectorAll('button')].find(b => /^(Play|Pause)/.test(b.title)))?.click()`);
const resultsOpen = `!!document.querySelector('[role=dialog][aria-label="Session results"]')`;

async function shot(t, set, name) {
    const dir = join(OUT, set.id);
    mkdirSync(dir, { recursive: true });
    const s = await t.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(dir, `${name}.png`), Buffer.from(s.result.data, 'base64'));
    console.log(`  ${set.id}/${name}.png`);
}

for (const set of SETS) {
    const t = await tab();
    await t.send('Emulation.setDeviceMetricsOverride', { width: set.w, height: set.h, deviceScaleFactor: set.dpr, mobile: set.layout === 'mobile' });
    // A first visit: nothing remembered from another set.
    await t.send('Page.navigate', { url: BASE });
    await t.until(`/Select your instrument/.test(document.body.innerText)`);
    await t.ev(`localStorage.clear()`);

    // 1. The instruments.
    await t.send('Page.navigate', { url: `${BASE}?layout=${set.layout}` });
    await t.until(`/Select your instrument/.test(document.body.innerText)`);
    await sleep(1500);
    await shot(t, set, '01-instruments');

    // 2. The piano, played.
    await openApp(t, set, 'Piano');
    await openPiece(t, PIECES.hanon);
    await player(t.ev, NOTES.hanon);
    await play(t);
    await sleep(9000);
    await shot(t, set, '02-piano');
    await play(t);
    await sleep(400);

    // 3. The results: the study played twice, quickly — a rough take, then a clean one.
    await openApp(t, set, 'Piano');
    await openPiece(t, PIECES.czerny);
    for (let k = 0; k < 20; k++) await key(t.send, 'ArrowUp', 'ArrowUp', 38);
    for (const miss of [5, 0]) {
        await player(t.ev, NOTES.czerny, { miss });
        if (miss) await play(t);
        else await t.ev(`[...document.querySelectorAll('[role=dialog] button')].find(b => /Replay/.test(b.innerText))?.click()`);
        await t.until(resultsOpen, 90000);
        await sleep(800);
    }
    await shot(t, set, '03-results');

    // 4. A drum groove, as it starts.
    await openApp(t, set, 'Drums');
    await clickText(t.ev, 'Grooves');
    await t.until(`!!document.querySelector('[role=listbox][aria-label=Grooves] [role=option]')`);
    await t.ev(`(() => { const s = document.querySelector('select[aria-label=Style]'); const o = [...s.options].find(o => /funk/i.test(o.text)); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
    await sleep(500);
    await t.ev(`document.querySelectorAll('[role=listbox][aria-label=Grooves] [role=option]')[2]?.click()`);
    await sleep(800);
    await t.ev(`[...document.querySelectorAll('button')].find(b => /^▶ Start/.test(b.innerText.trim()))?.click()`);
    await t.until(`!/Loading Score|Rendering SVG|Slicing Textures/.test(document.body.innerText) && !!document.querySelector('canvas')`, 60000);
    await sleep(1500);
    // Practice: it waits on the first beat — no one is drumming, so Rhythm would count misses.
    await clickText(t.ev, 'Practice');
    await sleep(300);
    await play(t);
    // Past the count-in: it shows, then goes.
    await t.until(`!!document.querySelector('.countdown-label')`, 5000).catch(() => undefined);
    await t.until(`!document.querySelector('.countdown-label')`, 20000);
    await sleep(1800);
    await shot(t, set, '04-drums');
    await play(t);

    // 5. The saxophone, played (its library is written pitch; the horn sends an octave below, docs/saxo-app.md).
    await openApp(t, set, 'Saxo');
    await openPiece(t, PIECES.grenadiers);
    await player(t.ev, NOTES.grenadiers, { shift: -12 });
    await play(t);
    await sleep(9000);
    await shot(t, set, '05-saxophone');
    await play(t);

    t.close();
}

// ------------------------------------------------------------ Google Play's feature graphic
{
    const t = await tab();
    await t.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
    const logo = readFileSync(join(ROOT, 'public/vite.svg'), 'utf8').replace(/width="512" height="512"/, 'width="300" height="300"');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
        body { background: radial-gradient(circle at 30% 45%, #2a2850 0%, #14141c 55%, #0d0d12 100%);
               font-family: -apple-system, 'SF Pro Display', 'Inter', 'Segoe UI', sans-serif; color: white;
               display: flex; align-items: center; gap: 56px; padding: 0 80px; box-sizing: border-box; }
        h1 { margin: 0; font-size: 76px; letter-spacing: -2px; background: linear-gradient(90deg, #b8ffb0, #7ef0c8);
             -webkit-background-clip: text; color: transparent; }
        p { margin: 14px 0 0; font-size: 30px; line-height: 1.3; color: #c9c7ff; }
        small { display: block; margin-top: 22px; font-size: 20px; color: #8d8ba8; }
    </style></head><body>${logo}<div><h1>Midi Stroke</h1>
        <p>Piano, drums and saxophone,<br>played on your own instrument.</p>
        <small>Free and open source · USB and Bluetooth MIDI</small></div></body></html>`;
    await t.send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
    await sleep(800);
    const dir = join(OUT, 'google-play');
    mkdirSync(dir, { recursive: true });
    const s = await t.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(dir, 'feature-graphic.png'), Buffer.from(s.result.data, 'base64'));
    console.log('  google-play/feature-graphic.png');
    t.close();
}

stop();
rmSync(profile, { recursive: true, force: true });
console.log(`✓ store screenshots in ${OUT}`);
process.exit(0);

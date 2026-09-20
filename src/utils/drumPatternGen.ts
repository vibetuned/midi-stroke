/**
 * Drum-pattern generator for the Drums song selector.
 *
 * The piano and saxo generators engrave scales; drums have none, so this one
 * is a 16-step sequencer with a set of classical algorithmic-rhythm engines
 * behind it. You choose the voices and how many hits each should play in the
 * bar, the algorithm places them, and the result is engraved as a percussion
 * score and started like any other piece through a synthetic `drums:` URL.
 *
 * Why not uniform randomness: a coin flip per step produces unmusical noise,
 * because rhythm perception needs metric hierarchy, periodicity and anchor
 * points. Every engine here is a form of *constrained* stochasticity — see
 * docs/drums-patterns.md for the sources.
 *
 *   1. Euclidean (Bjorklund)  — spread k onsets as evenly as possible over n
 *      steps; reproduces a great many traditional ostinatos, with rotation
 *      per voice so the snare lands on the backbeat.
 *   2. Metric-weighted Bernoulli — sample k steps against the metric weight
 *      hierarchy (downbeat > backbeat > eighth offbeat > sixteenth).
 *   3. LFSR / Turing machine  — a shift register with a probabilistic write
 *      head: locked loop at 0%, slowly mutating pattern at a few percent.
 *   4. Time-dependent Markov  — a per-step transition matrix, so the chain
 *      cannot lose the downbeat the way a plain Markov chain does.
 *   5. Cellular automata      — Wolfram rules 30 / 90 / 110 over a 16-cell
 *      ring; each bar is the next generation, so patterns evolve.
 *
 * Two more engines run *on top* of whichever is chosen:
 *   - Bernoulli pulse jitter mutates later bars (drop or nudge an onset), so
 *     a repeat is a variation rather than a copy;
 *   - 1/f pink noise (Voss-McCartney) drives accents and velocities, which
 *     is what makes dynamics group over a phrase instead of flickering.
 *
 * Everything is deterministic from the seed in the URL, so a pattern always
 * regenerates identically — the URL is also the stats key. The bar the
 * sequencer shows is carried in the URL as an explicit 16-bit mask per voice,
 * so hand-edited cells survive too.
 */

// ------------------------------------------------------------------ voices

export const STEPS = 16;

export type DrumVoiceId =
    | 'bd' | 'sd' | 'rs' | 'lt' | 'mt' | 'ht'
    | 'ch' | 'oh' | 'cy' | 'cp' | 'cb' | 'tb';

/** What a voice is for, rhythmically — drives its weights and hit proposals. */
export type VoiceRole = 'anchor' | 'backbeat' | 'pulse' | 'color';

export interface DrumVoice {
    id: DrumVoiceId;
    label: string;
    short: string;
    /** Staff position and notehead — must match DRUM_MAP in VirtualDrums. */
    pname: string;
    oct: number;
    head?: string;
    headFill?: string;
    /** 1 = stems up (everything), 2 = stems down (the kick). */
    layer: 1 | 2;
    role: VoiceRole;
    /** General MIDI note, for reference and for the MIDI check in the tests. */
    gm: number;
    /** Sensible hit-count range when proposing numbers. */
    propose: [number, number];
}

export const DRUM_VOICES: DrumVoice[] = [
    { id: 'bd', label: 'Bass drum', short: 'BD', pname: 'f', oct: 4, layer: 2, role: 'anchor', gm: 36, propose: [2, 6] },
    { id: 'sd', label: 'Snare', short: 'SD', pname: 'c', oct: 5, layer: 1, role: 'backbeat', gm: 38, propose: [2, 5] },
    { id: 'rs', label: 'Rim shot', short: 'RS', pname: 'c', oct: 5, head: 'slash', layer: 1, role: 'color', gm: 37, propose: [1, 4] },
    { id: 'ch', label: 'Closed hi-hat', short: 'CH', pname: 'g', oct: 5, head: 'x', layer: 1, role: 'pulse', gm: 42, propose: [4, 12] },
    { id: 'oh', label: 'Open hi-hat', short: 'OH', pname: 'g', oct: 5, head: '+', layer: 1, role: 'color', gm: 46, propose: [1, 3] },
    { id: 'cy', label: 'Cymbal / ride', short: 'CY', pname: 'a', oct: 5, head: 'x', layer: 1, role: 'pulse', gm: 49, propose: [2, 8] },
    { id: 'ht', label: 'High tom', short: 'HT', pname: 'e', oct: 5, layer: 1, role: 'color', gm: 48, propose: [1, 4] },
    { id: 'mt', label: 'Mid tom', short: 'MT', pname: 'd', oct: 5, layer: 1, role: 'color', gm: 45, propose: [1, 4] },
    { id: 'lt', label: 'Low tom', short: 'LT', pname: 'a', oct: 4, layer: 1, role: 'color', gm: 41, propose: [1, 4] },
    { id: 'cp', label: 'Clap', short: 'CP', pname: 'e', oct: 4, head: 'x', layer: 1, role: 'backbeat', gm: 39, propose: [1, 4] },
    { id: 'cb', label: 'Cowbell', short: 'CB', pname: 'f', oct: 5, head: 'diamond', layer: 1, role: 'pulse', gm: 56, propose: [2, 8] },
    { id: 'tb', label: 'Tambourine', short: 'TB', pname: 'f', oct: 5, head: 'diamond', headFill: 'void', layer: 1, role: 'pulse', gm: 54, propose: [2, 8] },
];

const VOICE_BY_ID = new Map(DRUM_VOICES.map(v => [v.id, v]));

// --------------------------------------------------------------- algorithms

export type DrumAlgo = 'euclid' | 'bernoulli' | 'lfsr' | 'markov' | 'ca30' | 'ca90' | 'ca110';

export const DRUM_ALGOS: Array<{ value: DrumAlgo; label: string; hint: string }> = [
    { value: 'euclid', label: 'Euclidean (Bjorklund)', hint: 'hits spread as evenly as possible — most world ostinatos' },
    { value: 'bernoulli', label: 'Metric-weighted Bernoulli', hint: 'sampled against the metric hierarchy of the bar' },
    { value: 'lfsr', label: 'Shift register (Turing machine)', hint: 'a locked loop that mutates as you raise the variation' },
    { value: 'markov', label: 'Markov chain (per step)', hint: 'each step conditioned on the previous one' },
    { value: 'ca30', label: 'Cellular automaton — rule 30', hint: 'chaotic, aperiodic' },
    { value: 'ca90', label: 'Cellular automaton — rule 90', hint: 'fractal, self-similar polyrhythms' },
    { value: 'ca110', label: 'Cellular automaton — rule 110', hint: 'gliders — coherent, never quite repeating' },
];

/**
 * Metric weight per step of a 4/4 bar (Lerdahl & Jackendoff style hierarchy):
 * downbeat, backbeats, half-bar, eighth offbeats, then sixteenths.
 */
export const METRIC_WEIGHT = [
    1.00, 0.10, 0.40, 0.14, 0.92, 0.10, 0.46, 0.14,
    0.80, 0.10, 0.40, 0.14, 0.92, 0.10, 0.46, 0.18,
];

/** Role profiles: the metric hierarchy bent toward what each voice does. */
function roleWeights(role: VoiceRole): number[] {
    return METRIC_WEIGHT.map((w, i) => {
        switch (role) {
            case 'anchor':
                // Kick: downbeat and half-bar first, then the "and" of 3 and
                // the sixteenth pickups that make a groove push.
                return w * (i === 0 ? 1.6 : i === 8 ? 1.3 : i === 6 || i === 14 ? 1.15 : 1)
                    + (i === 3 || i === 11 ? 0.12 : 0);
            case 'backbeat':
                // Snare: 2 and 4 above all, ghost notes on the sixteenths.
                return (i === 4 || i === 12 ? 1.8 : w * 0.45) + (i % 2 === 1 ? 0.10 : 0);
            case 'pulse':
                // Hats/ride: the eighth grid, with sixteenths underneath.
                return i % 4 === 0 ? 1.0 : i % 2 === 0 ? 0.85 : 0.45;
            case 'color':
                // Toms, cowbell, clap: decoration, off the main anchors.
                return 0.35 + (i % 2 === 1 ? 0.25 : 0) + (i >= 12 ? 0.2 : 0);
        }
    });
}

// ------------------------------------------------------------------ randomness

/** mulberry32 — small, fast, and identical across platforms. */
function rngFrom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Stable per-voice seed, so changing one voice does not reshuffle the rest. */
function voiceSeed(seed: number, voice: DrumVoiceId): number {
    let h = seed >>> 0;
    for (const ch of voice) h = (Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0);
    return h >>> 0;
}

/** Pick `k` distinct steps, each step's chance proportional to its weight. */
function weightedPick(weights: number[], k: number, rng: () => number): boolean[] {
    const out = new Array(STEPS).fill(false);
    const pool = weights.map((w, i) => ({ i, w: Math.max(w, 0.0001) }));
    for (let n = 0; n < Math.min(k, STEPS); n++) {
        const total = pool.reduce((s, p) => s + p.w, 0);
        let r = rng() * total;
        let idx = pool.length - 1;
        for (let j = 0; j < pool.length; j++) {
            r -= pool[j].w;
            if (r <= 0) { idx = j; break; }
        }
        out[pool[idx].i] = true;
        pool.splice(idx, 1);
    }
    return out;
}

/** Force a pattern to exactly k onsets, adding/removing by metric weight. */
function forceCount(pattern: boolean[], k: number, weights: number[], rng: () => number): boolean[] {
    const out = [...pattern];
    const count = () => out.filter(Boolean).length;
    while (count() > k) {
        // Drop the weakest hit (ties broken randomly).
        const hits = out.map((_, i) => ({ i, w: weights[i] + rng() * 0.01 })).filter(({ i }) => out[i]);
        hits.sort((a, b) => a.w - b.w);
        out[hits[0].i] = false;
    }
    while (count() < k) {
        const gaps = out.map((_, i) => ({ i, w: weights[i] + rng() * 0.01 })).filter(({ i }) => !out[i]);
        if (gaps.length === 0) break;
        gaps.sort((a, b) => b.w - a.w);
        out[gaps[0].i] = true;
    }
    return out;
}

// ------------------------------------------------- 1. Euclidean (Bjorklund)

/**
 * Bjorklund's algorithm: distribute k onsets over n steps as evenly as
 * possible. E(5,8) = 1 0 1 1 0 1 1 0, the Cuban cinquillo.
 */
export function bjorklund(k: number, n: number): boolean[] {
    if (k <= 0) return new Array(n).fill(false);
    if (k >= n) return new Array(n).fill(true);
    let a: boolean[][] = Array.from({ length: k }, () => [true]);
    let b: boolean[][] = Array.from({ length: n - k }, () => [false]);
    while (b.length > 1 && a.length > 1) {
        const m = Math.min(a.length, b.length);
        const merged: boolean[][] = [];
        for (let i = 0; i < m; i++) merged.push([...a[i], ...b[i]]);
        const rest = a.length > m ? a.slice(m) : b.slice(m);
        a = merged;
        b = rest;
    }
    return [...a, ...b].flat();
}

function rotate(pattern: boolean[], by: number): boolean[] {
    const n = pattern.length;
    const r = ((by % n) + n) % n;
    return pattern.map((_, i) => pattern[(i - r + n) % n]);
}

/** Where a voice's Euclidean figure should start, before any stochastic offset. */
function baseRotation(role: VoiceRole): number {
    return role === 'backbeat' ? 4 : 0;
}

// ---------------------------------------------- 3. LFSR / "Turing machine"

/**
 * A 16-bit shift register whose feedback passes through a probabilistic write
 * head. At 0% the loop is locked and repeats forever; a few percent mutates
 * the odd hit, the way a drummer varies a groove; at 50% it is noise.
 */
function lfsrValues(seed: number, mutate: number, rng: () => number): number[] {
    let reg = (seed & 0xffff) || 0xACE1;
    const values: number[] = [];
    for (let i = 0; i < STEPS; i++) {
        const bit = ((reg >> 0) ^ (reg >> 2) ^ (reg >> 3) ^ (reg >> 5)) & 1;
        const written = rng() < mutate ? bit ^ 1 : bit;
        reg = ((reg >> 1) | (written << 15)) & 0xffff;
        values.push(reg & 0xff);
    }
    return values;
}

// -------------------------------------------- 4. Time-dependent Markov chain

/**
 * P(hit at step t | state at t-1), with a distinct row per step so the chain
 * keeps track of where the downbeat is — a plain Markov chain drifts off it.
 */
function markovPattern(weights: number[], k: number, rng: () => number): boolean[] {
    const out: boolean[] = [];
    let prev = false;
    for (let i = 0; i < STEPS; i++) {
        const w = Math.min(weights[i], 1);
        // After a hit, a repeat is less likely; after a rest, more likely.
        const p: number = prev ? w * 0.45 : w * 0.85;
        const hit: boolean = rng() < p;
        out.push(hit);
        prev = hit;
    }
    return forceCount(out, k, weights, rng);
}

// ------------------------------------------------- 5. Cellular automata

const CA_RULES: Record<string, number> = { ca30: 30, ca90: 90, ca110: 110 };

/** One generation of a Wolfram rule over a 16-cell ring. */
function caStep(cells: boolean[], rule: number): boolean[] {
    return cells.map((_, i) => {
        const l = cells[(i - 1 + STEPS) % STEPS] ? 4 : 0;
        const c = cells[i] ? 2 : 0;
        const r = cells[(i + 1) % STEPS] ? 1 : 0;
        return ((rule >> (l + c + r)) & 1) === 1;
    });
}

/** The automaton's state for a given bar: generation `bar` from the seed row. */
function caGeneration(seed: number, rule: number, bar: number): boolean[] {
    const rng = rngFrom(seed);
    let cells = Array.from({ length: STEPS }, () => rng() < 0.3);
    if (!cells.some(Boolean)) cells[0] = true;
    for (let g = 0; g <= bar; g++) cells = caStep(cells, rule);
    return cells;
}

// ------------------------------------------------------- pattern assembly

export interface VoicePlan {
    id: DrumVoiceId;
    /** Onsets wanted in the bar, 0–16. */
    hits: number;
}

/** Generate one voice's bar-0 pattern with the chosen engine. */
export function generateVoicePattern(
    algo: DrumAlgo,
    voice: DrumVoice,
    hits: number,
    seed: number,
    variation: number,
): boolean[] {
    const k = Math.max(0, Math.min(STEPS, Math.round(hits)));
    if (k === 0) return new Array(STEPS).fill(false);
    if (k >= STEPS) return new Array(STEPS).fill(true);

    const vSeed = voiceSeed(seed, voice.id);
    const rng = rngFrom(vSeed);
    const weights = roleWeights(voice.role);

    switch (algo) {
        case 'euclid': {
            // Stochastic rotation, but anchors and backbeats keep their place:
            // an evenly-spread kick that does not start the bar is not a kick.
            const extra = voice.role === 'anchor' || voice.role === 'backbeat'
                ? 0
                : Math.floor(rng() * STEPS);
            return rotate(bjorklund(k, STEPS), baseRotation(voice.role) + extra);
        }
        case 'bernoulli':
            return weightedPick(weights, k, rng);
        case 'lfsr': {
            const values = lfsrValues(vSeed, variation, rng);
            const ranked = values.map((v, i) => ({ i, v: v + weights[i] * 24 }))
                .sort((a, b) => b.v - a.v)
                .slice(0, k)
                .map(x => x.i);
            return METRIC_WEIGHT.map((_, i) => ranked.includes(i));
        }
        case 'markov':
            return markovPattern(weights, k, rng);
        default: {
            const cells = caGeneration(vSeed, CA_RULES[algo] ?? 30, 0);
            // The automaton says which steps are alive; the metric hierarchy
            // breaks ties so the k that survive still sit musically.
            const ranked = cells.map((alive, i) => ({ i, v: (alive ? 1 : 0) + weights[i] * 0.5 + rng() * 0.01 }))
                .sort((a, b) => b.v - a.v)
                .slice(0, k)
                .map(x => x.i);
            return METRIC_WEIGHT.map((_, i) => ranked.includes(i));
        }
    }
}

/**
 * The pattern for a later bar: the automata evolve, everything else takes
 * Bernoulli pulse jitter — an onset may drop out or shift by a sixteenth.
 */
function barPattern(
    base: boolean[],
    voice: DrumVoice,
    algo: DrumAlgo,
    bar: number,
    seed: number,
    variation: number,
): boolean[] {
    if (bar === 0 || variation <= 0) return [...base];
    const rng = rngFrom((voiceSeed(seed, voice.id) ^ (bar * 0x9E3779B1)) >>> 0);

    if (algo === 'ca30' || algo === 'ca90' || algo === 'ca110') {
        const k = base.filter(Boolean).length;
        const cells = caGeneration(voiceSeed(seed, voice.id), CA_RULES[algo], bar);
        const weights = roleWeights(voice.role);
        const ranked = cells.map((alive, i) => ({ i, v: (alive ? 1 : 0) + weights[i] * 0.5 + rng() * 0.01 }))
            .sort((a, b) => b.v - a.v)
            .slice(0, k)
            .map(x => x.i);
        return METRIC_WEIGHT.map((_, i) => ranked.includes(i));
    }

    const out = [...base];
    base.forEach((hit, i) => {
        if (!hit || rng() >= variation) return;
        // Half the time the onset drops out, half the time it nudges by one
        // sixteenth — the two mutations a drummer actually makes.
        if (rng() < 0.5) { out[i] = false; return; }
        const to = (i + (rng() < 0.5 ? -1 : 1) + STEPS) % STEPS;
        if (!out[to]) { out[i] = false; out[to] = true; }
    });
    return out;
}

// ------------------------------------------- 1/f pink noise (Voss-McCartney)

/**
 * Voss-McCartney: M registers, register k refreshed every 2^k steps, output is
 * their sum. Accents then cluster over a phrase instead of flickering, which
 * is what human dynamics do (Voss & Clarke, 1978).
 */
function pinkSequence(length: number, seed: number, octaves = 5): number[] {
    const rng = rngFrom(seed);
    const regs = Array.from({ length: octaves }, () => rng());
    const out: number[] = [];
    for (let i = 0; i < length; i++) {
        for (let k = 0; k < octaves; k++) {
            if (i % (1 << k) === 0) regs[k] = rng();
        }
        out.push(regs.reduce((a, b) => a + b, 0) / octaves);
    }
    return out;
}

// ---------------------------------------------------------------- URL codec

export interface DrumSpec {
    algo: DrumAlgo;
    bars: number;          // 1..8
    /** Variation applied to later bars, 0–9 (0 = an exact loop). */
    variation: number;
    seed: number;          // 0..46655 (three base-36 digits)
    accents: boolean;
    /** The bar the sequencer shows: 16 steps per voice, in grid order. */
    pattern: Array<{ id: DrumVoiceId; steps: boolean[] }>;
}

const toHex = (steps: boolean[]): string => {
    let bits = 0;
    steps.forEach((on, i) => { if (on) bits |= 1 << (STEPS - 1 - i); });
    return bits.toString(16).padStart(4, '0');
};

const fromHex = (hex: string): boolean[] => {
    const bits = parseInt(hex, 16);
    return Array.from({ length: STEPS }, (_, i) => ((bits >> (STEPS - 1 - i)) & 1) === 1);
};

export function buildDrumUrl(spec: DrumSpec): string {
    const voices = spec.pattern
        .filter(v => v.steps.some(Boolean))
        .map(v => `${v.id}:${toHex(v.steps)}`)
        .join('.');
    return `drums:${spec.algo}-b${spec.bars}-j${spec.variation}-s${spec.seed.toString(36)}`
        + `-a${spec.accents ? 1 : 0}-${voices || 'none'}`;
}

export function parseDrumUrl(url: string): DrumSpec | null {
    if (!url.startsWith('drums:')) return null;
    const parts = url.slice('drums:'.length).split('-');
    if (parts.length !== 6) return null;
    const [algo, bars, variation, seed, accents, voices] = parts;
    if (
        !DRUM_ALGOS.some(a => a.value === algo)
        || !/^b[1-8]$/.test(bars)
        || !/^j[0-9]$/.test(variation)
        || !/^s[0-9a-z]{1,4}$/.test(seed)
        || !/^a[01]$/.test(accents)
    ) return null;

    const pattern: DrumSpec['pattern'] = [];
    if (voices !== 'none') {
        for (const entry of voices.split('.')) {
            const m = /^([a-z]{2}):([0-9a-f]{4})$/.exec(entry);
            if (!m || !VOICE_BY_ID.has(m[1] as DrumVoiceId)) return null;
            pattern.push({ id: m[1] as DrumVoiceId, steps: fromHex(m[2]) });
        }
    }
    return {
        algo: algo as DrumAlgo,
        bars: parseInt(bars.slice(1), 10),
        variation: parseInt(variation.slice(1), 10),
        seed: parseInt(seed.slice(1), 36),
        accents: accents === 'a1',
        pattern,
    };
}

/** Human-readable name for a drums: URL, or null if it isn't one. */
export function describeDrumUrl(url: string): string | null {
    const spec = parseDrumUrl(url);
    if (!spec) return null;
    const algo = DRUM_ALGOS.find(a => a.value === spec.algo)?.label ?? spec.algo;
    const voices = spec.pattern
        .map(v => VOICE_BY_ID.get(v.id)?.short ?? v.id.toUpperCase())
        .join(' ');
    const hits = spec.pattern.reduce((n, v) => n + v.steps.filter(Boolean).length, 0);
    return `Drum pattern · ${algo} · ${voices || 'empty'} · ${hits} hits`
        + ` · ${spec.bars} bar${spec.bars > 1 ? 's' : ''}`
        + (spec.variation > 0 ? ` · var ${spec.variation}` : '')
        + ` · seed ${spec.seed.toString(36)}`;
}

// ------------------------------------------------------------ MEI writing

interface Hit {
    voice: DrumVoice;
    /** 0–127, from the pink-noise curve; drives @vel and the accent mark. */
    vel: number;
    accent: boolean;
}

/** MEI duration for a length in sixteenths, inside one beat (1–4). */
const DUR_OF: Record<number, { dur: number; dots: number }> = {
    1: { dur: 16, dots: 0 },
    2: { dur: 8, dots: 0 },
    3: { dur: 8, dots: 1 },
    4: { dur: 4, dots: 0 },
};

function noteXml(v: DrumVoice, vel: number, accent: boolean, inChord: boolean, attrs: string): string {
    const head = v.head ? ` head.shape="${v.head}"` : '';
    const fill = v.headFill ? ` head.fill="${v.headFill}"` : '';
    const body = accent ? '<artic artic="acc" />' : '';
    const velAttr = ` vel="${vel}"`;
    const open = `<note breaksec="1"${inChord ? '' : attrs} pname="${v.pname}" oct="${v.oct}"${head}${fill}${velAttr}`;
    return body ? `${open}>${body}</note>` : `${open} />`;
}

/** One layer of one measure: beat-local durations, gaps filled with spaces. */
function layerXml(
    steps: Array<Hit[]>,
    stem: 'up' | 'down',
): string {
    const out: string[] = [];
    for (let beat = 0; beat < 4; beat++) {
        const from = beat * 4;
        const onsets: number[] = [];
        for (let s = from; s < from + 4; s++) if (steps[s].length > 0) onsets.push(s);

        if (onsets.length === 0) { out.push('<space dur="4" />'); continue; }

        const items: string[] = [];
        // Rest before the first onset of the beat.
        const lead = onsets[0] - from;
        if (lead > 0) items.push(`<space dur="${DUR_OF[lead].dur}"${DUR_OF[lead].dots ? ' dots="1"' : ''} />`);

        onsets.forEach((s, n) => {
            // Each hit sounds until the next one in the beat, or the beat end.
            const len = (n + 1 < onsets.length ? onsets[n + 1] : from + 4) - s;
            const { dur, dots } = DUR_OF[len];
            const hits = steps[s];
            const accent = hits.some(h => h.accent);
            const vel = Math.max(...hits.map(h => h.vel));
            const durAttrs = ` dur="${dur}"${dots ? ' dots="1"' : ''} stem.dir="${stem}"`;
            if (hits.length === 1) {
                items.push(noteXml(hits[0].voice, vel, accent, false, durAttrs));
            } else {
                const inner = hits
                    .slice()
                    .sort((a, b) => (a.voice.oct * 7 + 'cdefgab'.indexOf(a.voice.pname))
                        - (b.voice.oct * 7 + 'cdefgab'.indexOf(b.voice.pname)))
                    .map(h => noteXml(h.voice, vel, false, true, ''))
                    .join('');
                const artic = accent ? '<artic artic="acc" />' : '';
                items.push(`<chord${durAttrs}>${inner}${artic}</chord>`);
            }
        });

        // Beam the beat when it holds more than one note and nothing longer
        // than an eighth — the convention the bundled drum charts follow.
        const noteCount = onsets.length;
        const longest = Math.max(...onsets.map((s, n) => (n + 1 < onsets.length ? onsets[n + 1] : from + 4) - s));
        if (noteCount > 1 && longest <= 2) {
            const lead = items.length > noteCount ? items.shift() : null;
            out.push(`${lead ?? ''}<beam>${items.join('')}</beam>`);
        } else {
            out.push(items.join(''));
        }
    }
    return out.join('');
}

export interface ResolvedDrumPattern {
    spec: DrumSpec;
    /** Per bar, per step, the voices hit there (with velocity and accent). */
    bars: Array<Array<Hit[]>>;
    /** Total onsets across the whole exercise. */
    totalHits: number;
}

/** Expand a spec into every bar, with velocities and accents applied. */
export function resolveDrumSpec(spec: DrumSpec): ResolvedDrumPattern {
    const voices = spec.pattern
        .map(p => ({ voice: VOICE_BY_ID.get(p.id), steps: p.steps }))
        .filter((p): p is { voice: DrumVoice; steps: boolean[] } => !!p.voice);

    const variation = spec.variation / 20; // 0 … 0.45
    const pink = pinkSequence(spec.bars * STEPS, spec.seed + 977);

    const bars: Array<Array<Hit[]>> = [];
    let totalHits = 0;
    for (let bar = 0; bar < spec.bars; bar++) {
        const grid: Array<Hit[]> = Array.from({ length: STEPS }, () => []);
        for (const { voice, steps } of voices) {
            const pattern = barPattern(steps, voice, spec.algo, bar, spec.seed, variation);
            pattern.forEach((on, i) => {
                if (!on) return;
                const p = pink[bar * STEPS + i];
                // Pink noise sets the dynamic level; the metric hierarchy
                // keeps downbeats from being ghosted into inaudibility.
                const level = 0.55 * p + 0.45 * METRIC_WEIGHT[i];
                const accent = spec.accents && level > 0.72;
                grid[i].push({
                    voice,
                    vel: Math.round(52 + level * 68),
                    accent,
                });
                totalHits++;
            });
        }
        bars.push(grid);
    }
    return { spec, bars, totalHits };
}

/** MEI for a spec, in the dialect of the bundled drum charts. */
export function generateDrumMei(spec: DrumSpec): string {
    const { bars } = resolveDrumSpec(spec);

    const measures = bars.map((grid, i) => {
        const upper = grid.map(hits => hits.filter(h => h.voice.layer === 1));
        const lower = grid.map(hits => hits.filter(h => h.voice.layer === 2));
        const right = i === bars.length - 1 ? ' right="end"' : '';
        return `<measure n="${i + 1}"${right}>`
            + `<staff n="1">`
            + `<layer n="1">${layerXml(upper, 'up')}</layer>`
            + `<layer n="2">${layerXml(lower, 'down')}</layer>`
            + `</staff></measure>`;
    });

    return `<?xml version='1.0' encoding='UTF-8'?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead>
    <fileDesc>
      <titleStmt><title>${describeDrumUrl(buildDrumUrl(spec)) ?? 'Drum pattern'}</title><respStmt /></titleStmt>
      <pubStmt />
    </fileDesc>
  </meiHead>
  <music><body><mdiv><score>
    <scoreDef>
      <staffGrp>
        <staffDef n="1" lines="5" clef.shape="perc"><meterSig count="4" unit="4" /></staffDef>
      </staffGrp>
    </scoreDef>
    <section>
      <measure n="0">
        <staff n="1"><layer n="1"><rest dur="4" /></layer></staff>
      </measure>
      ${measures.join('\n      ')}
    </section>
  </score></mdiv></body></music>
</mei>`;
}

/** Data URL serving the generated MEI (fetch() handles data: natively). */
export function drumDataUrl(spec: DrumSpec): string {
    return `data:application/xml;charset=utf-8,${encodeURIComponent(generateDrumMei(spec))}`;
}

// ------------------------------------------------------------- proposals

/**
 * "Propose numbers": a hit count per voice, drawn from what that voice
 * plausibly plays in a bar. Kick and snare always get one; the rest are a
 * kit-dependent draw, so you get a playable starting point rather than a
 * wall of noise.
 */
export function proposeHits(voices: DrumVoiceId[], seed: number): Record<string, number> {
    const rng = rngFrom(seed ^ 0x5bf03635);
    const out: Record<string, number> = {};
    for (const id of voices) {
        const v = VOICE_BY_ID.get(id);
        if (!v) continue;
        const [lo, hi] = v.propose;
        out[id] = lo + Math.floor(rng() * (hi - lo + 1));
    }
    return out;
}

/** A fresh seed for the dice button. */
export function randomSeed(): number {
    return Math.floor(Math.random() * 46656); // 3 base-36 digits
}

/** The default kit and pattern the builder opens on. */
export function defaultDrumSpec(): DrumSpec {
    const seed = 4242;
    const kit: DrumVoiceId[] = ['bd', 'sd', 'ch'];
    const hits: Record<string, number> = { bd: 4, sd: 2, ch: 8 };
    return {
        algo: 'euclid',
        bars: 2,
        variation: 2,
        seed,
        accents: true,
        pattern: kit.map(id => ({
            id,
            steps: generateVoicePattern('euclid', VOICE_BY_ID.get(id)!, hits[id], seed, 0.1),
        })),
    };
}

export { VOICE_BY_ID as drumVoiceById };

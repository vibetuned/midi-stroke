import React, { useCallback, useMemo, useState } from 'react';
import { AuditionButton, PlaybackTargetSelect } from '../PlaybackControl';
import { Stepper } from '../Stepper';
import { chipStyle, labelStyle, previewBoxStyle, selectStyle, startButtonStyle } from '../builderStyles';
import { useVerovio } from '../../hooks/useVerovio';
import {
    DRUM_ALGOS, DRUM_VOICES, STEPS, buildDrumUrl, defaultDrumSpec,
    generateDrumMei, generateVoicePattern, proposeHits, randomSeed, resolveDrumSpec,
    type DrumAlgo, type DrumSpec, type DrumVoiceId,
} from '../../utils/drumPatternGen';

/**
 * Drum-pattern builder for the song selector: a 16-step sequencer where you
 * pick the kit and how many hits each voice should play, let one of the
 * classical rhythm algorithms place them, edit any cell by hand, preview the
 * engraving, and start it like any other piece (via a synthetic drums: URL).
 * See docs/drums-patterns.md.
 */

interface DrumPatternBuilderProps {
    /** Called with the drums: song URL when the user hits Start. */
    onStart: (url: string) => void;
}

type Grid = Record<string, boolean[]>;

const emptyRow = () => new Array(STEPS).fill(false) as boolean[];

export const DrumPatternBuilder: React.FC<DrumPatternBuilderProps> = ({ onStart }) => {
    const { toolkit } = useVerovio();
    const initial = useMemo(() => defaultDrumSpec(), []);

    const [algo, setAlgo] = useState<DrumAlgo>(initial.algo);
    const [bars, setBars] = useState(initial.bars);
    const [variation, setVariation] = useState(initial.variation);
    const [seed, setSeed] = useState(initial.seed);
    const [accents, setAccents] = useState(initial.accents);
    const [kit, setKit] = useState<DrumVoiceId[]>(() => initial.pattern.map(p => p.id));
    const [hits, setHits] = useState<Record<string, number>>(() =>
        Object.fromEntries(initial.pattern.map(p => [p.id, p.steps.filter(Boolean).length])));
    const [grid, setGrid] = useState<Grid>(() =>
        Object.fromEntries(initial.pattern.map(p => [p.id, p.steps])));

    /**
     * A nudge per voice, so the row's ↻ gives you *another* pattern for that
     * voice: placement is deterministic from the algorithm, the hit count and
     * the seed, so without this a re-run would hand back the bar it just made.
     */
    const [nudge, setNudge] = useState<Record<string, number>>({});

    /** Run the current engine for one voice (or all of them). */
    const regenerate = useCallback((
        ids: DrumVoiceId[], nextSeed = seed, nextAlgo = algo, counts = hits,
        nudges = nudge, varied = variation,
    ) => {
        setGrid(prev => {
            const next = { ...prev };
            for (const id of ids) {
                const voice = DRUM_VOICES.find(v => v.id === id);
                if (!voice) continue;
                next[id] = generateVoicePattern(
                    nextAlgo, voice, counts[id] ?? 0, nextSeed + (nudges[id] ?? 0), varied / 20,
                );
            }
            return next;
        });
    }, [seed, algo, hits, nudge, variation]);

    /**
     * Find a nudge that actually gives this voice a different bar. Placement is
     * deterministic, and some of it does not depend on the seed at all —
     * Euclidean puts an anchor or a backbeat in exactly one place, since there
     * is a single even spread of k hits that starts on the downbeat. Several
     * nudges are tried because two seeds can land on the same rotation.
     */
    const findNudge = (voice: typeof DRUM_VOICES[number]): number | null => {
        const k = hits[voice.id] ?? 0;
        if (k === 0 || k >= STEPS) return null;
        const base = nudge[voice.id] ?? 0;
        const current = generateVoicePattern(algo, voice, k, seed + base, variation / 20).join();
        for (let i = 1; i <= 24; i++) {
            const candidate = base + i * 1013;
            if (generateVoicePattern(algo, voice, k, seed + candidate, variation / 20).join() !== current) {
                return candidate;
            }
        }
        return null;
    };

    /** Another take on one voice, leaving the rest of the kit alone. */
    const reroll = (id: DrumVoiceId, to: number) => {
        const nudges = { ...nudge, [id]: to };
        setNudge(nudges);
        regenerate([id], seed, algo, hits, nudges);
    };

    /**
     * The variation slider is the one setting that changes where the shift
     * register puts its hits, so that engine is re-run as it moves. For the
     * others variation only shapes the later bars, which the preview already
     * reflects without touching the bar on the grid.
     */
    const changeVariation = (v: number) => {
        setVariation(v);
        if (algo === 'lfsr') regenerate(kit, seed, algo, hits, nudge, v);
    };

    const toggleVoice = (id: DrumVoiceId) => {
        setKit(prev => {
            if (prev.includes(id)) return prev.filter(v => v !== id);
            const voice = DRUM_VOICES.find(v => v.id === id)!;
            const k = hits[id] ?? Math.max(1, (voice.propose[0] + voice.propose[1]) >> 1);
            setHits(h => ({ ...h, [id]: k }));
            setGrid(g => ({ ...g, [id]: generateVoicePattern(algo, voice, k, seed, variation / 20) }));
            // Keep the rail in kit order so the grid reads like a drum chart.
            return DRUM_VOICES.filter(v => v.id === id || prev.includes(v.id)).map(v => v.id);
        });
    };

    const setHitCount = (id: DrumVoiceId, k: number) => {
        const counts = { ...hits, [id]: k };
        setHits(counts);
        regenerate([id], seed, algo, counts);
    };

    const toggleCell = (id: DrumVoiceId, step: number) => {
        setGrid(prev => {
            const row = [...(prev[id] ?? emptyRow())];
            row[step] = !row[step];
            setHits(h => ({ ...h, [id]: row.filter(Boolean).length }));
            return { ...prev, [id]: row };
        });
    };

    const rollDice = () => {
        const next = randomSeed();
        const counts = { ...hits, ...proposeHits(kit, next) };
        setSeed(next);
        setHits(counts);
        setNudge({});
        regenerate(kit, next, algo, counts, {});
    };

    const spec: DrumSpec = useMemo(() => ({
        algo, bars, variation, seed, accents,
        pattern: kit.map(id => ({ id, steps: grid[id] ?? emptyRow() })),
    }), [algo, bars, variation, seed, accents, kit, grid]);

    const resolved = useMemo(() => resolveDrumSpec(spec), [spec]);
    const url = buildDrumUrl(spec);
    const isEmpty = resolved.totalHits === 0;

    // One engraving per spec, shared by the preview and the audition.
    const mei = useMemo(() => generateDrumMei(spec), [spec]);

    const preview = useMemo(() => {
        if (!toolkit || isEmpty) return null;
        try {
            toolkit.setOptions({
                breaks: 'none', adjustPageWidth: true, adjustPageHeight: true,
                svgViewBox: true, header: 'none', footer: 'none', scale: 45,
                pageMarginLeft: 15, pageMarginRight: 15, pageMarginTop: 10, pageMarginBottom: 10,
            });
            toolkit.loadData(mei);
            return toolkit.renderToSVG(1, {})
                .replace('<svg ', '<svg style="height:92px;width:auto;" ');
        } catch (e) {
            console.error('Drum pattern preview render failed:', e);
            return null;
        }
    }, [toolkit, mei, isEmpty]);

    const algoHint = DRUM_ALGOS.find(a => a.value === algo)?.hint ?? '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* The sequencer: one row per voice, 16 steps, beats shaded. */}
                <div style={{ flex: '1 1 388px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', gap: '2px', paddingLeft: '106px' }}>
                        {Array.from({ length: STEPS }, (_, s) => (
                            <span key={s} style={{
                                width: '16px', textAlign: 'center', fontSize: '0.58rem',
                                color: s % 4 === 0 ? 'var(--color-accent, #2ade2a)' : 'var(--color-text-secondary, #6a6a78)',
                            }}>
                                {s % 4 === 0 ? s / 4 + 1 : '·'}
                            </span>
                        ))}
                    </div>

                    {DRUM_VOICES.filter(v => kit.includes(v.id)).map(voice => (
                        <div key={voice.id} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button
                                onClick={() => toggleVoice(voice.id)}
                                title={`Remove ${voice.label}`}
                                style={{ ...rowLabelStyle, width: '50px', marginRight: '2px' }}
                            >
                                {voice.short}
                            </button>
                            <input
                                type="number"
                                min={0}
                                max={STEPS}
                                value={hits[voice.id] ?? 0}
                                onChange={e => setHitCount(voice.id, Math.max(0, Math.min(STEPS, Number(e.target.value))))}
                                title={`How many times ${voice.label} plays in the bar`}
                                style={hitInputStyle}
                            />
                            {(() => {
                                const next = findNudge(voice);
                                const enabled = next !== null;
                                return (
                                    <button
                                        onClick={() => next !== null && reroll(voice.id, next)}
                                        disabled={!enabled}
                                        title={enabled
                                            ? `Another ${voice.label} pattern with the same number of hits`
                                            : `${DRUM_ALGOS.find(a => a.value === algo)?.label ?? algo} places ${voice.label} `
                                                + 'in only one way at this hit count — change the count or the algorithm'}
                                        style={{
                                            ...rowLabelStyle, width: '20px', padding: 0, marginRight: '2px',
                                            opacity: enabled ? 1 : 0.3, cursor: enabled ? 'pointer' : 'default',
                                        }}
                                    >
                                        ↻
                                    </button>
                                );
                            })()}
                            {(grid[voice.id] ?? emptyRow()).map((on, s) => (
                                <button
                                    key={s}
                                    onClick={() => toggleCell(voice.id, s)}
                                    title={`${voice.label} · step ${s + 1}`}
                                    style={cellStyle(on, s)}
                                />
                            ))}
                        </div>
                    ))}

                    {/* Voices not in the kit yet. */}
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                        {DRUM_VOICES.filter(v => !kit.includes(v.id)).map(voice => (
                            <button
                                key={voice.id}
                                onClick={() => toggleVoice(voice.id)}
                                title={`Add ${voice.label}`}
                                style={chipStyle(false)}
                            >
                                + {voice.short}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Engine and shape of the exercise. */}
                <div style={{ flex: '1 1 236px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <label style={labelStyle}>
                        Algorithm — {algoHint}
                        <select
                            value={algo}
                            onChange={e => { const a = e.target.value as DrumAlgo; setAlgo(a); regenerate(kit, seed, a); }}
                            style={selectStyle}
                            title={algoHint}
                        >
                            {DRUM_ALGOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                    </label>

                    <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <Stepper label="Bars" value={bars} min={1} max={8} onChange={setBars} />
                        <span style={countStyle}>
                            {resolved.totalHits} hits · {bars * STEPS} steps · seed {seed.toString(36)}
                        </span>
                    </div>

                    <label style={labelStyle}>
                        Variation between bars: {variation === 0 ? 'none (exact loop)' : `${variation * 5}%`}
                        <input
                            type="range"
                            min={0}
                            max={9}
                            value={variation}
                            onChange={e => changeVariation(Number(e.target.value))}
                            style={{ accentColor: 'var(--color-accent)' }}
                        />
                        <span style={hintStyle}>
                            Later bars drop or nudge the odd hit; the automata evolve instead.
                        </span>
                    </label>

                    <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={accents} onChange={e => setAccents(e.target.checked)} />
                        Accents and velocity from 1/f pink noise
                    </label>

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button onClick={rollDice} style={{ ...chipStyle(false), padding: '0.45rem 0.8rem' }} title="Propose hit counts and re-place everything">
                            🎲 Propose
                        </button>

                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <AuditionButton mei={mei} drums />
                        <PlaybackTargetSelect compact />
                    </div>

                    <button
                        onClick={() => !isEmpty && onStart(url)}
                        style={{ ...startButtonStyle, opacity: isEmpty ? 0.45 : 1, cursor: isEmpty ? 'default' : 'pointer' }}
                        title={url}
                    >
                        ▶ Start — {isEmpty ? 'add some hits first' : `${resolved.totalHits} hits over ${bars} bar${bars > 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>

            {/* Engraving preview (Verovio renders black-on-transparent; invert for the dark UI) */}
            <div style={{ ...previewBoxStyle, minHeight: '70px' }}>
                {preview
                    ? <div style={{ filter: 'invert(0.92)' }} dangerouslySetInnerHTML={{ __html: preview }} />
                    : <span style={{ color: 'var(--color-text-secondary, #888)', fontSize: '0.85rem' }}>
                        {isEmpty ? 'Add a voice and some hits to see the score.' : 'Loading preview…'}
                    </span>}
            </div>
        </div>
    );
};

const cellStyle = (on: boolean, step: number): React.CSSProperties => ({
    width: '16px', height: '20px', padding: 0, cursor: 'pointer',
    borderRadius: '4px',
    background: on ? 'var(--color-accent, #2ade2a)' : step % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${on ? 'var(--color-accent, #2ade2a)' : 'rgba(255,255,255,0.12)'}`,
});

const rowLabelStyle: React.CSSProperties = {
    height: '20px', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em',
    background: 'transparent', color: 'var(--color-text-secondary, #cfcfd8)',
    border: '1px solid rgba(255,255,255,0.18)', borderRadius: '5px', cursor: 'pointer',
};

const hitInputStyle: React.CSSProperties = {
    width: '30px', height: '20px', textAlign: 'center', fontSize: '0.7rem',
    marginRight: '2px',
    background: '#22222a', color: 'white',
    border: '1px solid rgba(255,255,255,0.18)', borderRadius: '5px',
};

const countStyle: React.CSSProperties = {
    fontSize: '0.7rem', color: 'var(--color-text-secondary, #8a8a98)',
};

const hintStyle: React.CSSProperties = {
    fontSize: '0.7rem', color: 'var(--color-text-secondary, #8a8a98)', lineHeight: 1.35,
};

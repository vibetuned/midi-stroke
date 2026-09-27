import React, { useEffect, useMemo, useState } from 'react';
import { AuditionButton, PlaybackTargetSelect } from '../PlaybackControl';
import { chipStyle, labelStyle, previewBoxStyle, selectStyle, startButtonStyle } from '../builderStyles';
import { useVerovio } from '../../hooks/useVerovio';
import { LOOP_MAX_BARS } from '../../utils/drumGrid';
import {
    buildGrooveUrl, grooveMei, grooveStyleName, loadGrooveIndex, loadGroovePerformance, quantize,
    type GrooveFeel, type GrooveTake, type MidiPerformance,
} from '../../utils/grooveMidi';

/**
 * The drums song selector's Grooves: the 1,150 takes of Magenta's Groove MIDI
 * Dataset — ten drummers on an electronic kit, 18 styles, beats of up to
 * twenty minutes and one- or two-bar fills. Filter them, pick one, choose its
 * grid (as played, or all straight, or all triplets) and, for a long take, the
 * part to play; preview it, hear it, start it. A take longer than a pattern
 * plays through and stops; a fill loops. See utils/grooveMidi.ts and
 * docs/drums-grooves.md.
 */

const TEMPOS: Array<{ value: string; label: string; test: (bpm: number) => boolean }> = [
    { value: '', label: 'Any tempo', test: () => true },
    { value: 'slow', label: 'Slow (under 90)', test: b => b < 90 },
    { value: 'mid', label: 'Medium (90–129)', test: b => b >= 90 && b < 130 },
    { value: 'fast', label: 'Fast (130 and up)', test: b => b >= 130 },
];
const LENGTHS: Array<{ value: string; label: string; test: (bars: number) => boolean }> = [
    { value: '', label: 'Any length', test: () => true },
    { value: 'short', label: 'Up to 8 bars', test: n => n <= 8 },
    { value: 'mid', label: '9–32 bars', test: n => n > 8 && n <= 32 },
    { value: 'long', label: '33–96 bars', test: n => n > 32 && n <= 96 },
    { value: 'longer', label: 'Over 96 bars', test: n => n > 96 },
];
const FEELS: Array<{ value: string; label: string; test: (swing: number) => boolean }> = [
    { value: '', label: 'Any feel', test: () => true },
    { value: 'straight', label: 'Straight', test: s => s < 0.25 },
    { value: 'swung', label: 'Swung / triplets', test: s => s >= 0.5 },
];
const GRIDS: Array<{ value: GrooveFeel; label: string; title: string }> = [
    { value: 'auto', label: 'as played', title: 'Each beat on the simplest grid its hits need; straight or triplets as the playing goes' },
    { value: 'straight', label: 'straight', title: 'Eighths, sixteenths and thirty-seconds only' },
    { value: 'triplets', label: 'triplets', title: 'Triplets and sextuplets only' },
];

/** Long takes come in parts of this many bars. */
const PART_BARS = 32;
/** Up to this many bars, a take is offered whole. */
const WHOLE_MAX_BARS = 128;
/** How much of a take the preview shows, and the audition plays. */
const PREVIEW_BARS = 4;
const AUDITION_BARS = 8;

/** A long take's parts: 32 bars each, a short remainder joining the last. */
function partsOf(bars: number): Array<{ from: number; to: number }> {
    if (bars <= 48) return [];
    const parts: Array<{ from: number; to: number }> = [];
    for (let from = 1; from <= bars; from += PART_BARS) parts.push({ from, to: Math.min(bars, from + PART_BARS - 1) });
    const last = parts[parts.length - 1];
    if (parts.length > 1 && last.to - last.from + 1 < 8) { parts.pop(); parts[parts.length - 1].to = bars; }
    return parts;
}

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export const GrooveBrowser: React.FC<{ onStart: (url: string) => void }> = ({ onStart }) => {
    const { toolkit } = useVerovio();
    const [takes, setTakes] = useState<GrooveTake[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [id, setId] = useState<string | null>(null);
    const [style, setStyle] = useState('');
    const [type, setType] = useState<'beat' | 'fill' | ''>('beat');
    const [drummer, setDrummer] = useState('');
    const [tempo, setTempo] = useState('');
    const [length, setLength] = useState('');
    const [feelFilter, setFeelFilter] = useState('');
    const [grid, setGrid] = useState<GrooveFeel>('auto');
    const [part, setPart] = useState(0);   // index into the parts; -1 for the whole take
    const [perf, setPerf] = useState<{ id: string; perf: MidiPerformance } | null>(null);

    useEffect(() => {
        let live = true;
        loadGrooveIndex().then(t => { if (live) setTakes(t); }).catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, []);

    const families = useMemo(() => {
        const count = new Map<string, number>();
        for (const t of takes ?? []) { const f = t.style.split('/')[0]; count.set(f, (count.get(f) ?? 0) + 1); }
        return [...count.entries()].sort((a, b) => b[1] - a[1]);
    }, [takes]);
    const drummers = useMemo(() => [...new Set((takes ?? []).map(t => t.drummer))].sort((a, b) => a - b), [takes]);

    const shown = useMemo(() => (takes ?? [])
        .filter(t => (!style || t.style.split('/')[0] === style) && (!type || t.type === type)
            && (!drummer || t.drummer === Number(drummer))
            && TEMPOS.find(x => x.value === tempo)!.test(t.bpm)
            && LENGTHS.find(x => x.value === length)!.test(t.bars)
            && FEELS.find(x => x.value === feelFilter)!.test(t.swing))
        .sort((a, b) => grooveStyleName(a.style).localeCompare(grooveStyleName(b.style)) || a.bpm - b.bpm || a.drummer - b.drummer),
    [takes, style, type, drummer, tempo, length, feelFilter]);

    const take = useMemo(() => takes?.find(t => t.id === id) ?? shown[0] ?? null, [takes, id, shown]);
    const parts = useMemo(() => (take ? partsOf(take.bars) : []), [take]);
    const canWhole = !take || take.bars <= WHOLE_MAX_BARS;
    const rangeIndex = parts.length === 0 || (part === -1 && canWhole) ? -1 : Math.max(0, Math.min(part, parts.length - 1));
    const range = rangeIndex < 0 ? null : parts[rangeIndex];

    // The chosen take's performance, fetched when it is chosen.
    useEffect(() => {
        if (!take || perf?.id === take.id) return;
        let live = true;
        loadGroovePerformance(take).then(p => { if (live) setPerf({ id: take.id, perf: p }); }).catch(() => undefined);
        return () => { live = false; };
    }, [take, perf?.id]);

    const q = useMemo(() => (perf && take && perf.id === take.id ? quantize(perf.perf, grid) : null), [perf, take, grid]);
    const from = range?.from ?? 1;
    const to = range?.to ?? take?.bars ?? 1;
    const previewMei = useMemo(() => (q ? grooveMei(q, { fromBar: from, toBar: Math.min(to, from + PREVIEW_BARS - 1) }) : null), [q, from, to]);
    const auditionMei = useMemo(() => (q ? grooveMei(q, { fromBar: from, toBar: Math.min(to, from + AUDITION_BARS - 1) }) : null), [q, from, to]);

    const preview = useMemo(() => {
        if (!toolkit || !previewMei) return null;
        try {
            toolkit.setOptions({
                breaks: 'none', adjustPageWidth: true, adjustPageHeight: true,
                svgViewBox: true, header: 'none', footer: 'none', scale: 40,
                pageMarginLeft: 15, pageMarginRight: 15, pageMarginTop: 10, pageMarginBottom: 10,
            });
            toolkit.loadData(previewMei);
            return toolkit.renderToSVG(1, {}).replace('<svg ', '<svg style="height:120px;width:auto;" ');
        } catch (e) {
            console.error('Groove preview render failed:', e);
            return null;
        }
    }, [toolkit, previewMei]);

    if (failed) return <div style={{ color: '#f87171' }}>The grooves could not be loaded.</div>;
    if (!takes) return <div style={{ color: 'var(--color-text-secondary, #9a9aa8)' }}>Loading the grooves…</div>;

    const choose = (t: GrooveTake) => { setId(t.id); setPart(0); };
    const url = take ? buildGrooveUrl({ id: take.id, feel: grid, ...(range ? { fromBar: range.from, toBar: range.to } : {}) }) : null;
    const feelText = take ? (take.swing >= 0.5 ? `swung — ${Math.round(take.swing * 100)} % of its beats in triplets`
        : take.swing >= 0.25 ? `mixed — ${Math.round(take.swing * 100)} % in triplets` : 'straight') : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {([['beat', 'beats'], ['fill', 'fills'], ['', 'both']] as const).map(([v, label]) => (
                            <button key={label} onClick={() => setType(v)} style={chipStyle(type === v)}>{label}</button>
                        ))}
                    </div>
                    <select value={style} onChange={e => setStyle(e.target.value)} style={selectStyle} aria-label="Style">
                        <option value="">Any style</option>
                        {families.map(([f, n]) => <option key={f} value={f}>{grooveStyleName(f)} ({n})</option>)}
                    </select>
                    <select value={tempo} onChange={e => setTempo(e.target.value)} style={selectStyle} aria-label="Tempo">
                        {TEMPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select value={length} onChange={e => setLength(e.target.value)} style={selectStyle} aria-label="Length">
                        {LENGTHS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select value={feelFilter} onChange={e => setFeelFilter(e.target.value)} style={selectStyle} aria-label="Feel">
                        {FEELS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select value={drummer} onChange={e => setDrummer(e.target.value)} style={selectStyle} aria-label="Drummer">
                        <option value="">Any drummer</option>
                        {drummers.map(d => <option key={d} value={d}>Drummer {d}</option>)}
                    </select>
                    {take && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem', fontSize: '0.74rem', marginTop: '0.3rem' }}>
                            <Row label="Style" value={`${grooveStyleName(take.style)}, ${take.type}`} />
                            <Row label="Played by" value={`Drummer ${take.drummer}`} />
                            <Row label="Tempo" value={`${take.bpm} bpm, ${take.meter}`} />
                            <Row label="Length" value={`${take.bars} bar${take.bars === 1 ? '' : 's'}, ${minutes(take.seconds)}`} />
                            <Row label="Feel" value={feelText} />
                            <Row label="Plays" value={take.bars <= LOOP_MAX_BARS ? 'round and round, as a pattern' : 'through once, and stops'} />
                        </div>
                    )}
                </div>

                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 0 }}>
                    <div style={listStyle} role="listbox" aria-label="Grooves">
                        {shown.length === 0 && <div style={{ padding: '0.5rem', color: '#9a9aa8', fontSize: '0.8rem' }}>No groove matches.</div>}
                        {shown.map(t => (
                            <button key={t.id} role="option" aria-selected={t.id === take?.id} onClick={() => choose(t)} style={rowStyle(t.id === take?.id)}>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {grooveStyleName(t.style)}{type === '' ? ` · ${t.type}` : ''}
                                </span>
                                <span style={{ color: '#9a9aa8', width: '4.2rem', textAlign: 'right', flexShrink: 0 }}>{t.bpm} bpm</span>
                                <span style={{ color: '#9a9aa8', width: '4.2rem', textAlign: 'right', flexShrink: 0 }}>{t.bars} bar{t.bars === 1 ? '' : 's'}</span>
                                <span style={{ color: '#9a9aa8', width: '2rem', textAlign: 'right', flexShrink: 0 }}>d{t.drummer}</span>
                            </button>
                        ))}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #9a9aa8)' }}>
                        {shown.length} of {takes.length} takes
                    </div>

                    <div style={{ ...labelStyle }}>
                        Grid
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {GRIDS.map(g => <button key={g.value} onClick={() => setGrid(g.value)} style={chipStyle(grid === g.value)} title={g.title}>{g.label}</button>)}
                        </div>
                    </div>
                    {parts.length > 0 && (
                        <label style={{ ...labelStyle }}>
                            Part
                            <select value={rangeIndex} onChange={e => setPart(Number(e.target.value))} style={selectStyle}>
                                {parts.map((p, i) => <option key={i} value={i}>Bars {p.from}–{p.to}</option>)}
                                {canWhole && <option value={-1}>The whole take ({take!.bars} bars)</option>}
                            </select>
                        </label>
                    )}

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <AuditionButton mei={auditionMei} drums />
                        <PlaybackTargetSelect compact />
                    </div>
                    <button onClick={() => url && onStart(url)} style={startButtonStyle} disabled={!url}>
                        ▶ Start — {take ? `${grooveStyleName(take.style)} ${take.type}, ${take.bpm} bpm${range ? `, bars ${range.from}–${range.to}` : ''}` : '…'}
                    </button>
                </div>
            </div>

            <div style={{ ...previewBoxStyle, minHeight: '96px' }}>
                {preview
                    ? <div style={{ filter: 'invert(0.92)' }} dangerouslySetInnerHTML={{ __html: preview }} />
                    : <span style={{ color: 'var(--color-text-secondary, #888)', fontSize: '0.85rem' }}>Loading preview…</span>}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary, #9a9aa8)' }}>
                Performances: the Groove MIDI Dataset, Magenta (Google), CC BY 4.0 — put on the grid and written out by this app.
            </div>
        </div>
    );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--color-text-secondary, #9a9aa8)', minWidth: '64px', fontSize: '0.72rem' }}>{label}</span>
        <span style={{ color: '#e8e8ef' }}>{value}</span>
    </div>
);

const listStyle: React.CSSProperties = {
    maxHeight: '220px', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '3px',
};
const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.28rem 0.5rem', borderRadius: '6px', cursor: 'pointer',
    fontSize: '0.8rem', textAlign: 'left', color: 'white', border: 'none', width: '100%', minWidth: 0, flexShrink: 0,
    background: active ? 'rgba(245,87,108,0.22)' : 'transparent',
});

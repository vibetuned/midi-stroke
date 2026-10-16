import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isTrackActiveForHand, useGame } from '../context/game';
import { useStats } from '../context/stats';
import type { TimemapData } from '../utils/timemap';
import { sessionEvents, sessionPlayedMs, sessionPlaying, type SessionEvent } from '../utils/sessionLog';
import {
    compareSessions, countNotes, formatPlayed, musicSpan, summarizeSession, type SessionRecord,
} from '../utils/sessionResults';
import { beatsAt, pulseTicksOf, swingAt } from '../utils/metronomeBeat';
import { effectiveBpm } from '../utils/tempo';
import { drumScoreLoops } from '../utils/drumGrid';
import { usePlayToggle } from '../hooks/usePlayToggle';
import { useSongNeighbours } from '../hooks/useSongNeighbours';
import { useMobileLayout } from '../hooks/useMobileLayout';
import { cardStyle, closeStyle } from './dialogStyles';

/**
 * The end of a piece: its session recorded, and the results shown — the
 * stats, this session against the ones before it, where the mistakes were on
 * a strip of the whole piece, and the visual metronome's wave for the whole
 * piece with a dot for every key played — then ↺ Replay or Play next.
 *
 * Mounted once in each app (piano, saxophone, drums). A drum pattern loops
 * on: each pass is recorded, but there is no end to show. Learn by ear has
 * results of its own.
 */

interface Result {
    song: string;
    mode: 'rhythm' | 'practice';
    record: SessionRecord;
    /** This song's sessions before this one, in this mode. */
    previous: SessionRecord[];
    events: SessionEvent[];
    timemap: TimemapData;
    /** The beat the wave swings in (utils/metronomeBeat.ts pulseTicksOf). */
    beatTicks: number;
}

const RED = '#f87171';
const ORANGE = '#fb923c';
const GREEN = '#4ade80';

export const SessionResults: React.FC = () => {
    const {
        songCompleted, setSongCompleted, selectedSong, setSelectedSong, gameMode, timemap,
        instrument, handSelection, isPlaying, tempo, scoreTempo,
    } = useGame();
    const { recordPlay, recordSessionEnd, resetSession, sessionStats, getSongStats } = useStats();
    const { nextTarget } = useSongNeighbours();
    const [result, setResult] = useState<Result | null>(null);
    const togglePlay = usePlayToggle();
    const latestToggle = useRef(togglePlay);
    useLayoutEffect(() => { latestToggle.current = togglePlay; });

    // Time is counted while playing (utils/sessionLog.ts).
    useEffect(() => { sessionPlaying(isPlaying); }, [isPlaying]);

    // The piece has ended: record the session, show it, start a new one.
    useEffect(() => {
        if (!songCompleted || !selectedSong) return;
        const mode = gameMode === 'standard' ? 'rhythm' : 'practice';
        const songName = selectedSong.split('/').pop() ?? selectedSong;
        const hands = instrument === 'piano' ? handSelection : 'both';
        const events = [...sessionEvents()];
        const record = summarizeSession({
            at: Date.now(),
            notes: timemap ? countNotes(timemap, staff => isTrackActiveForHand(staff - 1, hands)) : 0,
            score: sessionStats.score,
            correct: mode === 'rhythm' ? sessionStats.hits : sessionStats.goods,
            wrongsCounted: sessionStats.wrongs,
            maxCombo: sessionStats.maxCombo,
            bpm: tempo,
            bpmAt: tick => effectiveBpm(scoreTempo, tick, tempo),
            playedMs: sessionPlayedMs(),
            hands: instrument === 'piano' ? handSelection : undefined,
        }, events);
        const previous = getSongStats(selectedSong)?.[mode].sessions ?? [];
        recordPlay(selectedSong, songName, mode);
        recordSessionEnd(selectedSong, songName, mode, record);
        const loops = instrument === 'drums' && !!timemap && drumScoreLoops(timemap);
        if (timemap && !loops && gameMode !== 'ear') {
            // The transport's end reaches React as the songCompleted flag; this effect is its handler.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setResult({ song: selectedSong, mode, record, previous, events, timemap, beatTicks: pulseTicksOf(timemap.meter, tempo) });
        }
        resetSession();
        setSongCompleted(false);
    }, [songCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

    // Play next: the next piece starts — count-in and all — once it has loaded.
    const pending = useRef<{ song: string; after: TimemapData | null } | null>(null);
    useEffect(() => {
        const p = pending.current;
        if (!p) return;
        if (selectedSong !== p.song) { pending.current = null; return; }
        if (!timemap || timemap === p.after) return;
        pending.current = null;
        void latestToggle.current();
    }, [selectedSong, timemap]);

    if (!result) return null;
    const replay = () => { setResult(null); void togglePlay(); };
    const playNext = nextTarget && result.song === selectedSong
        ? () => {
            pending.current = { song: nextTarget, after: timemap };
            setResult(null);
            setSelectedSong(nextTarget);
        }
        : null;
    return createPortal(
        <ResultsDialog result={result} nextTarget={nextTarget} onClose={() => setResult(null)} onReplay={replay} onNext={playNext} />,
        document.body,
    );
};

const ResultsDialog: React.FC<{
    result: Result;
    nextTarget: string | null;
    onClose: () => void;
    onReplay: () => void;
    onNext: (() => void) | null;
}> = ({ result, nextTarget, onClose, onReplay, onNext }) => {
    const { songName } = useSongNeighbours();
    const phone = useMobileLayout();
    const { record, previous, mode } = result;
    const rhythm = mode === 'rhythm';
    const versus = compareSessions(previous, record);
    const span = useMemo(() => musicSpan(result.timemap), [result.timemap]);
    const waveRef = useRef<HTMLDivElement>(null);
    // The part of the piece the wave shows, as fractions of it — the window on the strip.
    const [view, setView] = useState<[number, number]>([0, 1]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const syncView = useCallback(() => {
        const el = waveRef.current;
        if (!el || el.scrollWidth <= 0) return;
        setView([el.scrollLeft / el.scrollWidth, (el.scrollLeft + el.clientWidth) / el.scrollWidth]);
    }, []);
    useLayoutEffect(syncView, [syncView]);
    const seekWave = (fraction: number) => {
        const el = waveRef.current;
        if (el) el.scrollLeft = fraction * el.scrollWidth - el.clientWidth / 2;
    };

    const pct = (x: number) => Math.round(x * 100);
    const timing = record.timing;
    const tiles: Tile[] = [
        {
            value: `${pct(record.precision)}%`, name: 'Precision', highlight: true,
            title: `Notes right the first time: ${Math.round(record.precision * record.notes)} of ${record.notes}.`
                + (versus.last ? ` Last time ${pct(versus.last.precision)}%; best before ${pct(versus.best!)}%.` : ''),
        },
        { value: `${pct(record.accuracy)}%`, name: 'Accuracy', title: 'Right, out of everything played and missed — the header\'s percentage while you play.' },
        { value: String(record.correct), name: rhythm ? 'Hits' : 'Right', color: GREEN, title: rhythm ? 'Keys that played a note of the score.' : 'Notes answered.' },
        { value: String(record.wrongs), name: 'Wrong', color: RED, title: 'Keys that played nothing the score asks for.' },
        ...(rhythm ? [{ value: String(record.misses), name: 'Missed', color: ORANGE, title: 'Notes let go by.' }] : []),
        { value: `×${record.maxCombo}`, name: 'Combo', color: ORANGE, title: 'The longest run without a mistake.' },
        ...(rhythm && timing ? [{
            value: Math.abs(timing.meanMs) < 10 ? 'On time' : `${Math.abs(timing.meanMs)} ms`,
            name: Math.abs(timing.meanMs) < 10 ? 'Timing' : timing.meanMs > 0 ? 'Late' : 'Early',
            title: `Your keys against their notes, on average ${Math.abs(timing.meanMs) < 10 ? 'on time' : `${Math.abs(timing.meanMs)} ms ${timing.meanMs > 0 ? 'late' : 'early'}`}, give or take ${timing.spreadMs} ms.`,
        }] : []),
        { value: formatPlayed(record.playedMs), name: 'Played', title: 'Time spent playing, pauses left out.' },
    ];
    // This session against the last one, by the chart: a new best, or the change in points.
    const change = versus.personalBest ? { text: '★ new best', color: '#facc15' }
        : versus.delta === null ? null
            : versus.delta > 0 ? { text: `▲ ${versus.delta} since last time`, color: GREEN }
                : versus.delta < 0 ? { text: `▼ ${-versus.delta} since last time`, color: RED }
                    : { text: '= same as last time', color: '#9a9aa8' };
    const nextName = nextTarget ? decodeName(nextTarget) : null;
    const title = songName.replace(/\.mei$/i, '').replace(/_/g, ' ');
    const handsLabel = record.hands === 'left' ? 'L' : record.hands === 'right' ? 'R' : record.hands === 'both' ? 'L+R' : null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: phone ? '0.6rem' : '1rem',
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-label="Session results"
                style={{
                    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', boxSizing: 'border-box',
                    padding: phone ? '0.9rem 1.1rem' : '1.5rem', width: '100%', maxWidth: phone ? '900px' : '820px',
                    maxHeight: '100%', overflowY: 'auto', color: 'white',
                    display: 'flex', flexDirection: 'column', gap: phone ? '0.7rem' : '1.1rem',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', minWidth: 0 }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
                            {title}
                        </h2>
                        <span style={{ fontSize: '0.78rem', color: '#9a9aa8', whiteSpace: 'nowrap' }}>
                            {rhythm ? 'Rhythm' : 'Practice'}{handsLabel ? ` · ${handsLabel}` : ''} · ♩ = {Math.round(record.bpm)}
                        </span>
                    </div>
                    <button onClick={onClose} title="Close (Esc)" style={closeStyle}>✕</button>
                </div>

                <div style={phone ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', alignItems: 'start' } : { display: 'contents' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${phone ? 78 : 84}px, 1fr))`, gap: '0.5rem' }}>
                        {tiles.map(t => <StatTile key={t.name} tile={t} />)}
                    </div>
                    <section style={sectionStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                            <h3 style={headingStyle} title="This session's precision against your earlier sessions of this piece, in this mode.">Progress</h3>
                            {change && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: change.color, whiteSpace: 'nowrap' }}>{change.text}</span>}
                        </div>
                        <ProgressChart previous={previous} record={record} wide={phone} />
                    </section>
                </div>

                <section style={sectionStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                        <h3 style={headingStyle} title="Where the mistakes were, over the whole piece. Click it to see that part of the wave below.">Mistakes</h3>
                        <Legend color={RED} label="wrong" />
                        {rhythm && <Legend color={ORANGE} label="missed" />}
                    </div>
                    <MistakeStrip events={result.events} span={span} view={rhythm ? view : null} onSeek={rhythm ? seekWave : undefined} />
                </section>

                {rhythm && (
                    <section style={sectionStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                            <h3
                                style={headingStyle}
                                title="The visual metronome's wave for the whole piece: at the bottom on every beat, at the top between. Each key you played is a dot where the wave was — in a trough on the beat, on the slope before it early, after it late."
                            >
                                Timing
                            </h3>
                            <Legend color="white" ring="var(--color-accent)" label="played" />
                            <Legend color={RED} label="wrong" />
                            <Legend color="transparent" ring={ORANGE} label="missed" />
                        </div>
                        <div ref={waveRef} onScroll={syncView} style={{ overflowX: 'auto', overflowY: 'hidden', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}>
                            <WaveStrip result={result} span={span} height={phone ? 84 : 104} />
                        </div>
                    </section>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                    <button onClick={onReplay} title="Play this piece again from the start" style={buttonStyle(false, true)}>↺ Replay</button>
                    <button
                        onClick={() => onNext?.()}
                        disabled={!onNext}
                        title={nextName ? `Next: ${nextName}` : 'The last piece of this collection'}
                        style={buttonStyle(true, !!onNext)}
                    >
                        Play next ▶
                    </button>
                </div>
            </div>
        </div>
    );
};

interface Tile {
    value: string;
    name: string;
    title: string;
    color?: string;
    highlight?: boolean;
}

/** One number, its name under it, what it means on hover. */
const StatTile: React.FC<{ tile: Tile }> = ({ tile }) => (
    <div title={tile.title} style={{ ...cardStyle(!!tile.highlight), flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem', padding: '0.6rem 0.75rem', minWidth: 0 }}>
        <span style={{ fontSize: '1.3rem', fontWeight: 700, color: tile.color ?? 'white', whiteSpace: 'nowrap', lineHeight: 1.15 }}>{tile.value}</span>
        <span style={{ fontSize: '0.72rem', color: '#9a9aa8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{tile.name}</span>
    </div>
);

const Legend: React.FC<{ color: string; ring?: string; label: string }> = ({ color, ring, label }) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: '#9a9aa8' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, border: ring ? `1.5px solid ${ring}` : 'none', boxSizing: 'border-box' }} />
        {label}
    </span>
);

/** Precision, session by session: the last few before this one, and this one. */
const ProgressChart: React.FC<{ previous: SessionRecord[]; record: SessionRecord; wide: boolean }> = ({ previous, record, wide }) => {
    const points = [...previous.slice(-(CHART_SESSIONS - 1)), record];
    const W = wide ? 420 : 760, H = wide ? 150 : 120;
    const L = 34, R = 16, T = 26, B = 18;
    const x = (i: number) => points.length === 1 ? (L + W - R) / 2 : L + (i / (points.length - 1)) * (W - L - R);
    const y = (p: number) => T + (1 - p) * (H - T - B);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.precision).toFixed(1)}`).join(' ');
    const last = points.length - 1;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Precision by session">
            {[0, 0.5, 1].map(p => (
                <g key={p}>
                    <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke="rgba(255,255,255,0.08)" />
                    <text x={L - 6} y={y(p) + 4} fill="#6b6b78" fontSize="11" textAnchor="end">{p * 100}%</text>
                </g>
            ))}
            {points.length > 1 && <path d={line} fill="none" stroke="var(--color-accent)" strokeOpacity={0.55} strokeWidth={2} />}
            {points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(p.precision)} r={i === last ? 6 : 4}
                    fill={i === last ? 'var(--color-accent)' : '#1a1a1a'} stroke="var(--color-accent)" strokeWidth={2}>
                    <title>{describeSession(p, i === last)}</title>
                </circle>
            ))}
            <text x={x(last)} y={y(record.precision) - 11} fill="white" fontSize="12" fontWeight="700" textAnchor={points.length === 1 ? 'middle' : 'end'}>
                {Math.round(record.precision * 100)}%
            </text>
            {points.length === 1 && (
                <text x={(L + W - R) / 2} y={H - 4} fill="#6b6b78" fontSize="11" textAnchor="middle">your first session of this piece</text>
            )}
        </svg>
    );
};

/** How many sessions the chart shows, this one included. */
const CHART_SESSIONS = 20;

function describeSession(r: SessionRecord, now: boolean): string {
    const when = now ? 'This session' : new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const hands = r.hands === 'left' ? ' · left hand' : r.hands === 'right' ? ' · right hand' : '';
    return `${when}: ${Math.round(r.precision * 100)}% · ♩ = ${Math.round(r.bpm)}${hands}`;
}

/** The whole piece as a strip, its bars and its mistakes; with the wave, the part it shows. */
const MistakeStrip: React.FC<{
    events: SessionEvent[];
    span: { bars: number[]; start: number; end: number };
    view: [number, number] | null;
    onSeek?: (fraction: number) => void;
}> = ({ events, span, view, onSeek }) => {
    const at = (tick: number) => Math.max(0, Math.min(1, (tick - span.start) / (span.end - span.start))) * 100;
    const dragging = useRef(false);
    const seek = (e: React.PointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek?.((e.clientX - r.left) / r.width);
    };
    return (
        <div
            onPointerDown={e => { if (!onSeek) return; dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); seek(e); }}
            onPointerMove={e => { if (dragging.current) seek(e); }}
            onPointerUp={() => { dragging.current = false; }}
            onPointerCancel={() => { dragging.current = false; }}
            style={{
                position: 'relative', height: '26px', borderRadius: '6px', background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.1)', cursor: onSeek ? 'pointer' : 'default', touchAction: 'none', overflow: 'hidden',
            }}
        >
            {span.bars.filter(b => b > span.start && b < span.end).map(b => (
                <div key={b} style={{ position: 'absolute', top: 5, bottom: 5, left: `${at(b)}%`, width: 1, background: 'rgba(255,255,255,0.22)' }} />
            ))}
            {view && (
                <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${view[0] * 100}%`, width: `${Math.max(0.5, (view[1] - view[0]) * 100)}%`,
                    background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', border: '1px solid var(--color-accent)', borderRadius: '4px', boxSizing: 'border-box',
                }} />
            )}
            {events.filter(e => e.kind !== 'hit' && e.tick >= span.start - 1).map((e, i) => (
                <div key={i} style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${at(e.tick)}%`, width: 2, marginLeft: -1,
                    background: e.kind === 'wrong' ? RED : ORANGE, boxShadow: `0 0 3px ${e.kind === 'wrong' ? RED : ORANGE}`,
                }} />
            ))}
        </div>
    );
};

/** Pixels a beat on the wave: wide enough to read each dot against its beat. */
const PX_PER_BEAT = 44;

/** The visual metronome's wave, for the whole piece, with every key played on it. Drawn once: scrolling it changes nothing here. */
const WaveStrip = memo(function WaveStrip({ result, span, height }: { result: Result; span: { bars: number[]; start: number; end: number }; height: number }) {
    const { beatTicks, events } = result;
    const pad = 14;
    const pxPerTick = PX_PER_BEAT / beatTicks;
    const width = Math.ceil((span.end - span.start) * pxPerTick) + pad * 2;
    const top = 22, bottom = height - 10;
    const mid = (top + bottom) / 2, amp = (bottom - top) / 2;
    const xAt = (tick: number) => pad + (tick - span.start) * pxPerTick;
    // At the bottom on the beat, at the top between — as on the cursor.
    const yAt = (tick: number) => mid + amp * swingAt(beatsAt(span.bars, beatTicks, tick));
    const path = useMemo(() => {
        const step = beatTicks / 12;
        let d = '';
        for (let t = span.start; t <= span.end + 1e-6; t += step) d += `${d ? 'L' : 'M'}${xAt(t).toFixed(1)},${yAt(t).toFixed(1)}`;
        return d;
    }, [span, beatTicks, height]); // eslint-disable-line react-hooks/exhaustive-deps
    const inPiece = (t: number) => t >= span.start - beatTicks / 2 && t <= span.end + beatTicks / 2;
    const bars = span.bars.filter(b => b >= span.start && b < span.end);
    return (
        <svg width={width} height={height} style={{ display: 'block' }} role="img" aria-label="Timing over the whole piece">
            <line x1={pad} x2={width - pad} y1={bottom} y2={bottom} stroke="var(--color-accent)" strokeOpacity={0.2} />
            {bars.map((b, i) => (
                <g key={b}>
                    <line x1={xAt(b)} x2={xAt(b)} y1={14} y2={bottom} stroke="rgba(255,255,255,0.12)" />
                    <text x={xAt(b) + 4} y={13} fill="#6b6b78" fontSize="10">{i + 1}</text>
                </g>
            ))}
            <path d={path} fill="none" stroke="var(--color-accent)" strokeOpacity={0.75} strokeWidth={2} />
            {events.filter(e => inPiece(e.tick)).map((e, i) => (
                e.kind === 'miss'
                    ? <circle key={i} cx={xAt(e.tick)} cy={yAt(e.tick)} r={4} fill="none" stroke={ORANGE} strokeWidth={1.8} />
                    : <circle key={i} cx={xAt(e.tick)} cy={yAt(e.tick)} r={3.6}
                        fill={e.kind === 'wrong' ? RED : 'white'} stroke={e.kind === 'wrong' ? RED : 'var(--color-accent)'} strokeWidth={1.5} />
            ))}
        </svg>
    );
});

function decodeName(url: string): string {
    const raw = url.split('/').pop() ?? url;
    let name = raw;
    try { name = decodeURIComponent(raw); } catch { /* keep raw */ }
    return name.replace(/\.mei$/i, '').replace(/_/g, ' ');
}

const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 0 };

const headingStyle: React.CSSProperties = {
    margin: 0, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent)', cursor: 'help',
};

const buttonStyle = (primary: boolean, enabled: boolean): React.CSSProperties => ({
    padding: '0.55rem 1.1rem', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600,
    background: primary ? 'var(--color-accent)' : 'transparent', color: 'white',
    border: `1px solid ${primary ? 'var(--color-accent)' : 'rgba(255,255,255,0.25)'}`,
    cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.45,
});

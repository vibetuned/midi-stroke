import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useGame, TEMPO_MAX, TEMPO_MIN } from '../context/game';
import { useAccompanimentFor } from '../hooks/useAccompaniment';
import {
    decodeAccompaniment, removeAccompaniment, saveAccompaniment, updateAccompaniment,
    type AccompanimentMeta,
} from '../utils/accompaniment';
import {
    AUDIO_ACCEPT, audioTimeAt, bpmForEnd, computePeaks, formatTime, initialSync, isKeptSong, peakRange,
    type AccompanimentSync, type Peaks, type ScoreSpan,
} from '../utils/accompanimentSync';
import { barBoundaries } from '../utils/loopRange';
import { TONE_PPQ } from '../utils/timemap';

/**
 * A song's accompaniment: pick a recording, then line the score up with it.
 * Opened from the 🎧 playback panel. The recording's waveform fills the view;
 * the score lies over it as a band from its first bar to its end, bar lines
 * drawn in. Drag the band to move bar 1, drag its right edge to stretch the
 * score (that is the tempo), zoom in to be exact, and ▶ Check to hear the
 * recording with a click on every beat of the score. The recording may be
 * longer than the score at either end. Played in rhythm mode
 * (hooks/useAccompanimentPlayer.ts); stored by utils/accompaniment.ts.
 */

const ctx = () => Tone.getContext().rawContext as unknown as BaseAudioContext;
const WAVE_HEIGHT = 190;

export const AccompanimentPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { selectedSong, timemap, scoreTempo, tempo, setIsPlaying } = useGame();
    const meta = useAccompanimentFor(selectedSong);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Lining up is done here, not against the moving score.
    useEffect(() => {
        setIsPlaying(false);
        Tone.getTransport().pause();
    }, [setIsPlaying]);

    const span: ScoreSpan | null = useMemo(() => {
        if (!timemap) return null;
        return { tempo: timemap.tempo?.initial ? timemap.tempo : null, startTick: barBoundaries(timemap)[0], endTick: timemap.totalTicks };
    }, [timemap]);
    const bars = useMemo(() => (timemap ? barBoundaries(timemap) : []), [timemap]);

    const pick = async (file: File | undefined) => {
        if (!file || !selectedSong) return;
        setBusy(true);
        setError(null);
        try {
            // The score's own tempo when it has one; otherwise the slider's.
            const bpm = scoreTempo?.initial ? Math.round(scoreTempo.initial.bpm) : Math.round(tempo);
            await saveAccompaniment(selectedSong, file, ctx(), buffer => {
                const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
                return initialSync(channels, buffer.sampleRate, bpm);
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The file could not be read.');
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!selectedSong || !meta) return;
        if (!window.confirm(`Delete the accompaniment "${meta.fileName}" from this song?`)) return;
        await removeAccompaniment(selectedSong);
    };

    return (
        <div style={backdropStyle} onClick={onClose}>
            <div role="dialog" aria-label="Accompaniment" style={panelStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>🎶 Accompaniment</h2>
                        <p style={leadStyle}>
                            A recording that plays along while you play this piece, in Rhythm mode. Line the
                            score up with it once: where bar 1 starts, and how long the piece lasts.
                        </p>
                    </div>
                    <button onClick={onClose} title="Close (Esc)" style={closeStyle}>✕</button>
                </div>

                <input
                    ref={fileRef}
                    type="file"
                    accept={AUDIO_ACCEPT}
                    style={{ display: 'none' }}
                    onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}
                />

                {!selectedSong || !span ? (
                    <p style={leadStyle}>Open a piece first.</p>
                ) : !meta ? (
                    <DropZone busy={busy} onPick={() => fileRef.current?.click()} onDrop={f => void pick(f)} />
                ) : (
                    <SyncEditor
                        songKey={selectedSong}
                        meta={meta}
                        span={span}
                        bars={bars}
                        scoreBpm={scoreTempo?.initial ? Math.round(scoreTempo.initial.bpm) : null}
                        onReplace={() => fileRef.current?.click()}
                        onDelete={() => void remove()}
                        onClose={onClose}
                    />
                )}

                {error && <p style={{ margin: 0, fontSize: '0.82rem', color: '#f87171' }}>{error}</p>}

                <p style={{ margin: 0, fontSize: '0.72rem', color: '#7a7a88', lineHeight: 1.45 }}>
                    Plays in Rhythm mode, on the piece&apos;s transport — loops and seeks included. While it
                    is on, the piece plays at the recording&apos;s tempo and the metronome is quiet.
                    {selectedSong && (isKeptSong(selectedSong)
                        ? ' Kept on this device with the song.'
                        : ' This piece was opened from a file, so the recording is kept for this session only.')}
                </p>
            </div>
        </div>
    );
};

const DropZone: React.FC<{ busy: boolean; onPick: () => void; onDrop: (f: File) => void }> = ({ busy, onPick, onDrop }) => {
    const [over, setOver] = useState(false);
    return (
        <div
            onDragOver={e => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onDrop(f); }}
            style={{
                border: `2px dashed ${over ? 'var(--color-accent)' : 'rgba(255,255,255,0.18)'}`,
                borderRadius: '12px', padding: '2.2rem 1rem', textAlign: 'center',
                background: over ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
            }}
        >
            <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>🎶</div>
            <button onClick={onPick} disabled={busy} style={primaryStyle}>
                {busy ? 'Reading the recording…' : 'Choose a recording'}
            </button>
            <p style={{ ...leadStyle, marginTop: '0.7rem' }}>
                or drop it here — WAV, MP3, AAC/M4A, FLAC, OGG, Opus, AIFF… whatever this browser can play.
            </p>
        </div>
    );
};

// ------------------------------------------------------------------ editor

interface View { start: number; dur: number }

const SyncEditor: React.FC<{
    songKey: string;
    meta: AccompanimentMeta;
    span: ScoreSpan;
    bars: number[];
    scoreBpm: number | null;
    onReplace: () => void;
    onDelete: () => void;
    onClose: () => void;
}> = ({ songKey, meta, span, bars, scoreBpm, onReplace, onDelete, onClose }) => {
    const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
    useEffect(() => {
        let cancelled = false;
        decodeAccompaniment(songKey, ctx()).then(b => { if (!cancelled) setBuffer(b); }).catch(() => { /* shown as loading */ });
        return () => { cancelled = true; };
    }, [songKey, meta.id]);
    const peaks = useMemo(() => {
        if (!buffer) return null;
        return computePeaks(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)));
    }, [buffer]);

    // While dragging, the sync lives here; it is stored on release.
    const [draft, setDraft] = useState<AccompanimentSync | null>(null);
    const sync: AccompanimentSync = draft ?? { offset: meta.offset, bpm: meta.bpm };
    const commit = useCallback((next: AccompanimentSync) => {
        setDraft(null);
        void updateAccompaniment(songKey, {
            offset: Math.round(next.offset * 1000) / 1000,
            bpm: Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(next.bpm * 100) / 100)),
        });
    }, [songKey]);

    const scoreStart = audioTimeAt(sync, span, span.startTick);
    const scoreEnd = audioTimeAt(sync, span, span.endTick);
    const total = Math.max(meta.duration, scoreEnd) + 1;
    const [view, setView] = useState<View>(() => ({ start: -0.5, dur: Math.max(meta.duration, scoreEnd - Math.min(0, scoreStart)) + 1.5 }));
    const [cursor, setCursor] = useState<number | null>(null);
    const preview = usePreview(buffer, sync, span, bars);

    // Keys: space checks, arrows nudge bar 1 (shift: 100 ms), Esc closes.
    // In the capture phase, so the transport's own shortcuts stay out of it.
    const syncRef = useRef(sync);
    useEffect(() => { syncRef.current = sync; });
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
            if (e.key === ' ') {
                e.preventDefault(); e.stopPropagation();
                if (preview.playing) preview.stop(); else preview.start(cursor ?? Math.max(0, syncRef.current.offset - 1));
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation();
                const step = (e.shiftKey ? 0.1 : 0.01) * (e.key === 'ArrowLeft' ? -1 : 1);
                commit({ ...syncRef.current, offset: syncRef.current.offset + step });
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.stopPropagation();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose, preview, cursor, commit]);

    const focus = (t: number, dur: number) => setView({ start: t - dur / 2, dur });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
                <span style={{ fontWeight: 600 }}>{meta.fileName}</span>
                <span style={{ color: '#9a9aa8' }}>
                    {formatTime(meta.duration)} · {(meta.size / 1e6).toFixed(1)} MB
                </span>
                <span style={{ flex: 1 }} />
                <button onClick={onReplace} style={smallBtnStyle}>Replace…</button>
                <button onClick={onDelete} style={{ ...smallBtnStyle, color: '#f5a3ae', borderColor: 'rgba(245,87,108,0.45)' }} title="Delete the accompaniment">
                    🗑 Delete
                </button>
            </div>

            <Waveform
                peaks={peaks}
                sampleRate={buffer?.sampleRate ?? 44100}
                channels={buffer}
                duration={meta.duration}
                total={total}
                view={view}
                setView={setView}
                sync={sync}
                span={span}
                bars={bars}
                cursor={cursor}
                playhead={preview.playing ? preview.position : null}
                onDraft={setDraft}
                onCommit={commit}
                onCursor={setCursor}
            />

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setView(v => ({ start: v.start + v.dur * 0.25, dur: v.dur / 2 }))} style={smallBtnStyle} title="Zoom in (or pinch / ctrl-scroll)">＋</button>
                <button onClick={() => setView(v => ({ start: v.start - v.dur / 2, dur: Math.min(total * 1.5, v.dur * 2) }))} style={smallBtnStyle} title="Zoom out">－</button>
                <button onClick={() => setView({ start: -0.5, dur: total + 0.5 })} style={smallBtnStyle}>Whole recording</button>
                <button onClick={() => setView({ start: scoreStart - 1, dur: scoreEnd - scoreStart + 2 })} style={smallBtnStyle}>The score</button>
                <button onClick={() => focus(scoreStart, 4)} style={smallBtnStyle} title="Zoom in on bar 1, to place it exactly">⟵ Bar 1</button>
                <button onClick={() => focus(scoreEnd, 4)} style={smallBtnStyle} title="Zoom in on the end, to set the tempo exactly">End ⟶</button>
                <span style={{ flex: 1 }} />
                {preview.playing
                    ? <button onClick={preview.stop} style={primaryStyle}>■ Stop</button>
                    : (
                        <button
                            onClick={() => preview.start(cursor ?? Math.max(0, sync.offset - 1))}
                            style={primaryStyle}
                            title="Play the recording with a click on every beat of the score (space)"
                        >
                            ▶ Check {cursor !== null ? `from ${formatTime(cursor)}` : 'from bar 1'}
                        </button>
                    )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.7rem' }}>
                <Field label="Bar 1 starts at" hint="← → nudge 10 ms · shift 100 ms">
                    <Stepper
                        value={sync.offset}
                        format={v => v.toFixed(3)}
                        unit="s"
                        steps={[-0.1, -0.01, 0.01, 0.1]}
                        onChange={offset => commit({ ...sync, offset })}
                    />
                </Field>
                <Field label="Tempo (♩ = )" hint={`The score lasts ${formatTime(scoreEnd - scoreStart)} at this tempo`}>
                    <Stepper
                        value={sync.bpm}
                        format={v => v.toFixed(2)}
                        steps={[-1, -0.1, 0.1, 1]}
                        onChange={bpm => commit({ ...sync, bpm })}
                    />
                    {scoreBpm !== null && Math.abs(scoreBpm - sync.bpm) > 0.005 && (
                        <button onClick={() => commit({ ...sync, bpm: scoreBpm })} style={linkStyle}>use the score&apos;s ♩ = {scoreBpm}</button>
                    )}
                </Field>
                <Field label="Level" hint={`${meta.volume > 0 ? '+' : ''}${meta.volume} dB`}>
                    <input
                        type="range" min={-30} max={6} step={1}
                        value={meta.volume}
                        onChange={e => void updateAccompaniment(songKey, { volume: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                        aria-label="Accompaniment level"
                    />
                </Field>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.6rem 0.7rem', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontSize: '0.7rem', color: '#9a9aa8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        {children}
        {hint && <span style={{ fontSize: '0.7rem', color: '#77778a' }}>{hint}</span>}
    </div>
);

/** A number with a field to type in and step buttons around it. */
const Stepper: React.FC<{
    value: number;
    format: (v: number) => string;
    unit?: string;
    steps: number[];
    onChange: (v: number) => void;
}> = ({ value, format, unit, steps, onChange }) => {
    const [text, setText] = useState<string | null>(null);
    const neg = steps.filter(s => s < 0);
    const pos = steps.filter(s => s > 0);
    const stepBtn = (s: number) => (
        <button key={s} onClick={() => onChange(value + s)} style={stepStyle} title={`${s > 0 ? '+' : ''}${s}`}>
            {s > 0 ? '+' : '−'}{Math.abs(s) < 0.1 ? Math.abs(s).toString().replace(/^0/, '') : Math.abs(s)}
        </button>
    );
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {neg.map(stepBtn)}
            <input
                value={text ?? format(value)}
                onChange={e => setText(e.target.value)}
                onBlur={() => { const n = Number(text); if (text !== null && Number.isFinite(n)) onChange(n); setText(null); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                inputMode="decimal"
                style={numberStyle}
            />
            {unit && <span style={{ fontSize: '0.75rem', color: '#9a9aa8' }}>{unit}</span>}
            {pos.map(stepBtn)}
        </div>
    );
};

// ---------------------------------------------------------------- waveform

const Waveform: React.FC<{
    peaks: Peaks | null;
    sampleRate: number;
    channels: AudioBuffer | null;
    duration: number;
    total: number;
    view: View;
    setView: React.Dispatch<React.SetStateAction<View>>;
    sync: AccompanimentSync;
    span: ScoreSpan;
    bars: number[];
    cursor: number | null;
    playhead: number | null;
    onDraft: (s: AccompanimentSync) => void;
    onCommit: (s: AccompanimentSync) => void;
    onCursor: (t: number) => void;
}> = ({ peaks, sampleRate, channels, duration, total, view, setView, sync, span, bars, cursor, playhead, onDraft, onCommit, onCursor }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [width, setWidth] = useState(800);
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const xOf = useCallback((t: number) => ((t - view.start) / view.dur) * width, [view, width]);
    const tOf = useCallback((x: number) => view.start + (x / width) * view.dur, [view, width]);
    const barTimes = useMemo(() => bars.map(t => audioTimeAt(sync, span, t)), [bars, sync, span]);
    const scoreStart = barTimes[0];
    const scoreEnd = audioTimeAt(sync, span, span.endTick);

    // Draw.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(WAVE_HEIGHT * dpr);
        const g = canvas.getContext('2d');
        if (!g) return;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = '#101014';
        g.fillRect(0, 0, width, WAVE_HEIGHT);
        const accent = getComputedStyle(canvas).getPropertyValue('--color-accent').trim() || '#646cff';
        const top = 18, h = WAVE_HEIGHT - top - 4, mid = top + h / 2;

        // Time ruler.
        const secPerPx = view.dur / width;
        const stepChoices = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
        const step = stepChoices.find(s => s / secPerPx >= 70) ?? 300;
        g.fillStyle = '#6a6a78';
        g.font = '10px system-ui, sans-serif';
        for (let t = Math.ceil(view.start / step) * step; t < view.start + view.dur; t += step) {
            const x = xOf(t);
            g.fillRect(x, 0, 1, 5);
            g.fillText(formatTime(t, step < 1 ? 2 : 0), x + 3, 11);
        }

        // Outside the recording.
        g.fillStyle = '#0a0a0c';
        if (xOf(0) > 0) g.fillRect(0, top, xOf(0), h);
        if (xOf(duration) < width) g.fillRect(xOf(duration), top, width - xOf(duration), h);

        // The score's span.
        const sx = xOf(scoreStart), ex = xOf(scoreEnd);
        g.fillStyle = accent;
        g.globalAlpha = 0.14;
        g.fillRect(sx, top, ex - sx, h);
        g.globalAlpha = 1;

        // Waveform.
        if (peaks && channels) {
            const chans = Array.from({ length: channels.numberOfChannels }, (_, i) => channels.getChannelData(i));
            g.fillStyle = '#8fb3c9';
            for (let x = 0; x < width; x++) {
                const a = tOf(x) * sampleRate, b = tOf(x + 1) * sampleRate;
                if (b < 0 || a > duration * sampleRate) continue;
                let lo = 0, hi = 0;
                if (b - a >= peaks.blockSize) {
                    [lo, hi] = peakRange(peaks, a, b);
                } else {
                    for (let i = Math.max(0, Math.floor(a)); i <= Math.min(chans[0].length - 1, Math.ceil(b)); i++) {
                        let v = 0;
                        for (const c of chans) v += c[i];
                        v /= chans.length;
                        if (v < lo) lo = v;
                        if (v > hi) hi = v;
                    }
                }
                const y0 = mid - hi * (h / 2), y1 = mid - lo * (h / 2);
                g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
            }
        } else {
            g.fillStyle = '#6a6a78';
            g.fillText('Reading the recording…', 12, mid);
        }

        // Bar lines, numbered as far as there is room.
        const pxPerBar = barTimes.length > 1 ? (xOf(barTimes[barTimes.length - 1]) - xOf(barTimes[0])) / (barTimes.length - 1) : width;
        const every = [1, 2, 4, 8, 16, 32, 64].find(n => n * pxPerBar >= 26) ?? 128;
        barTimes.forEach((t, i) => {
            const x = xOf(t);
            if (x < -2 || x > width + 2) return;
            g.fillStyle = accent;
            g.globalAlpha = i === 0 || i === barTimes.length - 1 ? 1 : 0.4;
            g.fillRect(x, top, i === 0 || i === barTimes.length - 1 ? 2 : 1, h);
            g.globalAlpha = 1;
            if (i < barTimes.length - 1 && i % every === 0) {
                g.fillStyle = '#d6d6e0';
                g.fillText(String(i + 1), x + 3, top + 11);
            }
        });
        // Drag grips at both ends.
        g.fillStyle = accent;
        g.fillRect(sx - 5, top + h / 2 - 14, 10, 28);
        g.fillRect(ex - 5, top + h / 2 - 14, 10, 28);

        if (cursor !== null) {
            g.fillStyle = '#ffffff';
            g.globalAlpha = 0.75;
            g.fillRect(xOf(cursor), top, 1, h);
            g.globalAlpha = 1;
        }
        if (playhead !== null) {
            g.fillStyle = '#f87171';
            g.fillRect(xOf(playhead) - 1, top, 2, h);
        }
    }, [peaks, channels, sampleRate, duration, width, view, xOf, tOf, barTimes, scoreStart, scoreEnd, cursor, playhead]);

    // Zoom (pinch, ctrl/⌘-scroll or plain scroll) and pan (horizontal scroll).
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const at = view.start + ((e.clientX - rect.left) / rect.width) * view.dur;
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) {
                setView(v => ({ ...v, start: v.start + (e.deltaX / rect.width) * v.dur }));
                return;
            }
            const factor = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
            setView(v => {
                const dur = Math.max(0.05, Math.min(total * 1.5, v.dur * factor));
                return { start: at - (at - v.start) * (dur / v.dur), dur };
            });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [view, setView, total]);

    // Drag: the band moves bar 1, its right edge sets the tempo, empty space pans.
    const drag = useRef<{ mode: 'move' | 'end' | 'pan'; x0: number; t0: number; sync0: AccompanimentSync; view0: View; moved: boolean } | null>(null);
    const hit = (x: number): 'move' | 'end' | 'pan' => {
        const sx = xOf(scoreStart), ex = xOf(scoreEnd);
        if (Math.abs(x - ex) <= 8) return 'end';
        if (Math.abs(x - sx) <= 8 || (x > sx && x < ex)) return 'move';
        return 'pan';
    };
    const localX = (e: React.PointerEvent) => e.clientX - e.currentTarget.getBoundingClientRect().left;

    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Waveform, with the score from ${formatTime(scoreStart)} to ${formatTime(scoreEnd)}`}
            style={{ width: '100%', height: `${WAVE_HEIGHT}px`, borderRadius: '8px', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={e => {
                const x = localX(e);
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { mode: hit(x), x0: x, t0: tOf(x), sync0: sync, view0: view, moved: false };
            }}
            onPointerMove={e => {
                const x = localX(e);
                const d = drag.current;
                if (!d) {
                    const m = hit(x);
                    e.currentTarget.style.cursor = m === 'end' ? 'ew-resize' : m === 'move' ? 'grab' : 'crosshair';
                    return;
                }
                if (Math.abs(x - d.x0) > 3) d.moved = true;
                if (!d.moved) return;
                const dt = ((x - d.x0) / width) * d.view0.dur;
                if (d.mode === 'pan') setView({ ...d.view0, start: d.view0.start - dt });
                else if (d.mode === 'move') onDraft({ ...d.sync0, offset: d.sync0.offset + dt });
                else onDraft({ ...d.sync0, bpm: bpmForEnd(d.sync0, span, d.view0.start + (x / width) * d.view0.dur, { min: TEMPO_MIN, max: TEMPO_MAX }) });
            }}
            onPointerUp={e => {
                const d = drag.current;
                drag.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                if (!d) return;
                if (!d.moved) { onCursor(Math.max(0, d.t0)); return; }
                if (d.mode !== 'pan') onCommit(sync);
            }}
        />
    );
};

// ----------------------------------------------------------------- preview

/**
 * ▶ Check: the recording from a point, with a click on every beat of the
 * score — accented at each bar line — so you can hear whether they agree.
 * Its own little player, apart from the piece's transport. Clicks are handed
 * over a quarter of a second ahead, like the rest of the app's playback.
 */
function usePreview(buffer: AudioBuffer | null, sync: AccompanimentSync, span: ScoreSpan, bars: number[]) {
    const [state, setState] = useState<{ playing: boolean; position: number }>({ playing: false, position: 0 });
    const run = useRef<{ stop: () => void } | null>(null);

    const stop = useCallback(() => {
        run.current?.stop();
        run.current = null;
        setState(s => ({ ...s, playing: false }));
    }, []);

    const start = useCallback((from: number) => {
        if (!buffer) return;
        run.current?.stop();
        void Tone.start();
        const player = new Tone.Player(new Tone.ToneAudioBuffer(buffer)).toDestination();
        const click = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: -14 }).toDestination();
        const t0 = Tone.now() + 0.05;
        player.start(t0, Math.max(0, from));
        const barSet = new Set(bars);
        const beats: Array<{ at: number; down: boolean }> = [];
        for (let tick = span.startTick; tick <= span.endTick; tick += TONE_PPQ) {
            const at = audioTimeAt(sync, span, tick);
            if (at >= from) beats.push({ at, down: barSet.has(tick) });
        }
        let next = 0;
        const tick = () => {
            const now = Tone.now();
            const position = from + (now - t0);
            while (next < beats.length && t0 + (beats[next].at - from) < now + 0.25) {
                const b = beats[next++];
                click.triggerAttackRelease(b.down ? 'C7' : 'G6', 0.02, t0 + (b.at - from));
            }
            if (position > buffer.duration + 0.2) { stop(); return; }
            setState({ playing: true, position });
        };
        const id = setInterval(tick, 40);
        run.current = {
            stop: () => {
                clearInterval(id);
                player.stop();
                player.dispose();
                click.dispose();
            },
        };
        setState({ playing: true, position: from });
    }, [buffer, sync, span, bars, stop]);

    useEffect(() => () => run.current?.stop(), []);
    return useMemo(() => ({ ...state, start, stop }), [state, start, stop]);
}

// ------------------------------------------------------------------ styles

const backdropStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 210,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};
const panelStyle: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
    padding: '1.5rem', width: '100%', maxWidth: '1100px', maxHeight: '92vh', overflowY: 'auto', color: 'white',
    display: 'flex', flexDirection: 'column', gap: '1rem', boxSizing: 'border-box',
};
const leadStyle: React.CSSProperties = { margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#9a9aa8', lineHeight: 1.45 };
const closeStyle: React.CSSProperties = {
    width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #444',
    background: 'transparent', color: '#aaa', cursor: 'pointer', fontSize: '1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
const primaryStyle: React.CSSProperties = {
    padding: '0.5rem 1.1rem', borderRadius: '9px', border: 'none', fontWeight: 600,
    background: 'var(--color-accent)', color: 'white', cursor: 'pointer',
};
const smallBtnStyle: React.CSSProperties = {
    padding: '0.3rem 0.7rem', borderRadius: '7px', fontSize: '0.78rem', cursor: 'pointer',
    background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
};
const stepStyle: React.CSSProperties = { ...smallBtnStyle, padding: '0.25rem 0.4rem', fontSize: '0.72rem', minWidth: '2.4rem' };
const numberStyle: React.CSSProperties = {
    width: '5.2rem', padding: '0.3rem 0.4rem', borderRadius: '6px', fontSize: '0.85rem', textAlign: 'right',
    background: '#111', color: 'white', border: '1px solid rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums',
};
const linkStyle: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer', alignSelf: 'flex-start',
    color: 'var(--color-accent)', textDecoration: 'underline', font: 'inherit', fontSize: '0.75rem',
};

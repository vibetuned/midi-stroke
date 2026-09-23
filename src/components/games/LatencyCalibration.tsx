import React, { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useMidiNotes } from '../../hooks/useMidi';
import { heardAt, heardNow, scheduleNow } from '../../games/clock';
import { getLatency, measureLatency, setLatency } from '../../games/latency';

/**
 * Measuring the device's delay: tap along to eight clicks (space, a touch, or
 * any MIDI key) after a bar to settle in. The median gap between click and
 * tap is the delay the games take off before judging (games/latency.ts).
 */

const BPM = 100;
const LEAD = 4;
const COUNTED = 8;

export const LatencyCalibration: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
    const [result, setResult] = useState<number | null>(null);
    const [beatShown, setBeatShown] = useState(-1);
    const run = useRef<{ clicks: number[]; taps: number[]; synth: Tone.Synth; timer: number } | null>(null);

    const finish = () => {
        const r = run.current;
        if (!r) return;
        window.clearInterval(r.timer);
        const m = measureLatency(r.clicks, r.taps);
        if (m) { setResult(m.latency); setPhase('done'); } else setPhase('failed');
    };

    const begin = async () => {
        await Tone.start();
        run.current?.synth.dispose();
        const synth = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 }, volume: -12 }).toDestination();
        const beat = 60 / BPM;
        const t0 = scheduleNow() + 0.4;
        const clicks: number[] = [];
        for (let k = 0; k < LEAD + COUNTED; k++) {
            synth.triggerAttackRelease(k % 4 === 0 ? 'C7' : 'G6', 0.02, t0 + k * beat);
            if (k >= LEAD) clicks.push(t0 + k * beat);
        }
        const timer = window.setInterval(() => {
            const k = Math.floor((heardNow() - t0) / beat);
            setBeatShown(k);
            if (heardNow() > clicks[clicks.length - 1] + beat) finish();
        }, 30);
        run.current = { clicks, taps: [], synth, timer };
        setResult(null);
        setPhase('running');
    };

    const tap = (heard: number) => {
        if (phase !== 'running' || !run.current) return;
        const first = run.current.clicks[0];
        if (heard > first - 0.3) run.current.taps.push(heard);
    };

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key !== ' ' || e.repeat) return;
            e.preventDefault();
            if (phase === 'running') tap(heardAt(e.timeStamp));
            else void begin();
        };
        window.addEventListener('keydown', down);
        return () => window.removeEventListener('keydown', down);
    });
    useMidiNotes({ onNoteOn: hit => tap(heardAt(hit.timestamp)) });
    useEffect(() => () => {
        if (run.current) { window.clearInterval(run.current.timer); run.current.synth.dispose(); }
    }, []);

    const current = getLatency();
    return (
        <div style={backdropStyle} onClick={onClose}>
            <div role="dialog" aria-label="Timing calibration" style={panelStyle} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>⏱ Timing calibration</h2>
                <p style={leadStyle}>
                    Every device takes a moment to play a sound and to notice a key. Tap along to the clicks
                    and the games will take that moment off, so a hit on the beat counts as on the beat.
                </p>
                <div
                    onPointerDown={e => { if (phase === 'running') tap(heardAt(e.timeStamp)); }}
                    style={padStyle(phase === 'running')}
                >
                    {phase === 'running' ? (
                        <>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {Array.from({ length: LEAD + COUNTED }, (_, k) => (
                                    <span key={k} style={{
                                        width: 14, height: 14, borderRadius: '50%',
                                        background: k <= beatShown ? (k < LEAD ? '#666' : 'var(--color-accent)') : 'transparent',
                                        border: `1.5px solid ${k < LEAD ? '#666' : 'var(--color-accent)'}`,
                                    }} />
                                ))}
                            </div>
                            <span>{beatShown < LEAD ? 'Listen…' : 'Tap on every click'}</span>
                        </>
                    ) : phase === 'done' && result !== null ? (
                        <span>Your device's delay: <b>{Math.round(result * 1000)} ms</b></span>
                    ) : phase === 'failed' ? (
                        <span style={{ color: '#f5a3ae' }}>The taps were too uneven to measure. Try once more.</span>
                    ) : (
                        <span>Press <b>space</b> to start, then tap space, the screen, or any MIDI key on each click.</span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <span style={{ flex: 1, fontSize: '0.75rem', color: '#77778a' }}>
                        Now: {Math.round(current * 1000)} ms
                    </span>
                    {phase !== 'running' && <button onClick={() => void begin()} style={ghostStyle}>{phase === 'idle' ? 'Start' : 'Again'}</button>}
                    {phase === 'done' && result !== null && (
                        <button onClick={() => { setLatency(result); onClose(); }} style={primaryStyle}>Use {Math.round(result * 1000)} ms</button>
                    )}
                    {phase !== 'done' && <button onClick={onClose} style={ghostStyle}>Close</button>}
                </div>
            </div>
        </div>
    );
};

const backdropStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 220,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};
const panelStyle: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem',
    width: '100%', maxWidth: '520px', color: 'white', display: 'flex', flexDirection: 'column', gap: '1rem',
};
const leadStyle: React.CSSProperties = { margin: 0, fontSize: '0.85rem', color: '#9a9aa8', lineHeight: 1.45 };
const padStyle = (active: boolean): React.CSSProperties => ({
    minHeight: 120, borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.8rem',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1rem',
    background: active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`, touchAction: 'none', userSelect: 'none',
});
const primaryStyle: React.CSSProperties = {
    padding: '0.5rem 1.1rem', borderRadius: '9px', border: 'none', fontWeight: 600,
    background: 'var(--color-accent)', color: '#06222a', cursor: 'pointer',
};
const ghostStyle: React.CSSProperties = {
    padding: '0.45rem 0.9rem', borderRadius: '9px', cursor: 'pointer',
    background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
};

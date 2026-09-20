import React, { useMemo, useState } from 'react';
import { AuditionButton, PlaybackTargetSelect } from '../PlaybackControl';
import { CircleOfFifths } from '../theory/CircleOfFifths';
import { Stepper } from '../Stepper';
import { chipStyle, labelStyle, previewBoxStyle, selectStyle, startButtonStyle } from '../builderStyles';
import { useVerovio } from '../../hooks/useVerovio';
import {
    HORNS, JAZZ_PATTERNS, JAZZ_RHYTHMS, JAZZ_SCALES,
    buildJazzUrl, defaultJazzSpec, downbeatAligned, generateJazzMei,
    jazzScaleSpelling, resolveJazzSpec,
    type HornId, type JazzPattern, type JazzRange, type JazzScaleId, type JazzSpec,
} from '../../utils/jazzScaleGen';
import type { Rhythm } from '../../utils/meiNotation';

/**
 * Jazz exercise builder for the saxo song selector: pick a key on the circle
 * of fifths (in concert or written pitch), a scale, a pattern and how much of
 * the horn to cover, preview the engraving, and start it like any other piece
 * (via a synthetic sax: URL). See docs/saxo-scales.md.
 */

// Circle-of-fifths major-ring order (see CircleOfFifths) → root strings. Jazz
// picks roots chromatically, so the major ring is used purely as a 12-key dial.
const ROOTS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const midiName = (m: number) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

interface JazzScaleBuilderProps {
    /** Called with the sax: song URL when the user hits Start. */
    onStart: (url: string) => void;
}

export const JazzScaleBuilder: React.FC<JazzScaleBuilderProps> = ({ onStart }) => {
    const { toolkit } = useVerovio();
    const [rootIndex, setRootIndex] = useState(10); // B♭ concert — the blues default
    const [domain, setDomain] = useState<'concert' | 'written'>('concert');
    const [scale, setScale] = useState<JazzScaleId>('bebopdom');
    const [pattern, setPattern] = useState<JazzPattern>('scalar');
    const [range, setRange] = useState<JazzRange>('full');
    const [rhythm, setRhythm] = useState<Rhythm>('eighths');
    const [reps, setReps] = useState(1);
    const [horn, setHorn] = useState<HornId>('alto');
    const [artic, setArtic] = useState(true);
    const [highFs, setHighFs] = useState(false);

    const spec: JazzSpec = useMemo(() => ({
        ...defaultJazzSpec(),
        root: ROOTS[rootIndex], domain, scale, pattern, range, rhythm, reps, horn, artic, highFs,
    }), [rootIndex, domain, scale, pattern, range, rhythm, reps, horn, artic, highFs]);

    const resolved = useMemo(() => resolveJazzSpec(spec), [spec]);
    const spelling = useMemo(() => jazzScaleSpelling(spec), [spec]);
    const aligned = downbeatAligned(resolved.def);

    // Highlight the chosen root on the wheel (music21 style: "C", "E-").
    const highlightKey = useMemo(() => ROOTS[rootIndex].replace('b', '-'), [rootIndex]);

    // One engraving per spec, shared by the preview and the audition.
    const mei = useMemo(() => generateJazzMei(spec), [spec]);

    const preview = useMemo(() => {
        if (!toolkit) return null;
        try {
            toolkit.setOptions({
                breaks: 'none', adjustPageWidth: true, adjustPageHeight: true,
                svgViewBox: true, header: 'none', footer: 'none', scale: 45,
                pageMarginLeft: 15, pageMarginRight: 15, pageMarginTop: 10, pageMarginBottom: 10,
            });
            toolkit.loadData(mei);
            return toolkit.renderToSVG(1, {})
                .replace('<svg ', '<svg style="height:102px;width:auto;" ');
        } catch (e) {
            console.error('Jazz exercise preview render failed:', e);
            return null;
        }
    }, [toolkit, mei]);

    const url = buildJazzUrl(spec);
    const groups = useMemo(() => [...new Set(JAZZ_SCALES.map(s => s.group))], []);
    const patternHint = JAZZ_PATTERNS.find(p => p.value === pattern)?.hint ?? '';
    const lineLow = resolved.line.length ? midiName(resolved.line[0].midi) : '—';
    const lineHigh = resolved.line.length ? midiName(resolved.line[resolved.line.length - 1].midi) : '—';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Fixed-width box so the circle's aspect-ratio sizing cannot
                    feed back into this wrapping, scrollable flex row. */}
                <div style={{ width: '212px', flexShrink: 0 }}>
                    <CircleOfFifths
                        highlightKey={highlightKey}
                        selectableRings={['major']}
                        onKeySelect={(_ring, index) => setRootIndex(index)}
                    />
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', justifyContent: 'center' }}>
                        {(['concert', 'written'] as const).map(d => (
                            <button key={d} onClick={() => setDomain(d)} style={chipStyle(domain === d)}>
                                {d} key
                            </button>
                        ))}
                    </div>

                    {/* What the choices actually produced, in both pitch domains. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem', fontSize: '0.74rem', marginTop: '0.5rem' }}>
                        <Row label="Sounds in" value={`${prettyRoot(resolved.concert)} ${resolved.def.chord}`} />
                        <Row label="You read" value={`${prettyRoot(resolved.written)} ${resolved.def.label}`} />
                        <Row label="Scale" value={spelling.map(d => d.name).join(' ')} />
                        <Row label="Degrees" value={spelling.map(d => d.degree).join(' ')} />
                        <Row label="Chord tones" value={resolved.def.chordTones.map(prettyDegree).join(' ')} />
                        <Row label="On the horn" value={`${lineLow}–${lineHigh} · ${resolved.notes.length} notes`} />
                        {aligned && rhythm === 'eighths' && (
                            <div style={badgeStyle}>♪ chord tones land on the downbeats</div>
                        )}
                    </div>
                </div>

                <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <label style={labelStyle}>
                        Scale
                        <select value={scale} onChange={e => setScale(e.target.value as JazzScaleId)} style={selectStyle}>
                            {groups.map(g => (
                                <optgroup key={g} label={g}>
                                    {JAZZ_SCALES.filter(s => s.group === g).map(s => (
                                        <option key={s.id} value={s.id}>{s.label} — {s.chord}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </label>

                    <label style={labelStyle}>
                        Pattern
                        <select
                            value={pattern}
                            onChange={e => setPattern(e.target.value as JazzPattern)}
                            style={selectStyle}
                            title={patternHint}
                        >
                            {JAZZ_PATTERNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </label>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <label style={{ ...labelStyle, flex: 1, minWidth: 0 }}>
                            Horn
                            <select value={horn} onChange={e => setHorn(e.target.value as HornId)} style={selectStyle}>
                                {HORNS.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
                            </select>
                        </label>
                        <label style={{ ...labelStyle, flex: 1, minWidth: 0 }}>
                            Rhythm
                            <select value={rhythm} onChange={e => setRhythm(e.target.value as Rhythm)} style={selectStyle}>
                                {JAZZ_RHYTHMS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #9a9aa8)' }}>Range</span>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button onClick={() => setRange('full')} style={chipStyle(range === 'full')}>full horn</button>
                                {([1, 2, 3] as const).map(o => (
                                    <button key={o} onClick={() => setRange(o)} style={chipStyle(range === o)}>{o} oct</button>
                                ))}
                            </div>
                        </div>
                        <Stepper label="Repeat" value={reps} min={1} max={4} onChange={setReps} />
                    </div>

                    <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={artic} onChange={e => setArtic(e.target.checked)} />
                        Jazz articulation (slur the offbeat in, accent the leaps)
                    </label>
                    <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={highFs} onChange={e => setHighFs(e.target.checked)} />
                        Use the high F♯ key
                    </label>

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <AuditionButton mei={mei} />
                        <PlaybackTargetSelect compact />
                    </div>

                    <button onClick={() => onStart(url)} style={startButtonStyle} title={url}>
                        ▶ Start — {resolved.def.label} on {spelling[0]?.name} written
                    </button>
                </div>
            </div>

            {/* Engraving preview (Verovio renders black-on-transparent; invert for the dark UI) */}
            <div style={{ ...previewBoxStyle, minHeight: '82px' }}>
                {preview
                    ? <div style={{ filter: 'invert(0.92)' }} dangerouslySetInnerHTML={{ __html: preview }} />
                    : <span style={{ color: 'var(--color-text-secondary, #888)', fontSize: '0.85rem' }}>Loading preview…</span>}
            </div>
        </div>
    );
};

const prettyRoot = (r: { letter: string; alter: number }) =>
    r.letter + (r.alter === 1 ? '♯' : r.alter === -1 ? '♭' : r.alter === 2 ? '𝄪' : r.alter === -2 ? '𝄫' : '');

const prettyDegree = (d: string) =>
    d.replace('bb', '𝄫').replace(/^b/, '♭').replace('##', '𝄪').replace('#', '♯');

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--color-text-secondary, #9a9aa8)', minWidth: '84px', fontSize: '0.72rem' }}>{label}</span>
        <span style={{ color: '#e8e8ef' }}>{value}</span>
    </div>
);

const badgeStyle: React.CSSProperties = {
    alignSelf: 'flex-start', padding: '0.25rem 0.6rem', borderRadius: '12px',
    fontSize: '0.72rem', color: 'var(--color-accent, #d4a017)',
    border: '1px solid var(--color-accent, #d4a017)',
};

import React, { useMemo, useState } from 'react';
import { CircleOfFifths, type Ring } from './theory/CircleOfFifths';
import { prewarmScaleLights } from '../utils/keyLights';
import { useVerovio } from '../hooks/useVerovio';
import {
    SCALE_FORMS, SCALE_RHYTHMS, buildScaleUrl, describeScaleUrl, generateScaleMei,
    type ScaleForm, type ScaleMode, type ScaleRhythm, type ScaleSpec,
} from '../utils/scaleGen';

/**
 * Scale-exercise builder for the song selector: pick a key on the circle of
 * fifths, choose form/rhythm/octaves/repetitions, preview the engraving, and
 * start it like any other piece (via a synthetic scale: URL).
 */

// Wheel labels (see CircleOfFifths) → ScaleSpec tonic strings.
const MAJOR_TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const MINOR_TONICS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'];

interface ScaleBuilderProps {
    /** Called with the scale: song URL when the user hits Start. */
    onStart: (url: string) => void;
}

export const ScaleBuilder: React.FC<ScaleBuilderProps> = ({ onStart }) => {
    const { toolkit } = useVerovio();
    const [key, setKey] = useState<{ ring: Ring; index: number }>({ ring: 'major', index: 0 });
    const [minorVariant, setMinorVariant] = useState<ScaleMode>('harmonic');
    const [form, setForm] = useState<ScaleForm>('parallel');
    const [rhythm, setRhythm] = useState<ScaleRhythm>('eighths');
    const [octaves, setOctaves] = useState(2);
    const [reps, setReps] = useState(1);
    const [fingering, setFingering] = useState(true);

    const isMinor = key.ring === 'minor';
    const maxOctaves = form === 'contrary' ? 3 : 4;
    const noRun = form === 'cadence';

    const spec: ScaleSpec = useMemo(() => ({
        tonic: (isMinor ? MINOR_TONICS : MAJOR_TONICS)[key.index],
        mode: isMinor ? minorVariant : 'major',
        form,
        octaves: Math.min(octaves, maxOctaves),
        reps,
        rhythm,
        fingering,
    }), [key, isMinor, minorVariant, form, octaves, maxOctaves, reps, rhythm, fingering]);

    // Highlight the chosen key on the wheel (music21 style: "C", "a", "E-").
    const highlightKey = useMemo(() => {
        const ascii = spec.tonic.replace('b', '-');
        return isMinor ? ascii.toLowerCase() : ascii;
    }, [spec.tonic, isMinor]);

    const preview = useMemo(() => {
        if (!toolkit) return null;
        try {
            toolkit.setOptions({
                breaks: 'none', adjustPageWidth: true, adjustPageHeight: true,
                svgViewBox: true, header: 'none', footer: 'none', scale: 45,
                pageMarginLeft: 15, pageMarginRight: 15, pageMarginTop: 10, pageMarginBottom: 10,
            });
            toolkit.loadData(generateScaleMei(spec));
            return toolkit.renderToSVG(1, {})
                .replace('<svg ', '<svg style="height:150px;width:auto;" ');
        } catch (e) {
            console.error('Scale preview render failed:', e);
            return null;
        }
    }, [toolkit, spec]);

    const url = buildScaleUrl(spec);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', height: '100%' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Fixed-width box so the circle's aspect-ratio sizing cannot
                    feed back into this wrapping, scrollable flex row. */}
                <div style={{ width: '300px', flexShrink: 0 }}>
                    <CircleOfFifths
                        highlightKey={highlightKey}
                        selectableRings={['major', 'minor']}
                        onKeySelect={(ring, index) => setKey({ ring, index })}
                    />
                </div>

                <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <label style={labelStyle}>
                        Exercise
                        <select value={form} onChange={e => setForm(e.target.value as ScaleForm)} style={selectStyle}>
                            {SCALE_FORMS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                    </label>

                    {isMinor && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {(['natural', 'harmonic', 'melodic'] as const).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setMinorVariant(v)}
                                    style={chipStyle(minorVariant === v)}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    )}

                    <label style={labelStyle}>
                        Rhythm
                        <select
                            value={rhythm}
                            onChange={e => setRhythm(e.target.value as ScaleRhythm)}
                            disabled={noRun}
                            style={{ ...selectStyle, opacity: noRun ? 0.45 : 1 }}
                        >
                            {SCALE_RHYTHMS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </label>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <Stepper
                            label="Octaves" value={Math.min(octaves, maxOctaves)} min={1} max={maxOctaves}
                            onChange={setOctaves} disabled={noRun}
                        />
                        <Stepper label="Repeat" value={reps} min={1} max={4} onChange={setReps} />
                    </div>

                    <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={fingering} onChange={e => setFingering(e.target.checked)} />
                        Show fingering
                    </label>

                    <button
                        // prewarm inside the click: the ROLI scale-paint sysex
                        // permission prompt needs a user gesture in Chrome.
                        onClick={() => { prewarmScaleLights(); onStart(url); }}
                        style={startButtonStyle}
                        title={url}
                    >
                        ▶ Start — {describeScaleUrl(url)}
                    </button>
                </div>
            </div>

            {/* Engraving preview (Verovio renders black-on-transparent; invert for the dark UI) */}
            <div style={previewBoxStyle}>
                {preview
                    ? <div style={{ filter: 'invert(0.92)' }} dangerouslySetInnerHTML={{ __html: preview }} />
                    : <span style={{ color: 'var(--color-text-secondary, #888)', fontSize: '0.85rem' }}>Loading preview…</span>}
            </div>
        </div>
    );
};

const Stepper: React.FC<{
    label: string; value: number; min: number; max: number;
    onChange: (v: number) => void; disabled?: boolean;
}> = ({ label, value, min, max, onChange, disabled }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', opacity: disabled ? 0.45 : 1 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #9a9aa8)' }}>{label}</span>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(v => (
                <button
                    key={v}
                    onClick={() => !disabled && onChange(v)}
                    style={chipStyle(value === v)}
                >
                    {v}
                </button>
            ))}
        </div>
    </div>
);

const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '0.25rem',
    fontSize: '0.75rem', color: 'var(--color-text-secondary, #9a9aa8)',
};

const selectStyle: React.CSSProperties = {
    padding: '0.5rem 1.5rem 0.5rem 0.6rem', borderRadius: '8px',
    backgroundColor: '#22222a', color: 'white',
    border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.9rem',
};

const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.3rem 0.7rem', borderRadius: '14px', fontSize: '0.8rem',
    background: active ? 'var(--color-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-secondary, #cfcfd8)',
    border: `1px solid ${active ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`,
    cursor: 'pointer',
});

const startButtonStyle: React.CSSProperties = {
    marginTop: '0.3rem', padding: '0.7rem 1rem', fontSize: '0.92rem', fontWeight: 600,
    background: 'var(--color-accent)', color: 'white',
    border: 'none', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
};

const previewBoxStyle: React.CSSProperties = {
    overflowX: 'auto', overflowY: 'hidden', flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    padding: '0.4rem 0.6rem', minHeight: '120px',
    display: 'flex', alignItems: 'center',
    background: 'rgba(255,255,255,0.03)',
};

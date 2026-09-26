import React, { useEffect, useMemo, useState } from 'react';
import { AuditionButton, PlaybackTargetSelect } from '../PlaybackControl';
import { CircleOfFifths } from '../theory/CircleOfFifths';
import { chipStyle, labelStyle, previewBoxStyle, selectStyle, startButtonStyle } from '../builderStyles';
import { useVerovio } from '../../hooks/useVerovio';
import { HORNS, type HornId } from '../../utils/jazzScaleGen';
import {
    LICK_RHYTHMS, buildLickUrl, defaultLickSpec, defaultPianoLickSpec, generateLickMei, lickChords, lickKeys, lickNotes, loadLicks,
    type Lick, type LickKeys, type LickLeft, type LickRhythm, type LickSpec,
} from '../../utils/jazzLicks';

/**
 * Jazz lick builder for the saxo and piano song selectors: the Jazzomat
 * Research Project's 653 most common patterns of eminent players, from the
 * Weimar Jazz Database. Pick a lick (filter by kind, shape, length, player),
 * the key — the root of the chord it is played over — and the rhythm: as the
 * players played it, or plain quarters, eighths, triplets or sixteenths; one
 * key or round the circle of fourths. The saxophone's is in written pitch for
 * the horn (the key in concert or written pitch); the piano's at concert
 * pitch on a grand staff, the chords in the left hand as shells or broken in
 * arpeggios. Preview it, and start it like any other piece (via a synthetic
 * lick: URL). See utils/jazzLicks.ts.
 */

// The circle-of-fifths major ring (see CircleOfFifths) as roots.
const ROOTS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

const TYPES: Array<{ value: Lick['type'] | ''; label: string }> = [
    { value: '', label: 'Any kind' }, { value: 'scale', label: 'Scale runs' }, { value: 'mixed', label: 'Leaps and steps' },
    { value: 'chromatic', label: 'Chromatic' }, { value: 'arpeggio', label: 'Arpeggios' },
];
const SHAPES: Array<{ value: Lick['contour'] | ''; label: string }> = [
    { value: '', label: 'Any shape' }, { value: 'descending', label: 'Descending' }, { value: 'ascending', label: 'Ascending' },
    { value: 'arch', label: 'Up and back' }, { value: 'valley', label: 'Down and back' }, { value: 'wave', label: 'Winding' },
];
const LENGTHS: Array<{ value: string; label: string; test: (n: number) => boolean }> = [
    { value: '', label: 'Any length', test: () => true },
    { value: '7', label: '7 notes', test: n => n === 7 },
    { value: '8', label: '8 notes', test: n => n === 8 },
    { value: '9', label: '9–10 notes', test: n => n >= 9 && n <= 10 },
    { value: '11', label: '11 or more', test: n => n >= 11 },
];

export const JazzLickBuilder: React.FC<{ onStart: (url: string) => void; instrument?: 'saxo' | 'piano' }> = ({ onStart, instrument = 'saxo' }) => {
    const piano = instrument === 'piano';
    const { toolkit } = useVerovio();
    const [licks, setLicks] = useState<Lick[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [rank, setRank] = useState(1);
    const [rootIndex, setRootIndex] = useState(0);
    const [domain, setDomain] = useState<'concert' | 'written'>('concert');
    const [horn, setHorn] = useState<HornId>('alto');
    const [rhythm, setRhythm] = useState<LickRhythm>('played');
    const [keys, setKeys] = useState<LickKeys>('one');
    const [chords, setChords] = useState(true);
    const [left, setLeft] = useState<LickLeft>('shells');
    const [type, setType] = useState('');
    const [shape, setShape] = useState('');
    const [length, setLength] = useState('');
    const [player, setPlayer] = useState('');

    useEffect(() => {
        let live = true;
        loadLicks().then(l => { if (live) setLicks(l); }).catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, []);

    const players = useMemo(() => {
        const count = new Map<string, number>();
        for (const l of licks ?? []) for (const [p, n] of l.players) count.set(p, (count.get(p) ?? 0) + n);
        return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
    }, [licks]);

    const shown = useMemo(() => (licks ?? []).filter(l =>
        (!type || l.type === type) && (!shape || l.contour === shape)
        && LENGTHS.find(x => x.value === length)!.test(l.intervals.length + 1)
        && (!player || l.players.some(([p]) => p === player))), [licks, type, shape, length, player]);

    const lick = licks?.find(l => l.rank === rank) ?? null;
    const spec: LickSpec = useMemo(() => (piano
        ? { ...defaultPianoLickSpec(), rank, root: ROOTS[rootIndex], rhythm, keys, chords, left }
        : { ...defaultLickSpec(), rank, root: ROOTS[rootIndex], domain, horn, rhythm, keys, chords }
    ), [piano, rank, rootIndex, domain, horn, rhythm, keys, chords, left]);
    const mei = useMemo(() => (lick ? generateLickMei(spec, lick) : null), [spec, lick]);
    const keyNames = useMemo(() => lickKeys(spec), [spec]);

    const preview = useMemo(() => {
        if (!toolkit || !mei) return null;
        try {
            toolkit.setOptions({
                breaks: 'none', adjustPageWidth: true, adjustPageHeight: true,
                svgViewBox: true, header: 'none', footer: 'none', scale: 45,
                pageMarginLeft: 15, pageMarginRight: 15, pageMarginTop: 10, pageMarginBottom: 10,
            });
            toolkit.loadData(mei);
            return toolkit.renderToSVG(1, {}).replace('<svg ', `<svg style="height:${piano ? 190 : 118}px;width:auto;" `);
        } catch (e) {
            console.error('Jazz lick preview render failed:', e);
            return null;
        }
    }, [toolkit, mei, piano]);

    if (failed) return <div style={{ color: '#f87171' }}>The licks could not be loaded.</div>;
    if (!licks) return <div style={{ color: 'var(--color-text-secondary, #9a9aa8)' }}>Loading the licks…</div>;

    const usual = lick?.harmony ? `${Math.round(lick.harmony.share * 100)} % of the time` : null;
    const writtenFirst = keyNames.written[0];
    const concertFirst = keyNames.concert;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', height: '100%' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: '212px', flexShrink: 0 }}>
                    <CircleOfFifths
                        highlightKey={ROOTS[rootIndex].replace('b', '-')}
                        selectableRings={['major']}
                        onKeySelect={(_ring, index) => setRootIndex(index)}
                    />
                    {!piano && (
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', justifyContent: 'center' }}>
                            {(['concert', 'written'] as const).map(d => (
                                <button key={d} onClick={() => setDomain(d)} style={chipStyle(domain === d)}>{d} key</button>
                            ))}
                        </div>
                    )}
                    {lick && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem', fontSize: '0.74rem', marginTop: '0.5rem' }}>
                            {piano
                                ? <Row label="Over" value={`${lickChords(lick, concertFirst)}${keys === 'circle' ? ', then round the circle' : ''}`} />
                                : <>
                                    <Row label="Sounds over" value={lickChords(lick, concertFirst)} />
                                    <Row label="You read" value={`${lickChords(lick, writtenFirst)}${keys === 'circle' ? ', then round the circle' : ''}`} />
                                </>}
                            {usual && <Row label="Usually" value={usual} />}
                            <Row label="Played" value={`${lick.instances}× in ${lick.solos} solos`} />
                            <Row label="Most by" value={lick.players.map(([p, n]) => `${p} (${n})`).join(', ')} />
                            {lick.first && <Row label="First" value={`${lick.first.player}, ${lick.first.year}`} />}
                        </div>
                    )}
                </div>

                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <select value={type} onChange={e => setType(e.target.value)} style={{ ...selectStyle, flex: '1 1 110px' }} aria-label="Kind">
                            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <select value={shape} onChange={e => setShape(e.target.value)} style={{ ...selectStyle, flex: '1 1 110px' }} aria-label="Shape">
                            {SHAPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <select value={length} onChange={e => setLength(e.target.value)} style={{ ...selectStyle, flex: '1 1 100px' }} aria-label="Length">
                            {LENGTHS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <select value={player} onChange={e => setPlayer(e.target.value)} style={{ ...selectStyle, flex: '1 1 140px' }} aria-label="Player">
                            <option value="">Any player</option>
                            {players.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div style={listStyle} role="listbox" aria-label="Licks">
                        {shown.length === 0 && <div style={{ padding: '0.5rem', color: '#9a9aa8', fontSize: '0.8rem' }}>No lick matches.</div>}
                        {shown.map(l => (
                            <button key={l.rank} role="option" aria-selected={l.rank === rank} onClick={() => setRank(l.rank)} style={rowStyle(l.rank === rank)}>
                                <span style={{ color: '#9a9aa8', width: '2.6rem', flexShrink: 0 }}>#{l.rank}</span>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lickNotes(l)}</span>
                                <span style={{ color: '#9a9aa8', flexShrink: 0 }}>{lickChords(l)}</span>
                                <span style={{ color: '#9a9aa8', width: '3rem', textAlign: 'right', flexShrink: 0 }}>{l.instances}×</span>
                            </button>
                        ))}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #9a9aa8)' }}>
                        {shown.length} of {licks.length} · notes and chords shown over C, concert
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {piano ? (
                            <div style={{ ...labelStyle, flex: 1, minWidth: 0 }}>
                                Left hand
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button onClick={() => setLeft('shells')} style={chipStyle(left === 'shells')} title="Root, third and seventh, held">shells</button>
                                    <button onClick={() => setLeft('arpeggio')} style={chipStyle(left === 'arpeggio')} title="Root, fifth, seventh and tenth, in eighths">arpeggio</button>
                                </div>
                            </div>
                        ) : (
                            <label style={{ ...labelStyle, flex: 1, minWidth: 0 }}>
                                Horn
                                <select value={horn} onChange={e => setHorn(e.target.value as HornId)} style={selectStyle}>
                                    {HORNS.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
                                </select>
                            </label>
                        )}
                        <label style={{ ...labelStyle, flex: 1, minWidth: 0 }}>
                            Rhythm
                            <select value={rhythm} onChange={e => setRhythm(e.target.value as LickRhythm)} style={selectStyle}>
                                {LICK_RHYTHMS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => setKeys('one')} style={chipStyle(keys === 'one')}>one key</button>
                        <button onClick={() => setKeys('circle')} style={chipStyle(keys === 'circle')}>round the circle</button>
                        <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', marginLeft: '0.6rem' }}>
                            <input type="checkbox" checked={chords} onChange={e => setChords(e.target.checked)} />
                            Chord symbols
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <AuditionButton mei={mei} />
                        <PlaybackTargetSelect compact />
                    </div>
                    <button onClick={() => onStart(buildLickUrl(spec))} style={startButtonStyle} disabled={!lick}>
                        ▶ Start — lick #{rank} over {lick ? lickChords(lick, piano ? concertFirst : writtenFirst).split(' → ')[0] : '…'}{piano ? '' : ' written'}
                    </button>
                </div>
            </div>

            <div style={{ ...previewBoxStyle, minHeight: '96px' }}>
                {preview
                    ? <div style={{ filter: 'invert(0.92)' }} dangerouslySetInnerHTML={{ __html: preview }} />
                    : <span style={{ color: 'var(--color-text-secondary, #888)', fontSize: '0.85rem' }}>Loading preview…</span>}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary, #9a9aa8)' }}>
                Patterns: the Jazzomat Research Project's Pattern History Explorer, from the Weimar Jazz Database (ODbL).
            </div>
        </div>
    );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
        <span style={{ color: 'var(--color-text-secondary, #9a9aa8)', minWidth: '84px', fontSize: '0.72rem' }}>{label}</span>
        <span style={{ color: '#e8e8ef' }}>{value}</span>
    </div>
);

const listStyle: React.CSSProperties = {
    maxHeight: '190px', overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '3px',
};
const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.28rem 0.5rem', borderRadius: '6px', cursor: 'pointer',
    fontSize: '0.8rem', textAlign: 'left', color: 'white', border: 'none', width: '100%', minWidth: 0, flexShrink: 0,
    background: active ? 'rgba(212,160,23,0.22)' : 'transparent',
});

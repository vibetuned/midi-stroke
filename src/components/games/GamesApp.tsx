import React, { useEffect, useRef, useState } from 'react';
import { useVerovio } from '../../hooks/useVerovio';
import { loadSongText } from '../../utils/songUrl';
import { ensureCountInMeasure, ensureNoteIds } from '../../utils/mei';
import { OPFS_PREFIX, deleteOpfsSong, isOpfsSupported, listOpfsSongs, saveOpfsSong } from '../../utils/opfs';
import { removeAccompaniment } from '../../utils/accompaniment';
import { extractTimemap } from '../../utils/timemap';
import { LESSONS, SONGS, SONG_LEVEL_BARS, levelFromTimemap, type RhythmLevel } from '../../games/rhythm';
import { summarize, type NoteResult } from '../../games/judge';
import { getBest, recordResult } from '../../games/progress';
import { getLatency, isCalibrated } from '../../games/latency';
import { SlingshotGame } from './SlingshotGame';
import { RhythmResults } from './RhythmResults';
import { LatencyCalibration } from './LatencyCalibration';

/**
 * Games: rhythm, away from the instrument. For anyone — no instrument needed,
 * a key, a tap or a pad will do — and a way in to the rest of the app: the
 * levels teach note values one at a time, then the rhythm of real pieces from
 * the library, and a finished song offers to open that piece on an
 * instrument. The first game is the Slingshot (SlingshotGame.tsx); the others
 * are on the way.
 */

type Screen =
    | { kind: 'home' }
    | { kind: 'levels' }
    | { kind: 'play'; level: RhythmLevel; run: number }
    | { kind: 'results'; level: RhythmLevel; results: NoteResult[] };

const SPEEDS = [{ value: 0.75, label: 'Relaxed' }, { value: 1, label: 'As written' }];

/** Pieces people add: an uploaded collection of the piano library, so they
 *  stay on the device and open in the piano app too. */
const MY_PIECES = { instrument: 'piano' as const, collection: 'My_pieces' };
const MY_PIECES_PATH = `${OPFS_PREFIX}${MY_PIECES.instrument}/${MY_PIECES.collection}`;

type SongEntry = { songKey: string; title: string; instrument: 'piano' | 'saxo' };

/** "Für_Elise-2.mei" → "Für Elise 2" */
const titleOf = (fileName: string) => fileName.replace(/\.mei$/i, '').replace(/[_-]+/g, ' ').trim() || 'My piece';

export const GamesApp: React.FC<{
    onBack: () => void;
    onOpenInstrument: (instrument: 'piano' | 'saxo', songKey: string) => void;
}> = ({ onBack, onOpenInstrument }) => {
    const [screen, setScreen] = useState<Screen>({ kind: 'home' });
    const [speed, setSpeed] = useState(1);
    const [calibrating, setCalibrating] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toolkit } = useVerovio();
    const [, refresh] = useState(0);

    // My pieces: MEI files people bring, kept on the device.
    const [mine, setMine] = useState<SongEntry[]>([]);
    const [mineVersion, setMineVersion] = useState(0);
    const fileRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        let cancelled = false;
        listOpfsSongs(MY_PIECES.instrument).then(files => {
            if (cancelled) return;
            setMine(prev => [
                ...files.filter(f => f.path === MY_PIECES_PATH)
                    .map(f => ({ songKey: `${f.path}/${f.name}`, title: titleOf(f.name), instrument: MY_PIECES.instrument })),
                // Session-only pieces (no OPFS) are kept as they are.
                ...prev.filter(p => p.songKey.startsWith('blob:')),
            ]);
        }).catch(() => { /* no OPFS: session pieces only */ });
        return () => { cancelled = true; };
    }, [mineVersion]);

    const play = (level: RhythmLevel) => setScreen({ kind: 'play', level, run: Date.now() });

    /** A piece as a level: its melody, the opening bars. */
    const levelFor = (song: SongEntry, text: string): RhythmLevel | null => {
        if (!toolkit) return null;
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        if (dom.getElementsByTagName('parsererror').length > 0 || dom.getElementsByTagName('note').length === 0) return null;
        // Exactly as the score views prepare it, so the ids match the notation.
        ensureCountInMeasure(dom);
        ensureNoteIds(dom);
        const mei = new XMLSerializer().serializeToString(dom);
        toolkit.setOptions({ header: 'none', footer: 'none' });
        toolkit.loadData(mei);
        const lv = levelFromTimemap(extractTimemap(toolkit, dom), SONG_LEVEL_BARS);
        if (lv.notes.length < 2) return null;
        return {
            id: `song:${song.songKey}`,
            title: song.title,
            detail: `${lv.bars} bars of its melody`,
            bpm: Math.round(lv.bpm),
            beatsPerBar: lv.beatsPerBar,
            meter: { count: lv.beatsPerBar, unit: 4 },
            notes: lv.notes,
            length: lv.length,
            // The count-in the viewers add is measure 1, so the level's bars start at 2.
            source: { kind: 'song', songKey: song.songKey, instrument: song.instrument, mei, measureRange: `2-${lv.bars + 1}` },
        };
    };

    const openSong = async (song: SongEntry) => {
        if (!toolkit) return;
        setLoading(song.songKey);
        setError(null);
        try {
            const level = levelFor(song, await loadSongText(song.songKey));
            if (level) play(level);
            else setError(`${song.title} has no melody the game can use.`);
        } catch (e) {
            console.error(e);
            setError(`${song.title} could not be opened.`);
        } finally {
            setLoading(null);
        }
    };

    /** A file someone brings: checked, kept, and played. */
    const addPiece = async (file: File | undefined) => {
        if (!file || !toolkit) return;
        setError(null);
        const text = await file.text();
        const title = titleOf(file.name);
        if (!levelFor({ songKey: 'check', title, instrument: MY_PIECES.instrument }, text)) {
            setError(`${file.name} has no melody the game can use — it needs an MEI score with notes.`);
            return;
        }
        let songKey: string;
        if (isOpfsSupported()) {
            songKey = await saveOpfsSong(MY_PIECES.instrument, MY_PIECES.collection, file.name, text);
            setMineVersion(v => v + 1);
        } else {
            songKey = URL.createObjectURL(file);
            setMine(m => [...m, { songKey, title, instrument: MY_PIECES.instrument }]);
        }
        const level = levelFor({ songKey, title, instrument: MY_PIECES.instrument }, text);
        if (level) play(level);
    };

    const removePiece = async (song: SongEntry) => {
        if (!window.confirm(`Remove "${song.title}" from your pieces?`)) return;
        if (song.songKey.startsWith(OPFS_PREFIX)) await deleteOpfsSong(song.songKey);
        await removeAccompaniment(song.songKey);
        setMine(m => m.filter(x => x.songKey !== song.songKey));
    };

    const finish = (level: RhythmLevel, results: NoteResult[]) => {
        const s = summarize(results);
        recordResult(`${level.id}@${speed}`, { accuracy: s.accuracy, stars: s.stars });
        setScreen({ kind: 'results', level, results });
    };

    const nextOf = (level: RhythmLevel): RhythmLevel | null => {
        const i = LESSONS.findIndex(l => l.id === level.id);
        return i >= 0 && i + 1 < LESSONS.length ? LESSONS[i + 1] : null;
    };

    return (
        <div className="app-container theme-games" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <header style={headerStyle}>
                <button onClick={screen.kind === 'home' ? onBack : () => setScreen({ kind: screen.kind === 'levels' ? 'home' : 'levels' })} style={backStyle}>
                    ← {screen.kind === 'home' ? 'Back' : screen.kind === 'levels' ? 'Games' : 'Levels'}
                </button>
                <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Midi Stroke — Games</h1>
                <span style={{ flex: 1 }} />
                <button onClick={() => setCalibrating(true)} style={chipStyle(!isCalibrated())} title="Measure your device's delay, so timing is judged fairly">
                    ⏱ {isCalibrated() ? `Timing · ${Math.round(getLatency() * 1000)} ms` : 'Calibrate timing'}
                </button>
            </header>

            {screen.kind === 'home' && (
                <main style={{ flex: 1, overflowY: 'auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ textAlign: 'center', maxWidth: 640 }}>
                        <h2 style={{ fontSize: '2.4rem', margin: 0, background: 'linear-gradient(135deg, #78ffd6, #22d3ee)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                            Feel the rhythm
                        </h2>
                        <p style={{ color: '#b0b0bc', fontSize: '1.05rem', lineHeight: 1.55 }}>
                            Short games about timing — no instrument needed. A key, a tap or a drum pad will do.
                            Every level is real rhythm, and the songs are real pieces you can go on to play.
                        </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem', width: '100%', maxWidth: 1040 }}>
                        <GameCard icon="🪐" title="Slingshot" detail="Hold to orbit, let go to fling. How long you hold is the note." onPlay={() => setScreen({ kind: 'levels' })} />
                        <GameCard icon="⏳" title="Keep the pulse" detail="The click goes quiet for a bar. Keep going — then see how far you drifted." />
                        <GameCard icon="🔁" title="Rhythm echo" detail="Hear a rhythm, tap it back. One more note each time." />
                        <GameCard icon="⚙️" title="Clockwork" detail="Build a running machine, a beat at a time." />
                    </div>
                </main>
            )}

            {screen.kind === 'levels' && (
                <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <h2 style={{ margin: 0 }}>🪐 Slingshot</h2>
                            <span style={{ color: '#9a9aa8' }}>Hold while a note sounds, let go when it ends.</span>
                            <span style={{ flex: 1 }} />
                            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 3 }}>
                                {SPEEDS.map(sp => (
                                    <button key={sp.value} onClick={() => setSpeed(sp.value)} style={toggleStyle(speed === sp.value)}>{sp.label}</button>
                                ))}
                            </div>
                        </div>
                        {!isCalibrated() && (
                            <div style={bannerStyle}>
                                For fair timing, measure your device's delay once — it takes ten seconds.
                                <button onClick={() => setCalibrating(true)} style={{ ...toggleStyle(true), marginLeft: '0.8rem' }}>Calibrate</button>
                            </div>
                        )}
                        {error && <div style={{ color: '#f87171' }}>{error}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.2rem' }}>
                            <section>
                                <h3 style={sectionStyle}>Lessons — one idea each</h3>
                                {LESSONS.map((l, i) => (
                                    <LevelRow key={l.id} n={i + 1} title={l.title} detail={l.detail} best={getBest(`${l.id}@${speed}`)?.stars ?? null} onPlay={() => play(l)} />
                                ))}
                            </section>
                            <section>
                                <h3 style={sectionStyle}>Songs — the rhythm of real pieces</h3>
                                {SONGS.map((s, i) => (
                                    <LevelRow
                                        key={s.songKey}
                                        n={i + 1}
                                        title={s.title}
                                        detail={loading === s.songKey ? 'Opening…' : 'Its melody, from the saxophone library'}
                                        best={getBest(`song:${s.songKey}@${speed}`)?.stars ?? null}
                                        onPlay={() => void openSong(s)}
                                        disabled={!toolkit || loading !== null}
                                    />
                                ))}
                                <h3 style={{ ...sectionStyle, marginTop: '1.2rem' }}>My pieces — bring your own</h3>
                                {mine.map((s, i) => (
                                    <LevelRow
                                        key={s.songKey}
                                        n={i + 1}
                                        title={s.title}
                                        detail={loading === s.songKey ? 'Opening…' : s.songKey.startsWith('blob:') ? 'This session only' : 'Kept on this device · also in the piano app'}
                                        best={getBest(`song:${s.songKey}@${speed}`)?.stars ?? null}
                                        onPlay={() => void openSong(s)}
                                        onDelete={() => void removePiece(s)}
                                        disabled={!toolkit || loading !== null}
                                    />
                                ))}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".mei"
                                    style={{ display: 'none' }}
                                    onChange={e => { void addPiece(e.target.files?.[0]); e.target.value = ''; }}
                                />
                                <button onClick={() => fileRef.current?.click()} disabled={!toolkit} style={addStyle}>
                                    📁 Add a piece (.mei)
                                    <span style={{ fontSize: '0.78rem', color: '#9a9aa8', fontWeight: 400 }}>
                                        Any score: its top line becomes the level
                                    </span>
                                </button>
                            </section>
                        </div>
                    </div>
                </main>
            )}

            {screen.kind === 'play' && (
                <SlingshotGame
                    key={screen.run}
                    level={screen.level}
                    tempoScale={speed}
                    onFinish={results => finish(screen.level, results)}
                    onQuit={() => setScreen({ kind: 'levels' })}
                />
            )}

            {screen.kind === 'results' && (
                <RhythmResults
                    level={screen.level}
                    results={screen.results}
                    onRetry={() => play(screen.level)}
                    onNext={nextOf(screen.level) ? () => play(nextOf(screen.level)!) : null}
                    onBack={() => setScreen({ kind: 'levels' })}
                    onOpenInstrument={onOpenInstrument}
                />
            )}

            {calibrating && <LatencyCalibration onClose={() => { setCalibrating(false); refresh(n => n + 1); }} />}
        </div>
    );
};

const GameCard: React.FC<{ icon: string; title: string; detail: string; onPlay?: () => void }> = ({ icon, title, detail, onPlay }) => (
    <button onClick={onPlay} disabled={!onPlay} style={cardStyle(!!onPlay)}>
        <span style={{ fontSize: '3rem' }}>{icon}</span>
        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{title}</span>
        <span style={{ color: '#b0b0bc', lineHeight: 1.45, fontSize: '0.9rem' }}>{detail}</span>
        <span style={{ marginTop: 'auto', fontWeight: 700, color: onPlay ? 'var(--color-accent)' : '#6b6b78' }}>{onPlay ? 'Play →' : 'Coming soon'}</span>
    </button>
);

const LevelRow: React.FC<{
    n: number; title: string; detail: string; best: number | null; onPlay: () => void; disabled?: boolean; onDelete?: () => void;
}> = ({ n, title, detail, best, onPlay, disabled, onDelete }) => (
    <button onClick={onPlay} disabled={disabled} style={rowStyle(!!disabled)}>
        <span style={{ width: '1.8rem', color: '#77778a', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem', textAlign: 'left' }}>
            <span style={{ fontWeight: 600 }}>{title}</span>
            <span style={{ fontSize: '0.8rem', color: '#9a9aa8' }}>{detail}</span>
        </span>
        <span style={{ letterSpacing: '0.1em', color: '#facc15' }} aria-label={best === null ? 'not played' : `${best} stars`}>
            {best === null ? '' : <>{'★'.repeat(best)}<span style={{ opacity: 0.25 }}>{'★'.repeat(3 - best)}</span></>}
        </span>
        {onDelete && (
            // role=button (not a nested <button>) so it can live inside the row button
            <span
                role="button"
                tabIndex={-1}
                title="Remove this piece"
                aria-label={`Remove ${title}`}
                onClick={e => { e.stopPropagation(); onDelete(); }}
                style={{ padding: '0.1rem 0.45rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', color: '#9a9aa8' }}
            >
                ✕
            </span>
        )}
    </button>
);

const headerStyle: React.CSSProperties = {
    padding: '1rem', borderBottom: '1px solid var(--color-bg-secondary)', display: 'flex', alignItems: 'center', gap: '1rem',
    background: 'var(--color-bg-primary)',
};
const backStyle: React.CSSProperties = {
    padding: '0.4rem 0.8rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white',
    borderRadius: 4, cursor: 'pointer', fontSize: '0.9rem',
};
const chipStyle = (attention: boolean): React.CSSProperties => ({
    padding: '0.35rem 0.8rem', borderRadius: 999, cursor: 'pointer', fontSize: '0.82rem',
    background: attention ? 'color-mix(in srgb, var(--color-accent) 20%, transparent)' : 'transparent',
    color: 'white', border: `1px solid ${attention ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`,
});
const cardStyle = (live: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-start', textAlign: 'left',
    padding: '1.4rem', minHeight: 230, borderRadius: 16, cursor: live ? 'pointer' : 'default', color: 'white',
    background: live ? 'color-mix(in srgb, var(--color-accent) 10%, rgba(255,255,255,0.03))' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${live ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`, opacity: live ? 1 : 0.7,
});
const rowStyle = (disabled: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', marginBottom: '0.45rem',
    padding: '0.75rem 0.9rem', borderRadius: 10, cursor: disabled ? 'default' : 'pointer', color: 'white',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', opacity: disabled ? 0.6 : 1,
});
const addStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start', width: '100%',
    padding: '0.75rem 0.9rem', borderRadius: 10, cursor: 'pointer', color: 'white', fontWeight: 600,
    background: 'transparent', border: '1px dashed color-mix(in srgb, var(--color-accent) 60%, transparent)',
};
const sectionStyle: React.CSSProperties = { margin: '0 0 0.7rem', fontSize: '0.8rem', color: '#9a9aa8', textTransform: 'uppercase', letterSpacing: '0.06em' };
const toggleStyle = (on: boolean): React.CSSProperties => ({
    background: on ? 'var(--color-accent)' : 'transparent', color: on ? '#06222a' : 'var(--color-text-secondary, #cfcfd8)',
    border: 'none', borderRadius: 13, padding: '0.35rem 0.8rem', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600,
});
const bannerStyle: React.CSSProperties = {
    padding: '0.7rem 1rem', borderRadius: 10, fontSize: '0.88rem', color: '#d6d6e0',
    background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
};

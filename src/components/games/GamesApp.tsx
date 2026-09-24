import React, { useEffect, useRef, useState } from 'react';
import { useVerovio } from '../../hooks/useVerovio';
import { loadSongText } from '../../utils/songUrl';
import { ensureCountInMeasure, ensureNoteIds } from '../../utils/mei';
import { OPFS_PREFIX, deleteOpfsSong, isOpfsSupported, listOpfsSongs, saveOpfsSong } from '../../utils/opfs';
import { removeAccompaniment } from '../../utils/accompaniment';
import { extractTimemap, type TimemapData } from '../../utils/timemap';
import { LESSONS, SONGS, SONG_LEVEL_BARS, levelFromTimemap, type RhythmLevel } from '../../games/rhythm';
import { CHOIR_LESSONS, CHOIR_SONGS, summarizeConductor } from '../../games/choir';
import { CANON_LESSONS, canonFromTimemap, canonsFrom, summarizeEcho, type EchoLevel } from '../../games/echo';
import { GROOVES, grooveFromTimemap, summarizeGroove, type GrooveLevel, type Take } from '../../games/groove';
import { summarize, type NoteResult } from '../../games/judge';
import { getBest, recordResult } from '../../games/progress';
import { getLatency, isCalibrated } from '../../games/latency';
import { SlingshotGame } from './SlingshotGame';
import { ConductorGame } from './ConductorGame';
import { EchoGame } from './EchoGame';
import { GrooveGame } from './GrooveGame';
import { RhythmResults } from './RhythmResults';
import { ConductorResults } from './ConductorResults';
import { EchoResults } from './EchoResults';
import { GrooveResults } from './GrooveResults';
import { LatencyCalibration } from './LatencyCalibration';

/**
 * Games: rhythm, away from the instrument. For anyone — no instrument needed,
 * a key, a tap or a pad will do — and a way in to the rest of the app: the
 * levels teach one idea at a time, then the rhythm of real pieces from the
 * library, and a finished piece offers to open it on an instrument.
 *
 * - The Slingshot: how long a note lasts (SlingshotGame.tsx).
 * - The Conductor: conduct a choir a beat at a time, a singer per pitch (ConductorGame.tsx).
 * - Rhythm echo: relay a canon — the star's line to your satellite, your voice down to Earth (EchoGame.tsx).
 * - Groove Builder: a drum groove built one part at a time, like a looper (GrooveGame.tsx).
 */

type Game = 'slingshot' | 'conductor' | 'echo' | 'groove';
type Instrument = 'piano' | 'saxo' | 'drums';

type Screen =
    | { kind: 'home' }
    | { kind: 'levels' }
    /** The Slingshot or the Conductor: a line of notes, held. */
    | { kind: 'play'; level: RhythmLevel; run: number }
    | { kind: 'results'; level: RhythmLevel; results: NoteResult[] }
    /** The Conductor's results are a beat each. */
    | { kind: 'conductor-results'; level: RhythmLevel; results: NoteResult[] }
    | { kind: 'echo'; level: EchoLevel; run: number }
    /** `played` is the level at the tempo it was played at (Relaxed scales it). */
    | { kind: 'echo-results'; level: EchoLevel; played: EchoLevel; results: NoteResult[] }
    | { kind: 'groove'; level: GrooveLevel; run: number }
    | { kind: 'groove-results'; level: GrooveLevel; played: GrooveLevel; takes: Take[] };

const GAMES: Record<Game, { icon: string; title: string; card: string; how: string; lessons: string; songs: string; songDetail: string }> = {
    slingshot: {
        icon: '🪐', title: 'Slingshot', card: 'Hold to orbit, let go to fling. How long you hold is the note.',
        how: 'Hold while a note sounds, let go when it ends.', lessons: 'Lessons — one idea each',
        songs: 'Songs — the rhythm of real pieces', songDetail: 'Its melody, from the saxophone library',
    },
    conductor: {
        icon: '🎼', title: 'Conductor', card: 'A singer for every note of the tune, and you conduct them a beat at a time. Hold too long and they run out of breath; let go early and they stop.',
        how: 'Hold for one beat, let go as the ring closes.', lessons: 'Lessons — the choir learns a tune',
        songs: 'Folk songs — the choir sings, the piano plays along', songDetail: 'The tune for the choir, its left hand on the piano',
    },
    echo: {
        icon: '📡', title: 'Rhythm echo', card: 'A star sings a canon and you are its second voice: catch each note at your satellite and hold it, to send it on to Earth.',
        how: 'Hold each note as it reaches the satellite; let go as it ends.', lessons: 'Lessons — canons, one idea each',
        songs: '', songDetail: '',
    },
    groove: {
        icon: '🥁', title: 'Groove Builder', card: 'Kick, snare, hi-hat: build a groove one part at a time, like a looper. What you play is what it keeps.',
        how: 'Play each part once round the wheel; it keeps playing as you played it.', lessons: 'Grooves — from the drum library',
        songs: '', songDetail: '',
    },
};
/** Best results are kept per game, level and speed. */
const PREFIX: Record<Game, string> = { slingshot: '', conductor: 'choir:', echo: 'echo:', groove: 'groove:' };

const SPEEDS = [{ value: 0.75, label: 'Relaxed' }, { value: 1, label: 'As written' }];

/** Pieces people add: an uploaded collection of the piano library, so they
 *  stay on the device and open in the piano app too. */
const MY_PIECES = { instrument: 'piano' as const, collection: 'My_pieces' };
const MY_PIECES_PATH = `${OPFS_PREFIX}${MY_PIECES.instrument}/${MY_PIECES.collection}`;

type SongEntry = { songKey: string; title: string; instrument: 'piano' | 'saxo' };
type GrooveEntry = typeof GROOVES[number];

/** "Für_Elise-2.mei" → "Für Elise 2" */
const titleOf = (fileName: string) => fileName.replace(/\.mei$/i, '').replace(/[_-]+/g, ' ').trim() || 'My piece';

/** A score's metre, in quarter-note beats a bar, and its pulse (a dotted quarter in 6/8, 12/8). */
function meterOf(dom: Document): { beatsPerBar: number; pulse: number } {
    const sig = dom.getElementsByTagName('meterSig').item(0);
    const def = dom.getElementsByTagName('scoreDef').item(0);
    const count = parseInt(sig?.getAttribute('count') ?? def?.getAttribute('meter.count') ?? '4', 10) || 4;
    const unit = parseInt(sig?.getAttribute('unit') ?? def?.getAttribute('meter.unit') ?? '4', 10) || 4;
    return { beatsPerBar: count * 4 / unit, pulse: unit === 8 && count % 3 === 0 ? 1.5 : 1 };
}

interface Prepared { mei: string; dom: Document; timemap: TimemapData }

export const GamesApp: React.FC<{
    onBack: () => void;
    onOpenInstrument: (instrument: Instrument, songKey: string) => void;
}> = ({ onBack, onOpenInstrument }) => {
    const [screen, setScreen] = useState<Screen>({ kind: 'home' });
    const [game, setGame] = useState<Game>('slingshot');
    const [speed, setSpeed] = useState(1);
    const bestKey = (id: string) => `${PREFIX[game]}${id}@${speed}`;
    const [calibrating, setCalibrating] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const openGame = (g: Game) => { setGame(g); setError(null); setScreen({ kind: 'levels' }); };
    const { toolkit } = useVerovio();
    const [, refresh] = useState(0);

    // The library's canons, as listed in the piano catalog: add a file there and it is a level.
    const [canons, setCanons] = useState<SongEntry[]>([]);
    useEffect(() => {
        let cancelled = false;
        fetch(`${import.meta.env.BASE_URL}piano_files.json`)
            .then(r => (r.ok ? r.json() : []))
            .then((list: Array<{ path: string; name: string }>) => { if (!cancelled) setCanons(canonsFrom(list)); })
            .catch(() => { /* no catalog: no canons */ });
        return () => { cancelled = true; };
    }, []);

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
    const playEcho = (level: EchoLevel) => setScreen({ kind: 'echo', level, run: Date.now() });
    const playGroove = (level: GrooveLevel) => setScreen({ kind: 'groove', level, run: Date.now() });

    /** A score, prepared exactly as the score views prepare it, so its ids match their notation. */
    const prepare = (text: string): Prepared | null => {
        if (!toolkit) return null;
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        if (dom.getElementsByTagName('parsererror').length > 0 || dom.getElementsByTagName('note').length === 0) return null;
        ensureCountInMeasure(dom);
        ensureNoteIds(dom);
        const mei = new XMLSerializer().serializeToString(dom);
        toolkit.setOptions({ header: 'none', footer: 'none' });
        toolkit.loadData(mei);
        return { mei, dom, timemap: extractTimemap(toolkit, dom) };
    };

    /** A piece as a line of notes: its melody, the opening bars, the rest of it as the backing. */
    const rhythmLevelFor = (song: SongEntry, { mei, timemap }: Prepared): RhythmLevel | null => {
        const lv = levelFromTimemap(timemap, SONG_LEVEL_BARS);
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
            backing: lv.backing,
            // The count-in the viewers add is measure 1, so the level's bars start at 2.
            source: { kind: 'song', songKey: song.songKey, instrument: song.instrument, mei, measureRange: `2-${lv.bars + 1}` },
        };
    };

    /** A piece for Rhythm echo: its two voices, if they make a canon. */
    const echoLevelFor = (song: SongEntry, { mei, timemap }: Prepared): EchoLevel | null => {
        const canon = canonFromTimemap(timemap);
        if (!canon || (canon.imitation ?? 0) < 0.6) return null;
        return {
            id: `song:${song.songKey}`, title: song.title,
            detail: `A canon at ${canon.distance === 1 ? 'one bar' : `${canon.distance} bars`}: you are the second voice`,
            ...canon, bpm: Math.round(canon.bpm),
            notation: { mei, measureRange: `2-${canon.bars + 1}`, bars: canon.bars },
            songKey: song.songKey, instrument: song.instrument,
        };
    };

    /** Start the current game on a piece; false when the piece has nothing it can use. */
    const launch = (song: SongEntry, text: string): boolean => {
        const prepared = prepare(text);
        if (!prepared) return false;
        if (game === 'echo') {
            const level = echoLevelFor(song, prepared);
            if (level) playEcho(level);
            return !!level;
        }
        const level = rhythmLevelFor(song, prepared);
        if (level) play(level);
        return !!level;
    };

    const openSong = async (song: SongEntry) => {
        if (!toolkit) return;
        setLoading(song.songKey);
        setError(null);
        try {
            if (!launch(song, await loadSongText(song.songKey))) {
                setError(game === 'echo' ? `${song.title} is not a canon — Rhythm echo needs two voices, one following the other.` : `${song.title} has no melody the game can use.`);
            }
        } catch (e) {
            console.error(e);
            setError(`${song.title} could not be opened.`);
        } finally {
            setLoading(null);
        }
    };

    const openGroove = async (entry: GrooveEntry) => {
        if (!toolkit) return;
        setLoading(entry.songKey);
        setError(null);
        try {
            const prepared = prepare(await loadSongText(entry.songKey));
            const { beatsPerBar, pulse } = prepared ? meterOf(prepared.dom) : { beatsPerBar: 4, pulse: 1 };
            const groove = prepared && grooveFromTimemap(prepared.timemap, beatsPerBar, pulse);
            if (!groove) { setError(`${entry.title} has no drum parts the game can use.`); return; }
            playGroove({ id: entry.songKey, title: entry.title, detail: entry.detail, bpm: entry.bpm, pulse, songKey: entry.songKey, ...groove });
        } catch (e) {
            console.error(e);
            setError(`${entry.title} could not be opened.`);
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
        const check = prepare(text);
        const probe = { songKey: 'check', title, instrument: MY_PIECES.instrument };
        if (!check || !(game === 'echo' ? echoLevelFor(probe, check) : rhythmLevelFor(probe, check))) {
            setError(game === 'echo'
                ? `${file.name} is not a canon — Rhythm echo needs two voices, the second following the first.`
                : `${file.name} has no melody the game can use — it needs an MEI score with notes.`);
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
        launch({ songKey, title, instrument: MY_PIECES.instrument }, text);
    };

    const removePiece = async (song: SongEntry) => {
        if (!window.confirm(`Remove "${song.title}" from your pieces?`)) return;
        if (song.songKey.startsWith(OPFS_PREFIX)) await deleteOpfsSong(song.songKey);
        await removeAccompaniment(song.songKey);
        setMine(m => m.filter(x => x.songKey !== song.songKey));
    };

    // ------------------------------------------------ finishing, and what comes next
    const lessonsOf = (g: Game): RhythmLevel[] => (g === 'conductor' ? CHOIR_LESSONS : LESSONS);
    const finish = (level: RhythmLevel, results: NoteResult[]) => {
        const s = game === 'conductor' ? summarizeConductor(results) : summarize(results);
        recordResult(bestKey(level.id), { accuracy: s.accuracy, stars: s.stars });
        setScreen({ kind: game === 'conductor' ? 'conductor-results' : 'results', level, results });
    };
    const nextOf = (level: RhythmLevel): RhythmLevel | null => {
        const list = lessonsOf(game);
        const i = list.findIndex(l => l.id === level.id);
        return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
    };
    const nextEcho = (level: EchoLevel): EchoLevel | null => {
        const i = CANON_LESSONS.findIndex(l => l.id === level.id);
        return i >= 0 && i + 1 < CANON_LESSONS.length ? CANON_LESSONS[i + 1] : null;
    };
    const finishEcho = (level: EchoLevel, results: NoteResult[]) => {
        const s = summarizeEcho(results);
        recordResult(bestKey(level.id), { accuracy: s.accuracy, stars: s.stars });
        setScreen({ kind: 'echo-results', level, played: { ...level, bpm: level.bpm * speed }, results });
    };
    const nextGroove = (level: GrooveLevel): GrooveEntry | null => {
        const i = GROOVES.findIndex(g => g.songKey === level.songKey);
        return i >= 0 && i + 1 < GROOVES.length ? GROOVES[i + 1] : null;
    };
    const finishGroove = (level: GrooveLevel, takes: Take[]) => {
        const s = summarizeGroove(level, takes);
        recordResult(bestKey(level.id), { accuracy: s.accuracy, stars: s.stars });
        setScreen({ kind: 'groove-results', level, played: { ...level, bpm: level.bpm * speed }, takes });
    };

    const info = GAMES[game];
    const songList: SongEntry[] = game === 'conductor' ? CHOIR_SONGS : SONGS;
    const busy = !toolkit || loading !== null;
    const toLevels = () => setScreen({ kind: 'levels' });

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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem', width: '100%', maxWidth: 1100 }}>
                        {(['slingshot', 'conductor', 'echo', 'groove'] as Game[]).map(g => (
                            <GameCard key={g} icon={GAMES[g].icon} title={GAMES[g].title} detail={GAMES[g].card} onPlay={() => openGame(g)} />
                        ))}
                    </div>
                </main>
            )}

            {screen.kind === 'levels' && (
                <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                            <h2 style={{ margin: 0 }}>{info.icon} {info.title}</h2>
                            <span style={{ color: '#9a9aa8' }}>{info.how}</span>
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
                        {game === 'groove' ? (
                            <section>
                                <h3 style={sectionStyle}>{info.lessons}</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', columnGap: '1.2rem' }}>
                                    {GROOVES.map((g, i) => (
                                        <LevelRow
                                            key={g.songKey} n={i + 1} title={g.title}
                                            detail={loading === g.songKey ? 'Opening…' : g.detail}
                                            best={getBest(bestKey(g.songKey))?.stars ?? null}
                                            onPlay={() => void openGroove(g)} disabled={busy}
                                        />
                                    ))}
                                </div>
                            </section>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.2rem' }}>
                                <section>
                                    <h3 style={sectionStyle}>{info.lessons}</h3>
                                    {game === 'echo'
                                        ? CANON_LESSONS.map((l, i) => (
                                            <LevelRow key={l.id} n={i + 1} title={l.title} detail={l.detail} best={getBest(bestKey(l.id))?.stars ?? null} onPlay={() => playEcho(l)} />
                                        ))
                                        : lessonsOf(game).map((l, i) => (
                                            <LevelRow key={l.id} n={i + 1} title={l.title} detail={l.detail} best={getBest(bestKey(l.id))?.stars ?? null} onPlay={() => play(l)} />
                                        ))}
                                </section>
                                <section>
                                    {game === 'echo' ? (
                                        <>
                                            <h3 style={sectionStyle}>Canons — Kunz, Op. 14</h3>
                                            {canons.map((s, i) => (
                                                <LevelRow
                                                    key={s.songKey} n={i + 1} title={s.title}
                                                    detail={loading === s.songKey ? 'Opening…' : 'Two voices: the star leads, you follow'}
                                                    best={getBest(bestKey(`song:${s.songKey}`))?.stars ?? null}
                                                    onPlay={() => void openSong(s)} disabled={busy}
                                                />
                                            ))}
                                        </>
                                    ) : (
                                        <>
                                            <h3 style={sectionStyle}>{info.songs}</h3>
                                            {songList.map((s, i) => (
                                                <LevelRow
                                                    key={s.songKey} n={i + 1} title={s.title}
                                                    detail={loading === s.songKey ? 'Opening…' : info.songDetail}
                                                    best={getBest(bestKey(`song:${s.songKey}`))?.stars ?? null}
                                                    onPlay={() => void openSong(s)} disabled={busy}
                                                />
                                            ))}
                                        </>
                                    )}
                                    <h3 style={{ ...sectionStyle, marginTop: '1.2rem' }}>My pieces — bring your own</h3>
                                    {mine.map((s, i) => (
                                        <LevelRow
                                            key={s.songKey} n={i + 1} title={s.title}
                                            detail={loading === s.songKey ? 'Opening…' : s.songKey.startsWith('blob:') ? 'This session only' : 'Kept on this device · also in the piano app'}
                                            best={getBest(bestKey(`song:${s.songKey}`))?.stars ?? null}
                                            onPlay={() => void openSong(s)} onDelete={() => void removePiece(s)} disabled={busy}
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
                                            {game === 'echo' ? 'A two-voice canon: the voice that follows is yours' : 'Any score: its top line becomes the level'}
                                        </span>
                                    </button>
                                </section>
                            </div>
                        )}
                    </div>
                </main>
            )}

            {screen.kind === 'play' && (game === 'conductor'
                ? <ConductorGame key={screen.run} level={screen.level} tempoScale={speed} onFinish={results => finish(screen.level, results)} onQuit={toLevels} />
                : <SlingshotGame key={screen.run} level={screen.level} tempoScale={speed} onFinish={results => finish(screen.level, results)} onQuit={toLevels} />
            )}

            {screen.kind === 'results' && (
                <RhythmResults
                    level={screen.level}
                    results={screen.results}
                    onRetry={() => play(screen.level)}
                    onNext={nextOf(screen.level) ? () => play(nextOf(screen.level)!) : null}
                    onBack={toLevels}
                    onOpenInstrument={onOpenInstrument}
                />
            )}

            {screen.kind === 'conductor-results' && (
                <ConductorResults
                    level={screen.level}
                    results={screen.results}
                    beatSec={60 / (screen.level.bpm * speed)}
                    onRetry={() => play(screen.level)}
                    onNext={nextOf(screen.level) ? () => play(nextOf(screen.level)!) : null}
                    onBack={toLevels}
                    onOpenInstrument={onOpenInstrument}
                />
            )}

            {screen.kind === 'echo' && (
                <EchoGame
                    key={screen.run}
                    level={screen.level}
                    tempoScale={speed}
                    onFinish={results => finishEcho(screen.level, results)}
                    onQuit={toLevels}
                />
            )}

            {screen.kind === 'echo-results' && (
                <EchoResults
                    level={screen.played}
                    results={screen.results}
                    onRetry={() => playEcho(screen.level)}
                    onNext={nextEcho(screen.level) ? () => playEcho(nextEcho(screen.level)!) : null}
                    onBack={toLevels}
                    onOpenInstrument={onOpenInstrument}
                />
            )}

            {screen.kind === 'groove' && (
                <GrooveGame
                    key={screen.run}
                    level={screen.level}
                    tempoScale={speed}
                    onFinish={takes => finishGroove(screen.level, takes)}
                    onQuit={toLevels}
                />
            )}

            {screen.kind === 'groove-results' && (
                <GrooveResults
                    level={screen.played}
                    takes={screen.takes}
                    onRetry={() => playGroove(screen.level)}
                    onNext={nextGroove(screen.level) ? () => void openGroove(nextGroove(screen.level)!) : null}
                    onBack={toLevels}
                    onOpenDrums={songKey => onOpenInstrument('drums', songKey)}
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

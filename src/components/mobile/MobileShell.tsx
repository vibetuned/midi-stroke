import React, { useEffect, useState } from 'react';
import * as Tone from 'tone';
import { useGame } from '../../context/game';
import { useMidi } from '../../hooks/useMidi';
import { describeScaleUrl } from '../../utils/scaleGen';
import { describeJazzUrl } from '../../utils/jazzScaleGen';
import { describeLickUrl } from '../../utils/jazzLicks';
import { describeDrumUrl } from '../../utils/drumPatternGen';
import { describeGrooveUrl } from '../../utils/grooveMidi';
import './MobileShell.css';

/**
 * The instrument apps on a phone, held sideways: one thing on the screen at a
 * time — the score, or the virtual instrument — and the rest tucked away.
 *
 *  ┌──────────── ▾ Song ────────────┐  the top notch: the app's header (back,
 *  │ 🎼 🎹                       ●  │  the song, its stats) slides down from it
 *  │                                │
 *  │      the score, or the         │  the toggle (top left) picks which;
 *  │      instrument, filling       │  both stay loaded, so switching is
 *  │      the screen                │  instant and the score keeps its place
 *  │                                │
 *  └──────────── ▴  ▶ ──────────────┘  the bottom notch: the play controls
 *                                       slide up from it; ▶ plays and pauses
 *
 * The desktop layout does not use this: see hooks/useMobileLayout.ts.
 */
export interface MobileShellProps {
    /** The app's header, as the desktop shows it: it goes in the top drawer. */
    header: React.ReactNode;
    score: React.ReactNode;
    instrument: React.ReactNode;
    /** The play controls: the bottom drawer. */
    controls: React.ReactNode;
    /** Always on screen, above the bottom notch, when it renders anything: the By ear panel, whose "your turn" cannot wait in a drawer. */
    dock?: React.ReactNode;
    /** What the instrument view is called on its toggle: "Keys", "Grid", "Fingering". */
    instrumentLabel: string;
    instrumentIcon: string;
    /** Remembers the chosen view per app. */
    storageKey: string;
}

type View = 'score' | 'instrument';

function loadView(key: string): View {
    try { return globalThis.localStorage?.getItem(key) === 'instrument' ? 'instrument' : 'score'; } catch { return 'score'; }
}

export const MobileShell: React.FC<MobileShellProps> = ({ header, score, instrument, controls, dock, instrumentLabel, instrumentIcon, storageKey }) => {
    const [view, setView] = useState<View>(() => loadView(storageKey));
    const [open, setOpen] = useState<'top' | 'bottom' | null>(null);
    const { selectedSong } = useGame();

    useEffect(() => {
        try { globalThis.localStorage?.setItem(storageKey, view); } catch { /* private mode */ }
    }, [storageKey, view]);
    // A new song closes the drawers: the picker has just been used.
    const [songShown, setSongShown] = useState(selectedSong);
    if (songShown !== selectedSong) { setSongShown(selectedSong); setOpen(null); }

    const toggle = (which: 'top' | 'bottom') => setOpen(o => (o === which ? null : which));

    return (
        <div className={`mobile-shell${open ? ` mobile-open-${open}` : ''}`}>
            <div className="mobile-band mobile-band-top">
                <div className="mobile-views" role="tablist" aria-label="Show">
                    <button role="tab" aria-selected={view === 'score'} className={view === 'score' ? 'on' : ''} onClick={() => setView('score')} title="The score">
                        🎼 <span>Score</span>
                    </button>
                    <button role="tab" aria-selected={view === 'instrument'} className={view === 'instrument' ? 'on' : ''} onClick={() => setView('instrument')} title={instrumentLabel}>
                        {instrumentIcon} <span>{instrumentLabel}</span>
                    </button>
                </div>
                <button className="mobile-notch" onClick={() => toggle('top')} aria-expanded={open === 'top'} aria-label="Song and menu">
                    <span className="mobile-chevron">{open === 'top' ? '▴' : '▾'}</span>
                    <span className="mobile-notch-label">{songTitle(selectedSong)}</span>
                </button>
                <MidiDot />
            </div>

            <div className="mobile-stage">
                <div className="mobile-layer" style={{ visibility: view === 'score' ? 'visible' : 'hidden', zIndex: view === 'score' ? 1 : 0 }}>{score}</div>
                <div className="mobile-layer" style={{ visibility: view === 'instrument' ? 'visible' : 'hidden', zIndex: view === 'instrument' ? 1 : 0 }}>{instrument}</div>
            </div>

            {dock && <div className="mobile-dock">{dock}</div>}

            <div className="mobile-band mobile-band-bottom">
                <button className="mobile-notch" onClick={() => toggle('bottom')} aria-expanded={open === 'bottom'} aria-label="Play controls">
                    <span className="mobile-chevron">{open === 'bottom' ? '▾' : '▴'}</span>
                    <span className="mobile-notch-label">Controls</span>
                </button>
                <MiniPlay />
            </div>

            {open && <div className="mobile-scrim" onClick={() => setOpen(null)} />}
            <div className="mobile-drawer mobile-drawer-top" aria-hidden={open !== 'top'}>
                {header}
                <button className="mobile-drawer-handle" onClick={() => setOpen(null)} aria-label="Close">▴</button>
            </div>
            <div className="mobile-drawer mobile-drawer-bottom" aria-hidden={open !== 'bottom'}>
                <button className="mobile-drawer-handle" onClick={() => setOpen(null)} aria-label="Close">▾</button>
                {controls}
            </div>
        </div>
    );
};

/** The song's name for the notch: a generated exercise's description, or the file's name without its folder and extension. */
function songTitle(song: string | null): string {
    if (!song) return 'Choose a song';
    const generated = describeScaleUrl(song) ?? describeJazzUrl(song) ?? describeLickUrl(song) ?? describeDrumUrl(song) ?? describeGrooveUrl(song);
    if (generated) return generated;
    let name = song.split('/').pop() ?? song;
    try { name = decodeURIComponent(name); } catch { /* keep it */ }
    return name.replace(/\.mei$/i, '').replace(/_/g, ' ');
}

/** Play and pause, without opening the controls — as the desktop's space bar does. */
const MiniPlay: React.FC = () => {
    const { isPlaying, setIsPlaying, gameMode } = useGame();
    if (gameMode === 'ear') return null;   // by ear, the session drives the page
    const toggle = async () => {
        const next = !isPlaying;
        setIsPlaying(next);
        if (!next) { Tone.getTransport().pause(); return; }
        try {
            await Tone.start();
            Tone.getTransport().start();
        } catch {
            setIsPlaying(false);
        }
    };
    return (
        <button className="mobile-play" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '⏸' : '▶'}
        </button>
    );
};

/** Whether a MIDI instrument is there: a dot, and how many. */
const MidiDot: React.FC = () => {
    const { isMidiActive, deviceNames } = useMidi();
    const n = deviceNames.length;
    return (
        <div className={`mobile-midi${isMidiActive && n ? ' on' : ''}`} title={isMidiActive ? `MIDI: ${n} device${n === 1 ? '' : 's'}` : 'MIDI unavailable'}>
            <span className="dot" /> {isMidiActive ? `MIDI ${n}` : 'no MIDI'}
        </div>
    );
};

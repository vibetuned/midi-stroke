import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as Tone from 'tone';
import type { VerovioToolkit } from 'verovio/esm';
import { StartOverlay } from '../StartOverlay';
import { MidiStatus } from '../MidiStatus';
import { VirtualPiano } from '../piano/VirtualPiano';
import { CircleOfFifths } from './CircleOfFifths';
import { TheoryScoreView } from './TheoryScoreView';
import { CourseNavigator } from './CourseNavigator';
import { VideoSplash } from './VideoSplash';
import { useTheoryExercise } from './useTheoryExercise';
import { useAudio } from '../../hooks/useAudio';
import { useVerovio } from '../../hooks/useVerovio';
import { useMidi } from '../../hooks/useMidi';
import {
    fetchCoursesManifest, loadProgress, saveProgress, videoProgressKey,
    type Course, type CourseModule, type CourseExercise, type CoursesManifest, type TheoryProgress,
} from '../../utils/course';

interface TheoryAppProps {
    onBack: () => void;
}

interface Selection {
    course: Course;
    module: CourseModule;
    exercise: CourseExercise;
}

/**
 * Theory mode: train with each module's lesson videos, practice by filling
 * in the worksheet exercises — notes entered from the virtual piano, the
 * circle of fifths, or a MIDI keyboard.
 */
export const TheoryApp: React.FC<TheoryAppProps> = ({ onBack }) => {
    const { sampler } = useAudio();
    const { toolkit } = useVerovio();

    const [manifest, setManifest] = useState<CoursesManifest | null>(null);
    const [manifestError, setManifestError] = useState<string | null>(null);
    const [progress, setProgress] = useState<TheoryProgress>(() => loadProgress());
    const [selection, setSelection] = useState<Selection | null>(null);
    const [navigatorOpen, setNavigatorOpen] = useState(true);
    const [video, setVideo] = useState<{ course: Course; module: CourseModule; index: number } | null>(null);

    useEffect(() => {
        fetchCoursesManifest()
            .then(setManifest)
            .catch(err => setManifestError(String(err?.message ?? err)));
    }, []);

    // Flattened order of the selected exercise's course, for prev/next navigation
    const selectedCourse = selection?.course ?? null;
    const flatExercises = useMemo(
        () => selectedCourse
            ? selectedCourse.modules.flatMap(m => m.exercises.map(e => ({ course: selectedCourse, module: m, exercise: e })))
            : [],
        [selectedCourse],
    );
    const currentIndex = selection
        ? flatExercises.findIndex(p => p.exercise.id === selection.exercise.id)
        : -1;
    const step = (delta: number) => {
        const next = flatExercises[currentIndex + delta];
        if (next) setSelection(next);
    };

    const handleCompleted = useCallback((exerciseId: string) => {
        setProgress(prev => {
            if (prev.exercises[exerciseId]) return prev;
            const next = { ...prev, exercises: { ...prev.exercises, [exerciseId]: { completedAt: Date.now() } } };
            saveProgress(next);
            return next;
        });
    }, []);

    const handleWatched = useCallback((course: Course, module: CourseModule, videoItem: { file: string; title: string }) => {
        const key = videoProgressKey(course, module, videoItem);
        setProgress(prev => {
            if (prev.videos[key]) return prev;
            const next = { ...prev, videos: { ...prev.videos, [key]: { watchedAt: Date.now() } } };
            saveProgress(next);
            return next;
        });
    }, []);

    const watchedKeys = useMemo(() => new Set(Object.keys(progress.videos)), [progress.videos]);
    const overlaysOpen = navigatorOpen || video !== null || !selection;

    return (
        // #root is a 100vh flex column but .app-container has no CSS rule of its
        // own — fill the viewport here so the score area gets real height.
        <div className="app-container theme-theory" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <StartOverlay />

            {manifest && manifest.courses.length > 0 && (navigatorOpen || !selection) && (
                <CourseNavigator
                    courses={manifest.courses}
                    initialCourseId={selection?.course.id}
                    progress={progress}
                    currentExerciseId={selection?.exercise.id ?? null}
                    dismissible={!!selection}
                    onClose={() => setNavigatorOpen(false)}
                    onSelectExercise={(course, module, exercise) => {
                        setSelection({ course, module, exercise });
                        setNavigatorOpen(false);
                    }}
                    onPlayVideo={(course, module, index) => setVideo({ course, module, index })}
                />
            )}

            {video && (
                <VideoSplash
                    course={video.course}
                    module={video.module}
                    initialIndex={video.index}
                    watchedKeys={watchedKeys}
                    onWatched={v => handleWatched(video.course, video.module, v)}
                    onClose={() => setVideo(null)}
                />
            )}

            <header style={{
                padding: '1rem',
                borderBottom: '1px solid var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-bg-primary)',
                gap: '1rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                    <button
                        onClick={onBack}
                        style={headerButtonStyle}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        ← Back
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', whiteSpace: 'nowrap' }}>Midi Stroke</h1>
                    {selection && (
                        <span style={{
                            color: 'var(--color-text-secondary, #9a9aa8)', fontSize: '0.85rem',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {selection.course.title} · {selection.module.number}. {selection.module.title}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {selection && (
                        <>
                            <button onClick={() => step(-1)} disabled={currentIndex <= 0}
                                style={{ ...headerButtonStyle, opacity: currentIndex <= 0 ? 0.35 : 1 }} title="Previous exercise">◀</button>
                            <button onClick={() => step(1)} disabled={currentIndex >= flatExercises.length - 1}
                                style={{ ...headerButtonStyle, opacity: currentIndex >= flatExercises.length - 1 ? 0.35 : 1 }} title="Next exercise">▶</button>
                        </>
                    )}
                    <button
                        onClick={() => setNavigatorOpen(true)}
                        style={{ ...headerButtonStyle, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                    >
                        🎼 Course
                    </button>
                </div>
            </header>

            <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <MidiStatus />
                {manifestError && (
                    <div style={{ margin: 'auto', color: '#e0505e' }}>
                        Could not load the course catalog: {manifestError}
                    </div>
                )}
                {!manifestError && !manifest && (
                    <div style={{ margin: 'auto', color: 'var(--color-text-secondary, #9a9aa8)' }}>
                        Loading courses…
                    </div>
                )}
                {selection && (
                    <ExercisePanel
                        key={`${selection.course.id}:${selection.exercise.id}`}
                        course={selection.course}
                        module={selection.module}
                        exercise={selection.exercise}
                        toolkit={toolkit}
                        sampler={sampler}
                        inputEnabled={!overlaysOpen}
                        onCompleted={handleCompleted}
                    />
                )}
            </main>
        </div>
    );
};

// ---------------------------------------------------------------------------

interface ExercisePanelProps {
    course: Course;
    module: CourseModule;
    exercise: CourseExercise;
    toolkit: VerovioToolkit | null;
    sampler: Tone.Sampler | Tone.PolySynth | null;
    inputEnabled: boolean;
    onCompleted: (exerciseId: string) => void;
}

const ExercisePanel: React.FC<ExercisePanelProps> = ({
    course, module, exercise, toolkit, sampler, inputEnabled, onCompleted,
}) => {
    const ex = useTheoryExercise(toolkit, course, module, exercise, onCompleted);
    const { noteInput, getPlaybackEvents } = ex;
    const { lastNote } = useMidi();
    const lastHandledRef = useRef<number | null>(null);

    // MIDI keyboard input (sound already handled by useAudio in TheoryApp)
    useEffect(() => {
        if (!lastNote || !inputEnabled) return;
        if (lastHandledRef.current === lastNote.timestamp) return;
        lastHandledRef.current = lastNote.timestamp;
        noteInput(lastNote.note);
    }, [lastNote, inputEnabled, noteInput]);

    const playNote = useCallback((midi: number) => {
        if (!sampler) return;
        try {
            sampler.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), '8n', Tone.now(), 0.8);
        } catch { /* sampler still loading */ }
    }, [sampler]);

    // Clicked input (virtual piano / circle of fifths): sound + entry
    const handleInstrumentInput = useCallback((midi: number) => {
        playNote(midi);
        noteInput(midi);
    }, [playNote, noteInput]);

    // Plays either the student's current state or the model answer (the
    // ear-training clue). Chords are scheduled at their real onsets so both
    // staves sound together.
    const handleListen = useCallback((source: 'current' | 'answer') => {
        if (!sampler) return;
        const SECONDS_PER_QUARTER = 0.55;
        const start = Tone.now() + 0.05;
        getPlaybackEvents(source).forEach(chord => {
            const duration = Math.max(0.3, chord.duration * SECONDS_PER_QUARTER * 0.95);
            chord.midis.forEach(midi => {
                try {
                    sampler.triggerAttackRelease(
                        Tone.Frequency(midi, 'midi').toFrequency(), duration,
                        start + chord.time * SECONDS_PER_QUARTER, 0.8);
                } catch { /* ignore scheduling errors */ }
            });
        });
    }, [sampler, getPlaybackEvents]);

    const correctCount = ex.statuses
        ? [...ex.statuses.values()].filter(s => s === 'correct').length
        : null;

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <TheoryScoreView
                exercise={exercise}
                svg={ex.svg}
                loading={ex.loading}
                error={ex.error}
                parsed={ex.parsed}
                selectedSlot={ex.selectedSlot}
                revealed={ex.revealed}
                filledSlots={ex.filledSlots}
                totalSlots={ex.totalSlots}
                correctCount={correctCount}
                onSelectMeasure={ex.selectMeasure}
            />

            {/* Controls */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem', flexWrap: 'wrap',
                borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>
                <button onClick={ex.check} disabled={ex.revealed}
                    style={{ ...controlButtonStyle, borderColor: 'var(--color-accent)', color: 'var(--color-accent)', opacity: ex.revealed ? 0.4 : 1 }}>
                    ✓ Check
                </button>
                <button onClick={ex.toggleReveal} style={controlButtonStyle}>
                    {ex.revealed ? '✎ Back to my answer' : '👁 Show answer'}
                </button>
                <button onClick={ex.clearMeasure} disabled={ex.revealed} style={{ ...controlButtonStyle, opacity: ex.revealed ? 0.4 : 1 }}
                    title="Clear the selected measure (or the last written one if it is empty)">
                    ⌫ Clear measure
                </button>
                <button onClick={ex.clearAll} disabled={ex.revealed} style={{ ...controlButtonStyle, opacity: ex.revealed ? 0.4 : 1 }}>
                    ↺ Reset
                </button>
                <button onClick={() => handleListen('current')} style={controlButtonStyle}
                    title="Play what you have written so far">
                    ▶ Listen
                </button>
                <button onClick={() => handleListen('answer')} style={controlButtonStyle}
                    title="Play the model answer — the ear-training clue">
                    👂 Hear answer
                </button>

                <span style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>
                    {ex.completed && (
                        <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>🎉 All correct — exercise complete!</span>
                    )}
                    {!ex.completed && correctCount !== null && (
                        <span style={{ color: '#e0505e' }}>
                            {ex.totalSlots - correctCount} to fix — keep going
                        </span>
                    )}
                </span>
            </div>

            {/* Input instruments: circle of fifths (1/4) + virtual piano (3/4) */}
            <div style={{
                display: 'flex', alignItems: 'stretch', width: '100%',
                background: '#1a1a1a', borderTop: '1px solid #444',
                boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6)',
            }}>
                <div style={{
                    width: '25%', minWidth: '240px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '10px 6px',
                }}>
                    <CircleOfFifths toolkit={toolkit} highlightKey={exercise.key} onNoteInput={handleInstrumentInput} />
                </div>
                <div style={{ width: '75%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <VirtualPiano onNoteClick={handleInstrumentInput} highlightNotes={ex.highlightNotes} />
                </div>
            </div>
        </div>
    );
};

const headerButtonStyle: React.CSSProperties = {
    padding: '0.4rem 0.8rem',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
};

const controlButtonStyle: React.CSSProperties = {
    padding: '0.35rem 0.75rem',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
};


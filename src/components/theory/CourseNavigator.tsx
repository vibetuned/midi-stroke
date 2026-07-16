import React, { useEffect, useState } from 'react';
import {
    type Course, type CourseModule, type CourseExercise, type TheoryProgress, videoProgressKey,
} from '../../utils/course';

interface CourseNavigatorProps {
    courses: Course[];
    /** Course to open on; defaults to the first one. */
    initialCourseId?: string;
    progress: TheoryProgress;
    currentExerciseId: string | null;
    /** When false (nothing selected yet) the overlay can't be dismissed. */
    dismissible: boolean;
    onClose: () => void;
    onSelectExercise: (course: Course, module: CourseModule, exercise: CourseExercise) => void;
    onPlayVideo: (course: Course, module: CourseModule, index: number) => void;
}

/** "triad-spelling-c-s2-n8" -> "set 2" — distinguishes same-titled variants. */
function variantLabel(id: string): string | null {
    const m = id.match(/-s(\d+)-n\d+$/);
    return m ? `set ${m[1]}` : null;
}

/**
 * Course overlay: modules on the left, the selected module's lesson videos
 * and exercises on the right. Mirrors the SongSelector flow — it opens on
 * entry until something is picked, then reopens from the header.
 */
export const CourseNavigator: React.FC<CourseNavigatorProps> = ({
    courses, initialCourseId, progress, currentExerciseId, dismissible, onClose, onSelectExercise, onPlayVideo,
}) => {
    const [courseId, setCourseId] = useState<string>(initialCourseId ?? courses[0]?.id ?? '');
    const course = courses.find(c => c.id === courseId) ?? courses[0];
    const currentModule = course?.modules.find(m => m.exercises.some(e => e.id === currentExerciseId));
    const [moduleId, setModuleId] = useState<string>(currentModule?.id ?? course?.modules[0]?.id ?? '');
    const module = course?.modules.find(m => m.id === moduleId) ?? course?.modules[0];

    const switchCourse = (c: Course) => {
        setCourseId(c.id);
        const current = c.modules.find(m => m.exercises.some(e => e.id === currentExerciseId));
        setModuleId(current?.id ?? c.modules[0]?.id ?? '');
    };

    useEffect(() => {
        if (!dismissible) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dismissible, onClose]);

    const doneCount = (m: CourseModule) => m.exercises.filter(e => progress.exercises[e.id]).length;
    const totalDone = course?.modules.reduce((s, m) => s + doneCount(m), 0) ?? 0;
    const totalEx = course?.modules.reduce((s, m) => s + m.exercises.length, 0) ?? 0;

    if (!course) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 900,
            background: 'rgba(8, 8, 12, 0.88)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                width: 'min(1100px, 94vw)', height: 'min(700px, 88vh)',
                background: 'var(--color-bg-primary, #16161c)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
            }}>
                {/* Panel header: course picker + progress */}
                <div style={{
                    padding: '0.9rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                }}>
                    <span style={{ fontSize: '1.15rem' }}>🎼</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {courses.map(c => {
                            const isActive = c.id === course.id;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => switchCourse(c)}
                                    style={{
                                        padding: '0.35rem 0.9rem',
                                        borderRadius: '18px',
                                        border: `1px solid ${isActive ? 'var(--color-accent)' : 'rgba(255,255,255,0.25)'}`,
                                        background: isActive ? 'var(--color-accent)' : 'transparent',
                                        color: isActive ? '#fff' : '#ccc',
                                        cursor: 'pointer',
                                        fontSize: '0.95rem',
                                        fontWeight: isActive ? 700 : 400,
                                    }}
                                >
                                    {c.title}
                                </button>
                            );
                        })}
                    </div>
                    <span style={{ color: 'var(--color-text-secondary, #9a9aa8)', fontSize: '0.85rem' }}>
                        {totalDone}/{totalEx} exercises completed
                    </span>
                    {dismissible && (
                        <button onClick={onClose} title="Close (Esc)" style={closeButtonStyle}>✕</button>
                    )}
                </div>

                <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                    {/* Module list */}
                    <div style={{
                        width: '320px', flexShrink: 0, overflowY: 'auto',
                        borderRight: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem',
                    }}>
                        {course.modules.map(m => {
                            const isActive = m.id === module?.id;
                            const done = doneCount(m);
                            return (
                                <button
                                    key={m.id}
                                    onClick={() => setModuleId(m.id)}
                                    style={{
                                        display: 'block', width: '100%', textAlign: 'left',
                                        padding: '0.55rem 0.7rem', marginBottom: '2px',
                                        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                                        border: 'none', borderLeft: `3px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
                                        borderRadius: '6px', color: 'white', cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ fontSize: '0.9rem', fontWeight: isActive ? 600 : 400 }}>
                                        {String(m.number).padStart(2, '0')} · {m.title}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary, #9a9aa8)', marginTop: '2px' }}>
                                        🎬 {m.videos.length} · ✍️ {done}/{m.exercises.length}
                                        {m.exercises.length > 0 && done === m.exercises.length && ' ✓'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Module detail */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
                        {module && (
                            <>
                                <h3 style={sectionTitleStyle}>🎬 Watch — {module.title}</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                    {module.videos.length === 0 && <Empty>No videos in this module.</Empty>}
                                    {module.videos.map((v, i) => {
                                        const watched = !!progress.videos[videoProgressKey(course, module, v)];
                                        return (
                                            <button
                                                key={v.file}
                                                onClick={() => onPlayVideo(course, module, i)}
                                                style={{
                                                    padding: '0.45rem 0.85rem', borderRadius: '18px',
                                                    border: `1px solid ${watched ? 'var(--color-accent)' : 'rgba(255,255,255,0.25)'}`,
                                                    background: 'transparent', cursor: 'pointer', fontSize: '0.82rem',
                                                    color: watched ? 'var(--color-accent)' : '#ddd',
                                                }}
                                            >
                                                {watched ? '✓' : '▶'} {v.title}
                                            </button>
                                        );
                                    })}
                                </div>

                                <h3 style={sectionTitleStyle}>✍️ Practice</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {module.exercises.length === 0 && <Empty>No exercises in this module.</Empty>}
                                    {module.exercises.map(e => {
                                        const done = !!progress.exercises[e.id];
                                        const isCurrent = e.id === currentExerciseId;
                                        const variant = variantLabel(e.id);
                                        return (
                                            <button
                                                key={e.id}
                                                onClick={() => onSelectExercise(course, module, e)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                    padding: '0.5rem 0.75rem', textAlign: 'left',
                                                    background: isCurrent ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${isCurrent ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}`,
                                                    borderRadius: '8px', color: 'white', cursor: 'pointer',
                                                }}
                                            >
                                                <span style={{
                                                    width: '1.2rem', textAlign: 'center', flexShrink: 0,
                                                    color: done ? 'var(--color-accent)' : 'var(--color-text-secondary, #666)',
                                                }}>
                                                    {done ? '✓' : '○'}
                                                </span>
                                                <span style={{ fontSize: '0.88rem', flex: 1 }}>{e.title}</span>
                                                {variant && <span style={miniChipStyle}>{variant}</span>}
                                                <span style={miniChipStyle}>{e.slots} to fill</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const sectionTitleStyle: React.CSSProperties = {
    margin: '0 0 0.6rem',
    fontSize: '0.85rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary, #9a9aa8)',
};

const miniChipStyle: React.CSSProperties = {
    fontSize: '0.68rem',
    fontFamily: 'monospace',
    padding: '1px 7px',
    borderRadius: '9px',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'var(--color-text-secondary, #9a9aa8)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
};

const closeButtonStyle: React.CSSProperties = {
    marginLeft: 'auto',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'transparent',
    color: 'white',
    cursor: 'pointer',
};

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span style={{ color: 'var(--color-text-secondary, #666)', fontSize: '0.85rem' }}>{children}</span>
);

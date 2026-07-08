import React, { useEffect, useState } from 'react';
import { type Course, type CourseModule, type CourseVideo, moduleFileUrl, videoProgressKey } from '../../utils/course';

interface VideoSplashProps {
    course: Course;
    module: CourseModule;
    initialIndex: number;
    watchedKeys: Set<string>;
    onWatched: (video: CourseVideo) => void;
    onClose: () => void;
}

/**
 * Splash-style fullscreen player for a module's lesson videos, with a
 * playlist so the whole module can be watched in sequence. Videos auto-mark
 * as watched when they end and auto-advance to the next one.
 */
export const VideoSplash: React.FC<VideoSplashProps> = ({
    course, module, initialIndex, watchedKeys, onWatched, onClose,
}) => {
    const [index, setIndex] = useState(initialIndex);
    const video = module.videos[index];

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight' && index < module.videos.length - 1) setIndex(index + 1);
            if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, index, module.videos.length]);

    if (!video) return null;

    const handleEnded = () => {
        onWatched(video);
        if (index < module.videos.length - 1) setIndex(index + 1);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(8, 8, 12, 0.94)', backdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', padding: '1.25rem 2rem',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.75rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{video.title}</h2>
                <span style={{ color: 'var(--color-text-secondary, #9a9aa8)', fontSize: '0.85rem' }}>
                    {module.number}. {module.title} · video {index + 1}/{module.videos.length}
                </span>
                <button onClick={onClose} title="Close (Esc)" style={{ ...navButtonStyle, marginLeft: 'auto' }}>✕</button>
            </div>

            {/* Player with prev/next */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                    onClick={() => setIndex(i => Math.max(0, i - 1))}
                    disabled={index === 0}
                    style={{ ...navButtonStyle, opacity: index === 0 ? 0.3 : 1 }}
                    title="Previous video"
                >◀</button>
                <video
                    key={video.file}
                    src={moduleFileUrl(course, module, video.file)}
                    controls
                    autoPlay
                    onEnded={handleEnded}
                    style={{
                        flex: 1, minWidth: 0, maxHeight: '100%', borderRadius: '10px',
                        background: '#000', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                    }}
                />
                <button
                    onClick={() => setIndex(i => Math.min(module.videos.length - 1, i + 1))}
                    disabled={index === module.videos.length - 1}
                    style={{ ...navButtonStyle, opacity: index === module.videos.length - 1 ? 0.3 : 1 }}
                    title="Next video"
                >▶</button>
            </div>

            {/* Playlist */}
            <div style={{
                display: 'flex', gap: '0.5rem', marginTop: '0.9rem',
                overflowX: 'auto', paddingBottom: '0.25rem',
            }}>
                {module.videos.map((v, i) => {
                    const isWatched = watchedKeys.has(videoProgressKey(course, module, v));
                    const isCurrent = i === index;
                    return (
                        <button
                            key={v.file}
                            onClick={() => setIndex(i)}
                            style={{
                                padding: '0.4rem 0.8rem',
                                borderRadius: '18px',
                                border: `1px solid ${isCurrent ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`,
                                background: isCurrent ? 'var(--color-accent)' : 'transparent',
                                color: isCurrent ? '#fff' : isWatched ? 'var(--color-accent)' : '#ccc',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {isWatched ? '✓ ' : '▶ '}{v.title}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const navButtonStyle: React.CSSProperties = {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'transparent',
    color: 'white',
    cursor: 'pointer',
    fontSize: '0.9rem',
    flexShrink: 0,
};

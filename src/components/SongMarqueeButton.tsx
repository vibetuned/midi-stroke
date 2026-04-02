import React, { useRef, useEffect, useState } from 'react';

interface SongMarqueeButtonProps {
    songName: string;
    onClick: () => void;
}

export const SongMarqueeButton: React.FC<SongMarqueeButtonProps> = ({ songName, onClick }) => {
    const spanRef = useRef<HTMLSpanElement>(null);
    const [offset, setOffset] = useState<number>(0);

    const label = `${songName}   ·   `;
    const duration = Math.max(4, songName.length * 0.18);

    // Measure the exact pixel width of one copy after render/font load
    useEffect(() => {
        if (spanRef.current) {
            setOffset(spanRef.current.getBoundingClientRect().width);
        }
    }, [songName]);

    return (
        <button
            onClick={onClick}
            title="Change song"
            style={{
                width: '128px',
                height: '32px',
                padding: 0,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                cursor: 'pointer',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
            }}
        >
            {/* fade edges */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to right, rgba(18,18,20,0.8) 0%, transparent 18%, transparent 82%, rgba(18,18,20,0.8) 100%)',
                zIndex: 1,
                pointerEvents: 'none',
                borderRadius: '5px',
            }} />
            <div
                style={{
                    display: 'flex',
                    whiteSpace: 'nowrap',
                    // Only start animating once we have the measured offset
                    animation: offset > 0 ? `marquee ${duration}s linear infinite` : undefined,
                    // Pixel-exact loop distance avoids sub-pixel rounding at seam
                    ['--marquee-offset' as string]: `-${offset}px`,
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    color: '#ccc',
                    paddingLeft: '0.5rem',
                    willChange: 'transform',
                }}
            >
                <span ref={spanRef}>{label}</span>
                <span aria-hidden>{label}</span>
            </div>
        </button>
    );
};

import React, { useEffect, useState, useRef } from 'react';
import * as Tone from 'tone';
import { useVerovio } from '../hooks/useVerovio';
import { useGame } from '../context/GameContext';

export const ScoreView: React.FC = () => {
    const { toolkit } = useVerovio();
    const { isPlaying, setIsPlaying, setPlayPosition } = useGame(); // Added useGame hook
    const [svg, setSvg] = useState<string>('');
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef<boolean>(false); // Added isDragging ref

    // Stop playback on user interaction start
    const handleInteractionStart = () => {
        isDragging.current = true;
        if (isPlaying) {
            setIsPlaying(false);
            Tone.getTransport().pause();
        }
    };

    const handleInteractionEnd = () => {
        isDragging.current = false;
        // Optional: Resume playback? Usually user wants to stay paused after scrub.
    };

    const handleScroll = () => {
        if (isDragging.current && containerRef.current) {
            const scrollLeft = containerRef.current.scrollLeft;
            const pixelsPerBeat = 60;
            const beat = scrollLeft / pixelsPerBeat;
            const ticks = beat * 192;

            // Sync Transport to Scroll
            const transport = Tone.getTransport();
            const time = transport.toSeconds(ticks + "i"); // 'i' for ticks

            transport.seconds = time;
            setPlayPosition(time);
        }
    };

    // Scroll Animation Logic
    useEffect(() => {
        let animationFrameId: number;

        const loop = () => {
            // We can read Tone.Transport.ticks even if state is 'stopped' (it will be 0 or paused value)
            // But valid only if context is created.
            // We'll trust Tone is initialized since we use it in useAudio.

            if (containerRef.current && !isDragging.current) { // Added !isDragging.current
                // Calculate scroll based on Musical Time (Ticks)
                // Ticks = 192 per quarter note (beat).
                // pixelsPerBeat = 150 (Previous estimation).
                // Scroll = (Ticks / 192) * pixelsPerBeat.

                const ticks = Tone.getTransport().ticks; // Changed to Tone.getTransport().ticks
                const beat = ticks / 192;
                const pixelsPerBeat = 60;
                const scrollPos = beat * pixelsPerBeat;

                // Only update if difference is significant to avoid jitter during scrub fight
                if (Math.abs(containerRef.current.scrollLeft - scrollPos) > 1) { // Added jitter check
                    containerRef.current.scrollLeft = scrollPos;
                }
            }
            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [isDragging]); // Added isDragging to dependency array

    useEffect(() => {
        if (!toolkit) return;

        // Configure for horizontal layout
        const options = {
            pageWidth: 60000,
            pageHeight: 1000,
            scale: 60, // Increased size
            adjustPageHeight: true,
            header: 'none',
            footer: 'none',
            breaks: 'none',
            spacingNonLinear: 1.0,
            spacingLinear: 0.03,
        };
        toolkit.setOptions(options);

        // Load sample data
        fetch('/sample.mei')
            .then(response => response.text())
            .then(data => {
                try {
                    toolkit.loadData(data);
                    const svgData = toolkit.renderToSVG(1, {});
                    setSvg(svgData);
                } catch (e) {
                    console.error("Verovio render error:", e);
                }
            })
            .catch(err => console.error('Error loading MEI:', err));

    }, [toolkit]);

    return (
        <div className="game-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            {/* Hit Line / Cursor - Fixed relative to game container */}
            <div style={{
                position: 'absolute',
                left: '5vw', // Fixed position for the "hit line"
                top: 0,
                bottom: 0,
                width: '4px',
                background: 'rgb(100, 108, 255)', // User requested specific blue
                zIndex: 10,
                borderRight: '1px solid rgba(255, 255, 255, 0.5)'
            }}
                className="cursor-glow"
            />

            <div className="score-view"
                ref={containerRef}
                onMouseDown={handleInteractionStart} // Added event handlers
                onMouseUp={handleInteractionEnd}
                onMouseLeave={handleInteractionEnd}
                onTouchStart={handleInteractionStart}
                onTouchEnd={handleInteractionEnd}
                onScroll={handleScroll}
                style={{
                    width: '100%',
                    height: '100%',
                    background: '#888888', // Darker gray as requested
                    overflowX: 'scroll',
                    overflowY: 'hidden',
                    whiteSpace: 'nowrap',
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center'
                }}
            >
                {svg ? (
                    <div
                        dangerouslySetInnerHTML={{ __html: svg }}
                        style={{
                            height: '100%',
                            paddingLeft: '5vw', // Start at hit line
                            display: 'inline-block',
                            pointerEvents: 'none' // Let clicks pass to container ?? No, we need drag.
                        }}
                    />
                ) : (
                    <p style={{ color: 'var(--color-text-secondary)', width: '100%', textAlign: 'center' }}>
                        {toolkit ? 'Loading Score...' : 'Initializing Engine...'}
                    </p>
                )}
                {/* Spacer to ensure we can scroll past the end */}
                <div style={{ minWidth: '95vw', height: '100%' }} />
            </div>
        </div>
    );
};

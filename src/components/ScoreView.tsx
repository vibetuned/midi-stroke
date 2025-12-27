import React, { useEffect, useState, useRef } from 'react';
import { useVerovio } from '../hooks/useVerovio';
import { useGame } from '../context/GameContext';

export const ScoreView: React.FC = () => {
    const { toolkit } = useVerovio();
    const { isPlaying, tempo } = useGame();
    const [svg, setSvg] = useState<string>('');
    const containerRef = useRef<HTMLDivElement>(null);
    const lastFrameTime = useRef<number>(0);

    // Scroll Logic
    useEffect(() => {
        let animationFrameId: number;

        const loop = (timestamp: number) => {
            if (isPlaying && containerRef.current) {
                if (!lastFrameTime.current) lastFrameTime.current = timestamp;
                const deltaTime = timestamp - lastFrameTime.current;

                // Calculate scroll speed (pixels per millisecond)
                // This is a rough estimation. 40 scale approx = ? pixels per beat
                // Needs calibration or mapping from Verovio.
                // Assuming roughly 100px per beat for now at scale 40?
                // beats per minute = tempo. beats per second = tempo / 60.
                // pixels per second = (tempo / 60) * pixelsPerBeat.
                const pixelsPerBeat = 100;
                const pixelsPerSecond = (tempo / 60) * pixelsPerBeat;
                const scrollAmount = (pixelsPerSecond * deltaTime) / 1000;

                // Debug Dimensions
                if (Math.floor(timestamp) % 60 === 0) { // Log occasionally
                    console.log(`Scroll: ${containerRef.current.scrollLeft}/${containerRef.current.scrollWidth} (Client: ${containerRef.current.clientWidth})`);
                }

                containerRef.current.scrollLeft += scrollAmount;
                lastFrameTime.current = timestamp;
            } else {
                lastFrameTime.current = 0;
            }
            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [isPlaying, tempo]);

    useEffect(() => {
        if (!toolkit) return;

        // Configure for horizontal layout
        const options = {
            pageWidth: 60000,
            pageHeight: 1000,
            scale: 40,
            adjustPageHeight: true,
            header: 'none',
            footer: 'none',
            breaks: 'none'
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
                background: 'rgba(255, 255, 255, 0.8)',
                zIndex: 10,
                borderRight: '1px solid var(--color-accent)'
            }}
                className="cursor-glow"
            />

            <div className="score-view"
                ref={containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--color-bg-secondary)',
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
                            display: 'inline-block'
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

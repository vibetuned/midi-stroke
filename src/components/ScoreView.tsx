import React, { useEffect, useState, useRef } from 'react';
import * as Tone from 'tone';
import { useVerovio } from '../hooks/useVerovio';
import { useGame } from '../context/GameContext';
import { scaleLinear } from 'd3';

export const ScoreView: React.FC = () => {
    const { toolkit } = useVerovio();
    // Destructure playSizeTicks from GameContext
    const { isPlaying, setIsPlaying, setPlayPosition, loadMidiData, playSizeTicks } = useGame();
    const [svg, setSvg] = useState<string>('');
    const containerRef = useRef<HTMLDivElement>(null);
    const stickyContainerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef<boolean>(false);
    const [stickyWidth, setStickyWidth] = useState<number>(0);
    const [scrollableWidth, setScrollableWidth] = useState<number>(0);

    // Stop playback on user interaction start
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleInteractionStart = () => {
        isDragging.current = true;
        if (isPlaying) {
            setIsPlaying(false);
            Tone.getTransport().pause();
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleInteractionEnd = () => {
        isDragging.current = false;
        // Optional: Resume playback? Usually user wants to stay paused after scrub.
    };

    const handleScroll = () => {
        if (isDragging.current && containerRef.current && playSizeTicks > 0 && scrollableWidth > 0) {
            const scrollLeft = containerRef.current.scrollLeft;

            // Offset for sticky measure (4 beats count-in)
            const offsetTicks = 1 * 192;

            // Global Scale: Map effective Time -> Effective Width
            // Domain: [0, playSizeTicks - offsetTicks] (Musical duration of scrolling part)
            // Range: [0, scrollableWidth] (Visual width of scrolling part)
            const effectiveTicks = playSizeTicks - offsetTicks;

            const scrollScale = scaleLinear()
                .domain([0, scrollableWidth])
                .range([0, effectiveTicks])
                .clamp(true);

            // Calculate time relative to the start of the scrolling section
            const relativeTicks = scrollScale(scrollLeft);

            // Absolute time = relativeTicks + offsetTicks
            const absoluteTicks = relativeTicks + offsetTicks;

            // Sync Transport to Scroll
            const transport = Tone.getTransport();
            transport.ticks = absoluteTicks;
            setPlayPosition(absoluteTicks);
        }
    };

    // Scroll Animation Logic
    useEffect(() => {
        let animationFrameId: number;

        const loop = () => {
            if (containerRef.current && !isDragging.current && playSizeTicks > 0 && scrollableWidth > 0) {
                // Offset for sticky measure (4 beats count-in)
                const offsetTicks = 1 * 192;

                const currentTicks = Tone.getTransport().ticks; // Current musical position

                const effectiveTicks = playSizeTicks - offsetTicks;

                let scrollPos = 0;
                if (currentTicks > offsetTicks) {
                    // We are in the scrolling section
                    const relativeTicks = currentTicks - offsetTicks;

                    const scrollScale = scaleLinear()
                        .domain([0, effectiveTicks])
                        .range([0, scrollableWidth])
                        .clamp(true);

                    scrollPos = scrollScale(relativeTicks);
                }

                // Only update if difference is significant to avoid jitter
                if (Math.abs(containerRef.current.scrollLeft - scrollPos) > 1) {
                    containerRef.current.scrollLeft = scrollPos;
                }
            }
            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [isDragging, playSizeTicks, scrollableWidth]);

    useEffect(() => {
        if (!toolkit) return;

        // Configure for horizontal layout
        const options = {
            pageWidth: 60000,
            pageHeight: 1000,
            scale: 60,
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

                    // Generate MIDI and load into GameContext
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const midiBase64 = (toolkit as any).renderToMIDI();
                    loadMidiData(midiBase64);

                } catch (e) {
                    console.error("Verovio render error:", e);
                }
            })
            .catch(err => console.error('Error loading MEI:', err));

    }, [toolkit, loadMidiData]);

    // Calculate Sticky Width and Scrollable Width after SVG render
    useEffect(() => {
        if (svg && containerRef.current) {
            requestAnimationFrame(() => {
                const container = containerRef.current;
                if (!container) return;

                const measures = container.querySelectorAll('.system .measure');
                if (measures.length > 0) {
                    // 1. Sticky Width (First Measure)
                    const firstMeasure = measures[0];
                    const bboxFirst = (firstMeasure as SVGGraphicsElement).getBoundingClientRect();
                    setStickyWidth(bboxFirst.width + 25);

                    // 2. Scrollable Width (Sum of all other measures)
                    let totalWidth = 0;
                    for (let i = 1; i < measures.length; i++) {
                        const bbox = (measures[i] as SVGGraphicsElement).getBoundingClientRect();
                        console.log("Measure", i, "Width:", bbox.width);
                        totalWidth += bbox.width;  //- 16;
                    }

                    // If there are no other measures, width is 0? Or maybe totalWidth should handle 1 measure case
                    setScrollableWidth(totalWidth);
                    console.log("Measured Scrollable Width:", totalWidth, "Measures:", measures.length - 1);
                }
            });
        }
    }, [svg]);

    return (
        <div className="game-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>

            {/* Left Gap Cover */}
            <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0, // Cover scrollbar area too? No, usually not.
                height: 'calc(100% - 30px)', // Match sticky height
                width: '5vw',
                background: '#888888',
                zIndex: 6,
                pointerEvents: 'none'
            }} />

            {/* Sticky Measure Overlay */}
            {svg && stickyWidth > 0 && (
                <div
                    ref={stickyContainerRef}
                    style={{
                        position: 'absolute',
                        left: '5vw', // Match padding of main container
                        top: 0,
                        height: 'calc(100% - 30px)', // Make shorter for scrollbar
                        width: stickyWidth,
                        overflow: 'hidden',
                        zIndex: 5,
                        background: '#888888',
                        pointerEvents: 'none',
                        borderRight: '1px solid rgba(255,255,255,0.2)',
                        // Mask to fade the right 50px to 0.5 opacity
                        maskImage: 'linear-gradient(to right, black calc(100% - 50px), rgba(0,0,0,0.0) 100%)',
                        WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 50px), rgba(0,0,0,0.0) 100%)'
                    }}
                >
                    {/* Render the same SVG but clipped via wrapper width */}
                    <div
                        dangerouslySetInnerHTML={{ __html: svg }}
                        style={{
                            height: '100%',
                            // We don't need padding here because this div is ALREADY at 5vw.
                            // So the SVG should start at 0 inside this div.
                            // BUT our main SVG has padding-left: 5vw? 
                            // No, the main CONTAINER has valid SVG.
                            // If we render pure SVG here, it starts at 0.
                            // Wait, the main view logic below says paddingLeft: 5vw.
                            // If sticky is at left: 5vw, then inside it SVG starts at 0.
                            display: 'inline-block'
                        }}
                    />
                </div>
            )}

            {/* Hit Line / Cursor */}
            <div style={{
                position: 'absolute',
                // Cursor should be at the END of the sticky measure
                left: `calc(5vw + ${stickyWidth}px)`,
                top: 0,
                bottom: 0,
                width: '4px',
                background: 'rgb(100, 108, 255)',
                zIndex: 10,
                borderRight: '1px solid rgba(255, 255, 255, 0.5)'
            }}
                className="cursor-glow"
            />

            <div className="score-view"
                ref={containerRef}
                onMouseDown={handleInteractionStart}
                onMouseUp={handleInteractionEnd}
                onMouseLeave={handleInteractionEnd}
                onTouchStart={handleInteractionStart}
                onTouchEnd={handleInteractionEnd}
                onScroll={handleScroll}
                style={{
                    width: '100%',
                    height: '100%',
                    background: '#888888',
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
                            paddingLeft: '5vw', // Start at hit line visually? 
                            // Actually if we want Sticky M0 to align with "Real" M0 at start:
                            // Sticky M0 is at Left:5vw.
                            // Real M0 starts at PaddingLeft:5vw.
                            // So they overlap perfectly initially.
                            // When we scroll, Real M0 moves left. Sticky stays. 
                            // Correct.
                            display: 'inline-block',
                            pointerEvents: 'none'
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

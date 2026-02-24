import React, { useEffect, useState, useRef } from 'react';
import * as Tone from 'tone';
import { useVerovio } from '../hooks/useVerovio';
import { useGame } from '../context/GameContext';
import * as PIXI from 'pixi.js';

interface MeasureData {
    id: string;
    x: number;
    width: number;
    startTick: number;
    endTick: number;
}

export const DrumsScoreView: React.FC = () => {
    const { toolkit } = useVerovio();
    const { isPlaying, setIsPlaying, loadMidiData, seek, selectedSong, playPosition } = useGame();

    const [loadingMsg, setLoadingMsg] = useState<string>('Initializing Engine...');
    const pixiContainerRef = useRef<HTMLDivElement>(null);
    const hiddenSvgRef = useRef<HTMLDivElement>(null);

    const appRef = useRef<PIXI.Application | null>(null);
    const scrollContainerRef = useRef<PIXI.Container | null>(null);
    const cursorRef = useRef<PIXI.Graphics | null>(null);
    const isDragging = useRef<boolean>(false);

    // Fix stale closures in Pixi events
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // Extracted Measure Data
    const measureDataRef = useRef<MeasureData[]>([]);
    const totalWidthRef = useRef<number>(0);
    const scaleRef = useRef<number>(1);

    // Initialize Pixi
    useEffect(() => {
        let isMounted = true;

        const initPixi = async () => {
            const app = new PIXI.Application();
            await app.init({
                backgroundAlpha: 0,
                resizeTo: pixiContainerRef.current as HTMLElement,
                autoDensity: true,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
            });
            if (isMounted && pixiContainerRef.current) {
                // Force Canvas to respect CSS bounds and not stretch parent div
                app.canvas.style.width = '100%';
                app.canvas.style.height = '100%';
                app.canvas.style.display = 'block';

                pixiContainerRef.current.appendChild(app.canvas);
                appRef.current = app;

                // Create main score container
                const scrollContainer = new PIXI.Container();
                app.stage.addChild(scrollContainer);
                scrollContainerRef.current = scrollContainer;

                // Create cursor
                const cursor = new PIXI.Graphics();
                app.stage.addChild(cursor);
                cursorRef.current = cursor;

                // Add Drag Interactions on the Canvas
                app.stage.eventMode = 'static';
                app.stage.hitArea = new PIXI.Rectangle(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

                app.stage.on('pointerdown', (e) => {
                    isDragging.current = true;
                    if (isPlayingRef.current) {
                        setIsPlaying(false);
                        Tone.getTransport().pause();
                    } else if (Tone.getTransport().state !== 'paused') {
                        setIsPlaying(false);
                        Tone.getTransport().pause();
                    }
                    // We don't drag the scroll container anymore, we just seek to the clicked/dragged position
                    const scale = scaleRef.current;
                    const scoreDisplayWidth = totalWidthRef.current * scale;
                    const offsetX = (window.innerWidth - scoreDisplayWidth) / 2;
                    // The global X of the score where the user clicked, taking into account the screen offset
                    const targetGlobalX = (e.global.x - offsetX) / scale;
                    seekToGlobalX(targetGlobalX);
                });

                const endDrag = () => { isDragging.current = false; };
                app.stage.on('pointerup', endDrag);
                app.stage.on('pointerupoutside', endDrag);
                app.stage.on('pointercancel', endDrag);
                app.stage.on('pointerout', endDrag);

                app.stage.on('pointermove', (e) => {
                    if (isDragging.current) {
                        const scale = scaleRef.current;
                        const scoreDisplayWidth = totalWidthRef.current * scale;
                        const offsetX = (window.innerWidth - scoreDisplayWidth) / 2;
                        const targetGlobalX = (e.global.x - offsetX) / scale;
                        seekToGlobalX(targetGlobalX);
                    }
                });

                const seekToGlobalX = (targetGlobalX: number) => {
                    const mData = measureDataRef.current;
                    let targetTick = 0;
                    if (mData.length > 0) {
                        if (targetGlobalX <= mData[0].x) {
                            targetTick = mData[0].startTick;
                        } else if (targetGlobalX >= mData[mData.length - 1].x + mData[mData.length - 1].width) {
                            targetTick = mData[mData.length - 1].endTick;
                        } else {
                            const mIndex = mData.findIndex(m => targetGlobalX >= m.x && targetGlobalX <= m.x + m.width);
                            if (mIndex !== -1) {
                                const m = mData[mIndex];
                                const progress = (targetGlobalX - m.x) / m.width;
                                targetTick = m.startTick + progress * (m.endTick - m.startTick);
                            }
                        }
                    }

                    // Add offset
                    const OFFSET_TICKS = 192; // 1 beat count-in
                    seek(targetTick + OFFSET_TICKS);
                };

                // Add explicit window resize listener to trigger Pixi layout update
                const handleResize = () => {
                    if (appRef.current && hiddenSvgRef.current) {
                        // appRef.current.resize();
                    }
                };
                window.addEventListener('resize', handleResize);

            }
        };

        if (!appRef.current) {
            initPixi().catch(console.error);
        }

        return () => {
            isMounted = false;
            window.removeEventListener('resize', () => { });
            if (appRef.current) {
                appRef.current.destroy(true, { children: true });
                appRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Ticker Loop
    useEffect(() => {
        if (!appRef.current) return;
        const app = appRef.current;

        const update = () => {
            if (!scrollContainerRef.current || !cursorRef.current) return;

            const scale = scaleRef.current;
            // (Cursor drawing moved inside the isDragging/measureData check)

            // (Cursor drawing moved inside the isDragging/measureData check)

            if (!isDragging.current && measureDataRef.current.length > 0) {
                const OFFSET_TICKS = 192; // Match GameContext count-in

                // Use game context's playPosition instead of raw Tone.js ticks
                // This correctly handles practice mode when tone transport is paused
                const scoreTick = playPosition - OFFSET_TICKS;

                const mData = measureDataRef.current;
                let globalX = 0;

                if (mData.length > 0) {
                    if (scoreTick <= 0) {
                        globalX = mData.length > 1 ? mData[1].x : mData[0].x;
                    } else if (scoreTick >= mData[mData.length - 1].endTick) {
                        globalX = mData[mData.length - 1].x + mData[mData.length - 1].width;
                    } else {
                        const mIndex = mData.findIndex(m => scoreTick >= m.startTick && scoreTick < m.endTick);
                        if (mIndex !== -1) {
                            const m = mData[mIndex];
                            const progress = (scoreTick - m.startTick) / (m.endTick - m.startTick);
                            globalX = m.x + progress * m.width;
                        } else {
                            // Fallback if between gaps or exact bounds
                            globalX = mData[0].x;
                        }
                    }
                }

                // Center the score horizontally
                const scoreDisplayWidth = totalWidthRef.current * scale;
                const offsetX = (window.innerWidth - scoreDisplayWidth) / 2;

                // Move the cursor across the static score
                const targetCursorX = offsetX + globalX * scale;
                const cursor = cursorRef.current;
                cursor.clear();
                cursor.rect(targetCursorX, 0, 4, app.screen.height);
                cursor.fill(0xf5576c);

                // Keep the score centered horizontally
                scrollContainerRef.current.x = offsetX;
            }
        };

        app.ticker.add(update);
        return () => {
            if (app.ticker) {
                app.ticker.remove(update);
            }
        };
    }, [playPosition]);

    // Load Verovio SVG
    useEffect(() => {
        if (!toolkit || !selectedSong) return;
        setLoadingMsg('Loading Score...');

        const options = {
            pageWidth: 60000,
            pageHeight: 1500, // Make it larger since it's a single voice
            scale: 85, // Scale it up significantly
            adjustPageHeight: true,
            header: 'none',
            footer: 'none',
            breaks: 'none',
            spacingNonLinear: 1.0,
            spacingLinear: 0.03,
        };
        toolkit.setOptions(options);

        const path = selectedSong.startsWith('/') ? selectedSong : `/${selectedSong}`;

        fetch(path)
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load ${path}`);
                return response.text();
            })
            .then(data => {
                try {
                    setLoadingMsg('Rendering SVG...');

                    // Parse MEI to find ticksInMeasure
                    let parsedTicksInMeasure = 768; // default to 4/4
                    try {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(data, "text/xml");
                        const meterSig = xmlDoc.querySelector("meterSig");
                        if (meterSig) {
                            const countAttr = meterSig.getAttribute("count");
                            const unitAttr = meterSig.getAttribute("unit");
                            if (countAttr && unitAttr) {
                                const count = parseInt(countAttr, 10);
                                const unit = parseInt(unitAttr, 10);
                                if (!isNaN(count) && !isNaN(unit) && unit > 0) {
                                    parsedTicksInMeasure = count * (4 / unit) * 192;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error parsing MEI for meterSig:", e);
                    }

                    toolkit.loadData(data);
                    const svgData = toolkit.renderToSVG(1, {});

                    if (hiddenSvgRef.current) {
                        hiddenSvgRef.current.innerHTML = svgData;

                        setTimeout(() => {
                            if (hiddenSvgRef.current) {
                                processSvgToPixi(svgData, hiddenSvgRef.current, parsedTicksInMeasure);
                            }
                        }, 50);
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const midiBase64 = (toolkit as any).renderToMIDI();
                    loadMidiData(midiBase64);

                } catch (e) {
                    console.error("Verovio render error:", e);
                    setLoadingMsg('Error loading score');
                }
            })
            .catch(err => {
                console.error('Error loading MEI:', err);
                setLoadingMsg('Error loading score');
            });

    }, [toolkit, loadMidiData, selectedSong]);

    const processSvgToPixi = async (svgString: string, hiddenDiv: HTMLDivElement, ticksInMeasureVal: number = 768) => {
        if (!appRef.current) return;
        setLoadingMsg('Slicing Textures...');
        const measures = Array.from(hiddenDiv.querySelectorAll('.system .measure'));
        if (measures.length === 0) {
            setLoadingMsg('Error: No measures found');
            return;
        }

        const mData: MeasureData[] = [];
        let currentTick = 0;
        const svgOuterBBox = hiddenDiv.querySelector('svg')?.getBoundingClientRect() || { left: 0, width: 0 };

        measures.forEach((m, index) => {
            const bbox = m.getBoundingClientRect();
            const ticksInMeasure = index === 0 ? 0 : ticksInMeasureVal;

            mData.push({
                id: m.id,
                x: bbox.left - svgOuterBBox.left,
                width: bbox.width,
                startTick: currentTick,
                endTick: currentTick + ticksInMeasure
            });
            currentTick += ticksInMeasure;
        });

        measureDataRef.current = mData;
        totalWidthRef.current = svgOuterBBox.width;

        if (scrollContainerRef.current) {
            scrollContainerRef.current.removeChildren().forEach(child => child.destroy({ texture: true }));
        }

        const img = new Image();
        const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
        img.src = `data:image/svg+xml;base64,${svgBase64}`;

        await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
        });

        const TEXTURE_WIDTH = 2048;
        const TEXTURE_HEIGHT = Math.max(200, img.height || 1000);
        const totalW = Math.max(1, img.width || totalWidthRef.current);

        const scaleFactor = Math.min(1.5, appRef.current.screen.height / TEXTURE_HEIGHT); // Allow scaling up slightly more for clarity
        scaleRef.current = scaleFactor;

        if (scrollContainerRef.current) {
            scrollContainerRef.current.scale.set(scaleFactor);
        }

        const targetY = (appRef.current.screen.height / scaleFactor - TEXTURE_HEIGHT) / 2;

        for (let x = 0; x < totalW; x += TEXTURE_WIDTH) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(TEXTURE_WIDTH, totalW - x);
            canvas.height = TEXTURE_HEIGHT;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, x, 0, canvas.width, TEXTURE_HEIGHT, 0, 0, canvas.width, TEXTURE_HEIGHT);
            }
            const texture = PIXI.Texture.from(canvas);
            const sprite = new PIXI.Sprite(texture);
            sprite.x = x;
            sprite.y = targetY;
            scrollContainerRef.current?.addChild(sprite);
        }

        // No sticky container for drums - the cursor stays in the center and the score scrolls past it

        if (cursorRef.current) {
            appRef.current.stage.setChildIndex(cursorRef.current, appRef.current.stage.children.length - 1);
        }

        setLoadingMsg('');

        const OFFSET_TICKS = 192; // 1 beat count-in
        seek(OFFSET_TICKS);
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '25vh', overflow: 'hidden', background: '#888888', touchAction: 'none' }}>
            {loadingMsg && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 20, color: 'white', background: '#888888'
                }}>
                    <h2>{loadingMsg}</h2>
                </div>
            )}

            <div ref={pixiContainerRef} style={{ width: '100%', height: '100%' }} />

            <div
                ref={hiddenSvgRef}
                className="hidden-svg-measurer"
                style={{
                    position: 'absolute',
                    top: -9999,
                    left: 0,
                    opacity: 0,
                    pointerEvents: 'none'
                }}
            />
        </div>
    );
};

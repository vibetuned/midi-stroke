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

// Fix 8: single source of truth for the score background colour
const SCORE_BG_COLOR = '#888888';
const SCORE_BG_HEX = 0x888888;

// Fix 11: ordered loading steps used by the progress dots
const LOADING_STEPS = ['Loading Score...', 'Rendering SVG...', 'Slicing Textures...'];

// Fix 1: binary search helpers — O(log n) instead of O(n) findIndex
function findMeasureAtTick(mData: MeasureData[], tick: number): number {
    let lo = 0, hi = mData.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (mData[mid].startTick <= tick) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function findMeasureAtX(mData: MeasureData[], x: number): number {
    let lo = 0, hi = mData.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (mData[mid].x <= x) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

export const ScoreView: React.FC = () => {
    const { toolkit } = useVerovio();
    // Fix 7: destructure setSelectedSong for error-recovery back button
    const { isPlaying, setIsPlaying, loadMidiData, seek, selectedSong, setSelectedSong, playPosition } = useGame();

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

    // Fix 3: keep playPosition in a ref so the ticker never needs to be re-registered
    const playPositionRef = useRef(playPosition);
    useEffect(() => {
        playPositionRef.current = playPosition;
    }, [playPosition]);

    // Extracted Measure Data
    const measureDataRef = useRef<MeasureData[]>([]);
    const stickyWidthRef = useRef<number>(0);
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
                app.canvas.style.width = '100%';
                app.canvas.style.height = '100%';
                app.canvas.style.display = 'block';

                pixiContainerRef.current.appendChild(app.canvas);
                appRef.current = app;

                const scrollContainer = new PIXI.Container();
                app.stage.addChild(scrollContainer);
                scrollContainerRef.current = scrollContainer;

                const cursor = new PIXI.Graphics();
                app.stage.addChild(cursor);
                cursorRef.current = cursor;

                app.stage.eventMode = 'static';
                app.stage.hitArea = new PIXI.Rectangle(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

                let dragStartX = 0;
                let dragStartScrollX = 0;

                app.stage.on('pointerdown', (e) => {
                    isDragging.current = true;
                    if (isPlayingRef.current) {
                        setIsPlaying(false);
                        Tone.getTransport().pause();
                    } else if (Tone.getTransport().state !== 'paused') {
                        setIsPlaying(false);
                        Tone.getTransport().pause();
                    }
                    dragStartX = e.global.x;
                    dragStartScrollX = scrollContainer.x;
                });

                const endDrag = () => { isDragging.current = false; };
                app.stage.on('pointerup', endDrag);
                app.stage.on('pointerupoutside', endDrag);
                app.stage.on('pointercancel', endDrag);
                app.stage.on('pointerout', endDrag);

                app.stage.on('pointermove', (e) => {
                    if (isDragging.current && scrollContainerRef.current) {
                        const dx = e.global.x - dragStartX;
                        let newX = dragStartScrollX + dx;

                        const scale = scaleRef.current;
                        const maxScroll = window.innerWidth * 0.05 + stickyWidthRef.current * scale;
                        const minScroll = -totalWidthRef.current * scale + window.innerWidth * 0.5;
                        newX = Math.max(minScroll, Math.min(newX, maxScroll));

                        scrollContainerRef.current.x = newX;

                        const hitLineScreenX = window.innerWidth * 0.05 + stickyWidthRef.current * scale;
                        const targetGlobalX = (hitLineScreenX - newX) / scale;

                        // Fix 1: binary search instead of findIndex
                        const mData = measureDataRef.current;
                        let targetTick = 0;
                        if (mData.length > 0) {
                            if (targetGlobalX <= mData[0].x) {
                                targetTick = mData[0].startTick;
                            } else if (targetGlobalX >= mData[mData.length - 1].x + mData[mData.length - 1].width) {
                                targetTick = mData[mData.length - 1].endTick;
                            } else {
                                const mIndex = findMeasureAtX(mData, targetGlobalX);
                                const m = mData[mIndex];
                                const progress = (targetGlobalX - m.x) / m.width;
                                targetTick = m.startTick + progress * (m.endTick - m.startTick);
                            }
                        }

                        const OFFSET_TICKS = 192;
                        seek(targetTick + OFFSET_TICKS);
                    }
                });

                // Fix 3: ticker registered here — inside initPixi — so it runs only
                // after the app is live. Reads playPosition via ref so it never needs
                // to be torn down and re-added on every 50 ms position update.
                // The cursor line sits at a fixed screen X; only redraw when that changes.
                let lastHitLineX = -1;
                const update = () => {
                    if (!scrollContainerRef.current || !cursorRef.current) return;

                    const scale = scaleRef.current;
                    const hitLineScreenX = window.innerWidth * 0.05 + stickyWidthRef.current * scale;

                    // Fix 3: skip cursor redraw when position hasn't changed
                    if (Math.abs(hitLineScreenX - lastHitLineX) > 0.5) {
                        cursor.clear();
                        cursor.rect(hitLineScreenX, 0, 4, app.screen.height);
                        cursor.fill(0x646cff);
                        lastHitLineX = hitLineScreenX;
                    }

                    if (!isDragging.current && measureDataRef.current.length > 0) {
                        const OFFSET_TICKS = 192;
                        const scoreTick = playPositionRef.current - OFFSET_TICKS;

                        const mData = measureDataRef.current;
                        let globalX = 0;

                        if (scoreTick <= 0) {
                            globalX = mData.length > 1 ? mData[1].x : mData[0].x;
                        } else if (scoreTick >= mData[mData.length - 1].endTick) {
                            globalX = mData[mData.length - 1].x + mData[mData.length - 1].width;
                        } else {
                            // Fix 1: binary search
                            const mIndex = findMeasureAtTick(mData, scoreTick);
                            const m = mData[mIndex];
                            const progress = (scoreTick - m.startTick) / (m.endTick - m.startTick);
                            globalX = m.x + progress * m.width;
                        }

                        const targetScrollX = hitLineScreenX - globalX * scale;
                        if (Math.abs(scrollContainerRef.current.x - targetScrollX) > 0.5) {
                            scrollContainerRef.current.x = targetScrollX;
                        }
                    }
                };
                app.ticker.add(update);

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

    // Load Verovio SVG
    useEffect(() => {
        if (!toolkit || !selectedSong) return;
        setLoadingMsg('Loading Score...');

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

        const path = (selectedSong.startsWith('/') || selectedSong.startsWith('blob:'))
            ? selectedSong
            : `/${selectedSong}`;

        fetch(path)
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load ${path}`);
                return response.text();
            })
            .then(data => {
                try {
                    setLoadingMsg('Rendering SVG...');

                    let parsedTicksInMeasure = 768;
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

                        // Fix 4/11: requestAnimationFrame lets React commit the "Rendering SVG..."
                        // state update and paint before the heavy processSvgToPixi work begins,
                        // replacing the arbitrary 50ms setTimeout.
                        requestAnimationFrame(() => {
                            if (hiddenSvgRef.current) {
                                processSvgToPixi(svgData, hiddenSvgRef.current, parsedTicksInMeasure);
                            }
                        });
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

        // Fix 4: batch all getBoundingClientRect reads up front to avoid repeated layout reflows
        const svgOuterBBox = hiddenDiv.querySelector('svg')?.getBoundingClientRect() || { left: 0, width: 0 };
        const measureBBoxes = measures.map(m => m.getBoundingClientRect());

        const mData: MeasureData[] = [];
        let currentTick = 0;

        measures.forEach((m, index) => {
            const bbox = measureBBoxes[index];
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

        stickyWidthRef.current = mData[0].width + 25;
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

        const scaleFactor = Math.min(1, appRef.current.screen.height / TEXTURE_HEIGHT);
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

        // Sticky Overlay Sprite
        const stickyCanvas = document.createElement('canvas');
        stickyCanvas.width = stickyWidthRef.current;
        stickyCanvas.height = TEXTURE_HEIGHT;
        const stickyCtx = stickyCanvas.getContext('2d');
        if (stickyCtx) {
            // Fix 8: use constant so this always matches the container background
            stickyCtx.fillStyle = SCORE_BG_COLOR;
            stickyCtx.fillRect(0, 0, stickyCanvas.width - 30, TEXTURE_HEIGHT);

            const gradient = stickyCtx.createLinearGradient(stickyCanvas.width - 30, 0, stickyCanvas.width, 0);
            gradient.addColorStop(0, 'rgba(136, 136, 136, 1)');
            gradient.addColorStop(1, 'rgba(136, 136, 136, 0)');
            stickyCtx.fillStyle = gradient;
            stickyCtx.fillRect(stickyCanvas.width - 30, 0, 30, TEXTURE_HEIGHT);

            stickyCtx.drawImage(img, 0, 0, stickyCanvas.width, TEXTURE_HEIGHT, 0, 0, stickyCanvas.width, TEXTURE_HEIGHT);
        }

        const stickyContainer = new PIXI.Container();
        const stickyTexture = PIXI.Texture.from(stickyCanvas);
        const stickySprite = new PIXI.Sprite(stickyTexture);

        stickyContainer.scale.set(scaleFactor);
        stickyContainer.x = window.innerWidth * 0.05;
        stickyContainer.y = targetY * scaleFactor;

        const leftBg = new PIXI.Graphics();
        leftBg.rect(-4000, 0, 4000, TEXTURE_HEIGHT);
        leftBg.fill({ color: SCORE_BG_HEX }); // Fix 8
        stickyContainer.addChild(leftBg);

        stickyContainer.addChild(stickySprite);

        appRef.current.stage.addChild(stickyContainer);
        if (cursorRef.current) {
            appRef.current.stage.setChildIndex(cursorRef.current, appRef.current.stage.children.length - 1);
        }

        setLoadingMsg('');

        const OFFSET_TICKS = 192;
        seek(OFFSET_TICKS);
    };

    // Fix 11: compute step index for progress dots
    const stepIndex = LOADING_STEPS.indexOf(loadingMsg);
    const isError = loadingMsg.startsWith('Error');

    return (
        <div style={{ position: 'relative', width: '100%', height: '25vh', overflow: 'hidden', background: SCORE_BG_COLOR, touchAction: 'none' }}>
            {loadingMsg && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    zIndex: 20, color: 'white', background: SCORE_BG_COLOR,
                }}>
                    {/* Fix 7: show retry / back button on error */}
                    {isError ? (
                        <>
                            <h2 style={{ color: '#ff6b6b', marginBottom: '1rem' }}>{loadingMsg}</h2>
                            <button
                                onClick={() => { setLoadingMsg(''); setSelectedSong(null); }}
                                style={{
                                    padding: '0.6rem 1.4rem',
                                    background: 'transparent',
                                    border: '1px solid #ff6b6b',
                                    color: '#ff6b6b',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    fontSize: '0.95rem',
                                }}
                            >
                                ← Back to Song Selection
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Fix 11: progress dots */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                {LOADING_STEPS.map((_, i) => (
                                    <div key={i} style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: i <= stepIndex ? '#646cff' : '#555',
                                        transition: 'background 0.3s',
                                    }} />
                                ))}
                            </div>
                            <h2>{loadingMsg}</h2>
                        </>
                    )}
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

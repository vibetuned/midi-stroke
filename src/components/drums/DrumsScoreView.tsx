import React, { useEffect, useState, useRef } from 'react';
import * as Tone from 'tone';
import { useVerovio } from '../../hooks/useVerovio';
import { useGame } from '../../context/GameContext';
import { loadSongText } from '../../utils/songUrl';
import { extractTimemap, type TimemapData } from '../../utils/timemap';
import { ensureCountInMeasure } from '../../utils/mei';
import * as PIXI from 'pixi.js';

interface MeasureData {
    id: string;
    x: number;
    width: number;
    startTick: number;
    endTick: number;
}

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

export const DrumsScoreView: React.FC = () => {
    const { toolkit } = useVerovio();
    // Fix 7: destructure setSelectedSong for error-recovery back button
    const { isPlaying, setIsPlaying, loadTimemap, seek, selectedSong, setSelectedSong, playPosition } = useGame();

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

                app.stage.on('pointerdown', (e) => {
                    isDragging.current = true;
                    if (isPlayingRef.current) {
                        setIsPlaying(false);
                        Tone.getTransport().pause();
                    } else if (Tone.getTransport().state !== 'paused') {
                        setIsPlaying(false);
                        Tone.getTransport().pause();
                    }
                    const scale = scaleRef.current;
                    const scoreDisplayWidth = totalWidthRef.current * scale;
                    const offsetX = (window.innerWidth - scoreDisplayWidth) / 2;
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

                    seek(targetTick);
                };

                // Fix 3: ticker registered here so it runs after the app is live.
                // Reads playPosition via ref; only redraws the cursor when it has moved.
                let lastCursorX = -1;
                const update = () => {
                    if (!scrollContainerRef.current || !cursorRef.current) return;

                    const scale = scaleRef.current;

                    if (!isDragging.current && measureDataRef.current.length > 0) {
                        const scoreTick = playPositionRef.current;

                        const mData = measureDataRef.current;
                        let globalX = 0;

                        // Park the cursor at the first real measure while inside
                        // the n="0" count-in measure.
                        const musicStartTick = mData.length > 1 ? mData[1].startTick : 0;
                        if (scoreTick <= musicStartTick) {
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

                        const scoreDisplayWidth = totalWidthRef.current * scale;
                        const offsetX = (window.innerWidth - scoreDisplayWidth) / 2;
                        const targetCursorX = offsetX + globalX * scale;

                        // Fix 3: skip cursor redraw when position hasn't changed
                        if (Math.abs(targetCursorX - lastCursorX) > 0.5) {
                            cursor.clear();
                            cursor.rect(targetCursorX, 0, 4, app.screen.height);
                            cursor.fill(0xf5576c);
                            lastCursorX = targetCursorX;
                        }

                        // Keep the score centered (no-op once positioned)
                        if (Math.abs(scrollContainerRef.current.x - offsetX) > 0.5) {
                            scrollContainerRef.current.x = offsetX;
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
            pageHeight: 1500,
            scale: 85,
            adjustPageHeight: true,
            header: 'none',
            footer: 'none',
            breaks: 'none',
            spacingNonLinear: 1.0,
            spacingLinear: 0.03,
        };
        toolkit.setOptions(options);

        loadSongText(selectedSong)
            .then(data => {
                try {
                    setLoadingMsg('Rendering SVG...');

                    // Source MEI DOM — used by extractTimemap for note→staff
                    // mapping, and to inject the n="0" count-in measure into
                    // imported scores that lack it.
                    let xmlDoc: Document | null = null;
                    let meiData = data;
                    try {
                        xmlDoc = new DOMParser().parseFromString(data, "text/xml");
                        if (ensureCountInMeasure(xmlDoc)) {
                            meiData = new XMLSerializer().serializeToString(xmlDoc);
                            console.log('Injected count-in measure (score had none)');
                        }
                    } catch (e) {
                        console.error("Error parsing MEI:", e);
                    }

                    toolkit.loadData(meiData);
                    const svgData = toolkit.renderToSVG(1, {});

                    // Timemap from the same loadData call as the SVG, so the
                    // measure ids match — exact tick timeline for cursor sync
                    // and practice pause scheduling.
                    const timemapData = extractTimemap(toolkit, xmlDoc);
                    loadTimemap(timemapData);

                    if (hiddenSvgRef.current) {
                        hiddenSvgRef.current.innerHTML = svgData;

                        // Fix 4/11: requestAnimationFrame instead of arbitrary 50ms setTimeout
                        requestAnimationFrame(() => {
                            if (hiddenSvgRef.current) {
                                processSvgToPixi(svgData, hiddenSvgRef.current, timemapData);
                            }
                        });
                    }

                } catch (e) {
                    console.error("Verovio render error:", e);
                    setLoadingMsg('Error loading score');
                }
            })
            .catch(err => {
                console.error('Error loading MEI:', err);
                setLoadingMsg('Error loading score');
            });

    }, [toolkit, loadTimemap, selectedSong]);

    const processSvgToPixi = async (svgString: string, hiddenDiv: HTMLDivElement, timemapData: TimemapData) => {
        if (!appRef.current) return;
        setLoadingMsg('Slicing Textures...');
        const measures = Array.from(hiddenDiv.querySelectorAll('.system .measure'));
        if (measures.length === 0) {
            setLoadingMsg('Error: No measures found');
            return;
        }

        // Fix 4: batch all getBoundingClientRect reads up front
        const svgOuterBBox = hiddenDiv.querySelector('svg')?.getBoundingClientRect() || { left: 0, width: 0 };
        const measureBBoxes = measures.map(m => m.getBoundingClientRect());

        // Measure start ticks come from the Verovio timemap — exact values that
        // handle the n="0" count-in measure, pickups, meter changes and
        // irregular bars. The SVG measure ids match the timemap ids because
        // both come from the same loadData call. If an id is somehow missing,
        // carry the previous tick forward (zero-length measure).
        let runningTick = 0;
        const startTicks = measures.map(m => {
            const t = timemapData.measureTicks.get(m.id);
            if (t !== undefined) runningTick = t;
            return runningTick;
        });

        const mData: MeasureData[] = [];

        measures.forEach((m, index) => {
            const bbox = measureBBoxes[index];

            // Slurs/ties are rendered inside the measure where they start, so a
            // curve crossing the barline inflates that measure's bbox width past
            // the next measure's left edge — the tick→x interpolation would then
            // jump backwards at the boundary. Left edges are unaffected, so use
            // the gap to the next measure's left edge as the width instead.
            const x = bbox.left - svgOuterBBox.left;
            const nextBBox = measureBBoxes[index + 1];
            const width = nextBBox
                ? Math.max(1, (nextBBox.left - svgOuterBBox.left) - x)
                : bbox.width;

            mData.push({
                id: m.id,
                x,
                width,
                startTick: startTicks[index],
                endTick: index + 1 < startTicks.length ? startTicks[index + 1] : timemapData.totalTicks
            });
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

        const scaleFactor = Math.min(1.5, appRef.current.screen.height / TEXTURE_HEIGHT);
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

        if (cursorRef.current) {
            appRef.current.stage.setChildIndex(cursorRef.current, appRef.current.stage.children.length - 1);
        }

        setLoadingMsg('');

        seek(0);
    };

    // Fix 11: compute step index for progress dots
    const stepIndex = LOADING_STEPS.indexOf(loadingMsg);
    const isError = loadingMsg.startsWith('Error');

    return (
        // A bounded band, vertically centered by the app's <main> — same
        // presentation as the saxo score.
        <div style={{ position: 'relative', width: '100%', height: 'min(100%, 40vh)', minHeight: '180px', overflow: 'hidden', background: '#888888', touchAction: 'none' }}>
            {loadingMsg && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    zIndex: 20, color: 'white', background: '#888888',
                }}>
                    {/* Fix 7: error recovery back button */}
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
                                        background: i <= stepIndex ? '#f5576c' : '#555',
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

import React, { useEffect, useState, useRef } from 'react';
import * as Tone from 'tone';
import { useVerovio } from '../../hooks/useVerovio';
import { useGame } from '../../context/game';
import { useStats } from '../../context/stats';
import { loadSongText } from '../../utils/songUrl';
import { extractTimemap, type TimemapData } from '../../utils/timemap';
import { ensureCountInMeasure, ensureNoteIds } from '../../utils/mei';
import * as PIXI from 'pixi.js';
import { LoopRangeSelector } from '../LoopRangeSelector';
import { useEarVeil } from '../../hooks/useEarVeil';
import { useLoopMarks } from '../../hooks/useLoopMarks';
import { loadSvgImage, measureNoteLefts, measureStaffLines, sliceToSprites } from '../../utils/scoreRaster';
import { placeMeasures } from '../../utils/placeMeasures';

interface MeasureData {
    id: string;
    x: number;
    width: number;
    startTick: number;
    endTick: number;
}

// Single source of truth for the score background colour.
const SCORE_BG_COLOR = '#888888';
const SCORE_BG_HEX = 0x888888;
// Saxo accent (gold) for the playhead cursor — PIXI can't read the CSS var.
const CURSOR_HEX = 0xd4a017;

/** By ear, how quickly the page glides to a new place: the time constant of
 *  an exponential ease, so ~95 % of the way there in three of these. */
const EAR_SCROLL_EASE_MS = 140;

const LOADING_STEPS = ['Loading Score...', 'Rendering SVG...', 'Slicing Textures...'];

// Binary search helpers — O(log n) tick/x lookups over measureData.
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

/**
 * Single-staff score view for the Saxo app. Forked from PianoScoreView, with two
 * deliberate differences:
 *   1. No grand-staff hand overlays (saxo is one voice). Learn by ear's
 *      veil is the same (hooks/useEarVeil.ts), with no other staff to hide.
 *   2. All horizontal layout math uses the Pixi *canvas* width
 *      (`app.screen.width`) instead of `window.innerWidth`, because the score
 *      lives in the right ~3/4 column of the SaxoApp split — not the full page.
 * The baked saxo MEI is already single-staff/transposed, so it loads as-is.
 */
export const SaxoScoreView: React.FC = () => {
    const { toolkit } = useVerovio();
    const { isPlaying, setIsPlaying, loadTimemap, seek, selectedSong, setSelectedSong, playPosition, gameMode } = useGame();
    const { sessionStats } = useStats();

    const [loadingMsg, setLoadingMsg] = useState<string>('Initializing Engine...');
    const pixiContainerRef = useRef<HTMLDivElement>(null);
    const hiddenSvgRef = useRef<HTMLDivElement>(null);

    const appRef = useRef<PIXI.Application | null>(null);
    const scrollContainerRef = useRef<PIXI.Container | null>(null);
    const stickyContainerRef = useRef<PIXI.Container | null>(null);
    const cursorRef = useRef<PIXI.Graphics | null>(null);
    const isDragging = useRef<boolean>(false);

    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    const playPositionRef = useRef(playPosition);
    useEffect(() => { playPositionRef.current = playPosition; }, [playPosition]);

    const measureDataRef = useRef<MeasureData[]>([]);
    /** The same measures in page order, each at its first time through: for dragging the page. */
    const writtenDataRef = useRef<MeasureData[]>([]);
    const stickyWidthRef = useRef<number>(0);
    const totalWidthRef = useRef<number>(0);
    const scaleRef = useRef<number>(1);

    // Minimap state + refs
    const [tickPositions, setTickPositions] = useState<number[]>([]);
    const totalScoreTicksRef = useRef<number>(0);
    const minimapRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    const isMinimapDragging = useRef<boolean>(false);

    // Learn by ear: only what has been played is on the page.
    const veil = useEarVeil(scrollContainerRef, SCORE_BG_COLOR);
    // The minimap's bar range, as repeat signs on the page, in the saxo gold.
    const loopMarks = useLoopMarks(scrollContainerRef, CURSOR_HEX);
    // Read by the Pixi ticker, which is registered once.
    const easeScrollRef = useRef(gameMode === 'ear');
    useEffect(() => { easeScrollRef.current = gameMode === 'ear'; }, [gameMode]);

    // Error markers: capture the score-tick whenever sessionStats.wrongs goes up;
    // clear when it decreases (session reset on song change / restart / completion).
    const [errorTicks, setErrorTicks] = useState<number[]>([]);
    const prevWrongsRef = useRef<number>(0);
    useEffect(() => {
        const w = sessionStats.wrongs;
        if (w > prevWrongsRef.current) {
            const total = totalScoreTicksRef.current;
            if (total > 0) {
                const scoreTick = Math.max(0, Math.min(total, playPositionRef.current));
                setErrorTicks(prev => [...prev, scoreTick]);
            }
        } else if (w < prevWrongsRef.current) {
            setErrorTicks([]);
        }
        prevWrongsRef.current = w;
    }, [sessionStats.wrongs]);

    // When the cursor is moved (drag / minimap / seek), erase markers ahead of it.
    const lastPlayPosRef = useRef<number>(0);
    useEffect(() => {
        const prev = lastPlayPosRef.current;
        lastPlayPosRef.current = playPosition;

        const isSeeking =
            isDragging.current ||
            isMinimapDragging.current ||
            Math.abs(playPosition - prev) > 80;
        if (!isSeeking) return;

        const cutoff = Math.max(0, playPosition);
        setErrorTicks(curr => curr.filter(t => t <= cutoff));
    }, [playPosition]);

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
                        const screenW = app.screen.width;
                        const maxScroll = screenW * 0.05 + stickyWidthRef.current * scale;
                        const minScroll = -totalWidthRef.current * scale + screenW * 0.5;
                        newX = Math.max(minScroll, Math.min(newX, maxScroll));

                        scrollContainerRef.current.x = newX;

                        const hitLineScreenX = screenW * 0.05 + stickyWidthRef.current * scale;
                        const targetGlobalX = (hitLineScreenX - newX) / scale;

                        const mData = writtenDataRef.current;
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
                    }
                });

                // Ticker: scroll the score so the current position sits under the
                // fixed cursor line. Reads playPosition via ref (never re-registered).
                let lastHitLineX = -1;
                const update = () => {
                    if (!scrollContainerRef.current || !cursorRef.current) return;

                    const scale = scaleRef.current;
                    const screenW = app.screen.width;
                    const hitLineScreenX = screenW * 0.05 + stickyWidthRef.current * scale;

                    if (Math.abs(hitLineScreenX - lastHitLineX) > 0.5) {
                        cursor.clear();
                        cursor.rect(hitLineScreenX, 0, 4, app.screen.height);
                        cursor.fill(CURSOR_HEX);
                        lastHitLineX = hitLineScreenX;
                    }

                    if (!isDragging.current && measureDataRef.current.length > 0) {
                        const scoreTick = playPositionRef.current;

                        const mData = measureDataRef.current;
                        let globalX = 0;

                        // Park the cursor at the first real measure while inside
                        // the n="0" count-in measure (which doubles as the sticky
                        // clef strip and never scrolls).
                        const musicStartTick = mData.length > 1 ? mData[1].startTick : 0;
                        if (scoreTick <= musicStartTick) {
                            globalX = mData.length > 1 ? mData[1].x : mData[0].x;
                        } else if (scoreTick >= mData[mData.length - 1].endTick) {
                            globalX = mData[mData.length - 1].x + mData[mData.length - 1].width;
                        } else {
                            const mIndex = findMeasureAtTick(mData, scoreTick);
                            const m = mData[mIndex];
                            const progress = (scoreTick - m.startTick) / (m.endTick - m.startTick);
                            globalX = m.x + progress * m.width;
                        }

                        const targetScrollX = hitLineScreenX - globalX * scale;
                        const currentX = scrollContainerRef.current.x;
                        if (Math.abs(currentX - targetScrollX) > 0.5) {
                            // By ear the page glides to each new place instead
                            // of jumping, always towards the latest target — a
                            // quick player skips ahead, nothing queues up.
                            // Everywhere else it is locked to the transport.
                            scrollContainerRef.current.x = easeScrollRef.current
                                ? currentX + (targetScrollX - currentX) * (1 - Math.exp(-app.ticker.deltaMS / EAR_SCROLL_EASE_MS))
                                : targetScrollX;
                        }
                    }

                    // The loop's start sign waits at the cursor once the music
                    // has scrolled past it — while dragging too.
                    loopMarks.follow(scrollContainerRef.current.x, hitLineScreenX);

                    // Drive the minimap playhead in lockstep with the score scroll
                    const playheadEl = playheadRef.current;
                    const totalTicks = totalScoreTicksRef.current;
                    if (playheadEl && totalTicks > 0) {
                        const scoreTick = playPositionRef.current;
                        const pct = Math.max(0, Math.min(100, (scoreTick / totalTicks) * 100));
                        playheadEl.style.left = `${pct}%`;
                    }
                };
                app.ticker.add(update);
            }
        };

        if (!appRef.current) {
            initPixi().catch(console.error);
        }

        return () => {
            isMounted = false;
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
            // Rasterised close to display size: the single staff fills a ~45vh
            // band and Pixi upscales up to 2× — a small render scale turns
            // into visible blur.
            scale: 140,
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
                        const countIn = ensureCountInMeasure(xmlDoc);
                        const ids = ensureNoteIds(xmlDoc);
                        if (countIn || ids) {
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

        // processSvgToPixi is left out on purpose: it is redefined every
        // render, and listing it would reload the score each time. It reads
        // only refs and stable setters, so the first render's copy is right.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolkit, loadTimemap, selectedSong]);

    const processSvgToPixi = async (svgString: string, hiddenDiv: HTMLDivElement, timemapData: TimemapData) => {
        if (!appRef.current) return;
        setLoadingMsg('Slicing Textures...');
        const measures = Array.from(hiddenDiv.querySelectorAll('.system .measure'));
        if (measures.length === 0) {
            setLoadingMsg('Error: No measures found');
            return;
        }

        const svgOuterBBox = hiddenDiv.querySelector('svg')?.getBoundingClientRect() || { left: 0, top: 0, width: 0 };
        const measureBBoxes = measures.map(m => m.getBoundingClientRect());
        // Each note's left edge, for Learn by ear's veil; the staff lines, for
        // the loop's repeat signs.
        const noteLeft = measureNoteLefts(hiddenDiv, svgOuterBBox.left);
        const staves = measureStaffLines(hiddenDiv, svgOuterBBox.top);

        // The measures on the page, placed in time (utils/placeMeasures.ts): as
        // played, a repeat's second time on the bars it repeats, for following
        // the playhead; as written, for finding the time at a place on the page.
        // Measure ticks come from the Verovio timemap: exact values that handle
        // the n="0" count-in measure, pickups, meter changes and irregular bars.
        // The SVG measure ids match the timemap ids because both come from the
        // same loadData call.
        const drawn = measures.map((m, index) => {
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
            return { id: m.id, x, width };
        });
        const { played: mData, written } = placeMeasures(drawn, timemapData);

        measureDataRef.current = mData;
        writtenDataRef.current = written;

        stickyWidthRef.current = mData[0].width + 25;
        totalWidthRef.current = svgOuterBBox.width;

        // Minimap: per-measure boundary percentages + total tick range.
        const totalTicks = mData[mData.length - 1].endTick;
        totalScoreTicksRef.current = totalTicks;
        if (totalTicks > 0) {
            const positions = mData
                .slice(1)
                .map(m => (m.startTick / totalTicks) * 100)
                .concat(100);
            setTickPositions(positions);
        } else {
            setTickPositions([]);
        }

        veil.reset();
        loopMarks.reset();
        if (scrollContainerRef.current) {
            scrollContainerRef.current.removeChildren().forEach(child => child.destroy({ texture: true }));
        }

        // Dispose the sticky clef strip left over from a previous song load —
        // it lives on the stage, so clearing the scroll container never touches it.
        if (stickyContainerRef.current) {
            appRef.current.stage.removeChild(stickyContainerRef.current);
            stickyContainerRef.current.destroy({ children: true, texture: true, textureSource: true });
            stickyContainerRef.current = null;
        }

        const img = await loadSvgImage(svgString);

        const TEXTURE_HEIGHT = Math.max(200, img.height || 1000);
        const totalW = Math.max(1, img.width || totalWidthRef.current);

        // Single staff has vertical room — allow a larger scale-up than the piano.
        const scaleFactor = Math.min(2, appRef.current.screen.height / TEXTURE_HEIGHT);
        scaleRef.current = scaleFactor;

        if (scrollContainerRef.current) {
            scrollContainerRef.current.scale.set(scaleFactor);
        }

        const targetY = (appRef.current.screen.height / scaleFactor - TEXTURE_HEIGHT) / 2;

        const res = Math.min(window.devicePixelRatio || 1, 2);
        const page = { top: targetY, height: TEXTURE_HEIGHT, width: totalW, res, staffMidY: null };
        for (const sprite of sliceToSprites(img, page)) scrollContainerRef.current?.addChild(sprite);
        veil.attach({ page, svg: svgString, noteLeft });

        // Sticky Overlay Sprite — pins the clef/key-sig strip at the left edge
        // (device-resolution raster, like the slices).
        const screenW = appRef.current.screen.width;
        const stickyW = stickyWidthRef.current;
        const stickyCanvas = document.createElement('canvas');
        stickyCanvas.width = Math.ceil(stickyW * res);
        stickyCanvas.height = Math.ceil(TEXTURE_HEIGHT * res);
        const stickyCtx = stickyCanvas.getContext('2d');
        if (stickyCtx) {
            stickyCtx.scale(res, res);
            stickyCtx.fillStyle = SCORE_BG_COLOR;
            stickyCtx.fillRect(0, 0, stickyW - 30, TEXTURE_HEIGHT);

            const gradient = stickyCtx.createLinearGradient(stickyW - 30, 0, stickyW, 0);
            gradient.addColorStop(0, 'rgba(136, 136, 136, 1)');
            gradient.addColorStop(1, 'rgba(136, 136, 136, 0)');
            stickyCtx.fillStyle = gradient;
            stickyCtx.fillRect(stickyW - 30, 0, 30, TEXTURE_HEIGHT);

            stickyCtx.drawImage(img, 0, 0, stickyW, TEXTURE_HEIGHT, 0, 0, stickyW, TEXTURE_HEIGHT);
        }

        const stickyContainer = new PIXI.Container();
        const stickyTexture = PIXI.Texture.from(stickyCanvas);
        const stickySprite = new PIXI.Sprite(stickyTexture);
        stickySprite.scale.set(1 / res);

        stickyContainer.scale.set(scaleFactor);
        stickyContainer.x = screenW * 0.05;
        stickyContainer.y = targetY * scaleFactor;

        const leftBg = new PIXI.Graphics();
        leftBg.rect(-4000, 0, 4000, TEXTURE_HEIGHT);
        leftBg.fill({ color: SCORE_BG_HEX });
        stickyContainer.addChild(leftBg);

        stickyContainer.addChild(stickySprite);

        appRef.current.stage.addChild(stickyContainer);
        stickyContainerRef.current = stickyContainer;

        // The loop's repeat signs, the start one over the clef strip.
        const lastMeasure = mData[mData.length - 1];
        loopMarks.attach({
            top: targetY,
            scale: scaleFactor,
            measures: mData.map(m => ({ startTick: m.startTick, x: m.x })),
            end: { tick: lastMeasure.endTick, x: lastMeasure.x + lastMeasure.width },
            staves,
            overlay: appRef.current.stage,
        });

        if (cursorRef.current) {
            appRef.current.stage.setChildIndex(cursorRef.current, appRef.current.stage.children.length - 1);
        }

        setLoadingMsg('');

        seek(0);
    };

    const stepIndex = LOADING_STEPS.indexOf(loadingMsg);
    const isError = loadingMsg.startsWith('Error');

    const seekFromMinimap = (clientX: number) => {
        const el = minimapRef.current;
        const totalTicks = totalScoreTicksRef.current;
        if (!el || totalTicks <= 0) return;
        const rect = el.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        seek(pct * totalTicks);
    };

    const onMinimapDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (totalScoreTicksRef.current <= 0) return;
        isMinimapDragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (isPlayingRef.current) {
            setIsPlaying(false);
            Tone.getTransport().pause();
        }
        seekFromMinimap(e.clientX);
    };
    const onMinimapMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isMinimapDragging.current) seekFromMinimap(e.clientX);
    };
    const onMinimapUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isMinimapDragging.current) return;
        isMinimapDragging.current = false;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
    };

    return (
        // A bounded band, vertically centered by the parent column — a single
        // staff in a full-height canvas reads as a huge gray wall.
        <div style={{ position: 'relative', width: '100%', height: 'min(100%, 48vh)', minHeight: '200px', overflow: 'hidden', background: SCORE_BG_COLOR, touchAction: 'none' }}>
            {loadingMsg && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    zIndex: 20, color: 'white', background: SCORE_BG_COLOR,
                }}>
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
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                {LOADING_STEPS.map((_, i) => (
                                    <div key={i} style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: i <= stepIndex ? 'var(--color-accent)' : '#555',
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

            {/* Minimap */}
            {!loadingMsg && tickPositions.length > 0 && (
                <div
                    ref={minimapRef}
                    onPointerDown={onMinimapDown}
                    onPointerMove={onMinimapMove}
                    onPointerUp={onMinimapUp}
                    onPointerCancel={onMinimapUp}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '14px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        cursor: 'pointer',
                        zIndex: 10,
                        touchAction: 'none',
                        userSelect: 'none',
                    }}
                >
                    {tickPositions.map((pct, i) => (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                top: '3px',
                                bottom: '3px',
                                left: `${pct}%`,
                                width: '1px',
                                background: 'rgba(255, 255, 255, 0.35)',
                                pointerEvents: 'none',
                            }}
                        />
                    ))}
                    <LoopRangeSelector />
                    {errorTicks.map((tick, i) => {
                        const total = totalScoreTicksRef.current;
                        const pct = total > 0 ? Math.max(0, Math.min(100, (tick / total) * 100)) : 0;
                        return (
                            <div
                                key={`err-${i}`}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    bottom: 0,
                                    left: `${pct}%`,
                                    width: '2px',
                                    marginLeft: '-1px',
                                    background: '#f87171',
                                    boxShadow: '0 0 3px rgba(248, 113, 113, 0.7)',
                                    pointerEvents: 'none',
                                }}
                            />
                        );
                    })}
                    <div
                        ref={playheadRef}
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: '0%',
                            width: '3px',
                            marginLeft: '-1.5px',
                            background: 'var(--color-accent)',
                            boxShadow: '0 0 4px var(--color-accent-glow)',
                            pointerEvents: 'none',
                        }}
                    />
                </div>
            )}

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

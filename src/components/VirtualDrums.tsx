import React, { useMemo, useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';

interface DrumMapItem {
    id: string;
    label: string;
    color: string;
    uiShape: 'circle' | 'cross' | 'diamond' | 'plus' | 'slash';
    match: { pname: string, oct: string, "head.shape"?: string, "head.fill"?: string };
    order: number;
}

const DRUM_MAP: DrumMapItem[] = [
    { id: 'Cymbal', label: 'CY', color: '#2ade2a', uiShape: 'cross', match: { pname: 'a', oct: '5', 'head.shape': 'x' }, order: 12 },
    { id: 'OpenHiHat', label: 'OH', color: '#2ade2a', uiShape: 'plus', match: { pname: 'g', oct: '5', 'head.shape': '+' }, order: 11 },
    { id: 'ClosedHiHat', label: 'CH', color: '#2ade2a', uiShape: 'cross', match: { pname: 'g', oct: '5', 'head.shape': 'x' }, order: 10 },
    { id: 'Tambourine', label: 'TB', color: '#2ade2a', uiShape: 'diamond', match: { pname: 'f', oct: '5', 'head.shape': 'diamond', 'head.fill': 'void' }, order: 9 },
    { id: 'Cowbell', label: 'CB', color: '#2ade2a', uiShape: 'diamond', match: { pname: 'f', oct: '5', 'head.shape': 'diamond' }, order: 8 },
    { id: 'HighTom', label: 'HT', color: '#2ade2a', uiShape: 'circle', match: { pname: 'e', oct: '5' }, order: 7 },
    { id: 'MediumTom', label: 'MT', color: '#2ade2a', uiShape: 'circle', match: { pname: 'd', oct: '5' }, order: 6 },
    { id: 'RimShot', label: 'RS', color: '#1a1aff', uiShape: 'slash', match: { pname: 'c', oct: '5', 'head.shape': 'slash' }, order: 5 },
    { id: 'SnareDrum', label: 'SD', color: '#1a1aff', uiShape: 'circle', match: { pname: 'c', oct: '5' }, order: 4 },
    { id: 'Clap', label: 'CP', color: '#2ade2a', uiShape: 'cross', match: { pname: 'e', oct: '4', 'head.shape': 'x' }, order: 3 },
    { id: 'LowTom', label: 'LT', color: '#2ade2a', uiShape: 'circle', match: { pname: 'a', oct: '4' }, order: 2 },
    { id: 'BassDrum', label: 'BD', color: '#ff1a1a', uiShape: 'circle', match: { pname: 'f', oct: '4' }, order: 1 },
];

interface ParsedNote {
    tick: number;
    instrumentId: string;
}

export const VirtualDrums: React.FC = () => {
    const { playPosition, selectedSong } = useGame();
    const [meiNotes, setMeiNotes] = useState<ParsedNote[]>([]);
    const [gridConfig, setGridConfig] = useState({ columns: 16, ticksPerColumn: 48, ticksPerMeasure: 768 });

    useEffect(() => {
        if (!selectedSong) return;

        const path = selectedSong.startsWith('/') ? selectedSong : `/${selectedSong}`;
        fetch(path)
            .then(res => res.text())
            .then(xmlText => {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                const notes: ParsedNote[] = [];
                const TICKS_PER_QUARTER = 192; // Tone.js default PPQ

                const findInstrument = (el: Element): string | null => {
                    const pname = el.getAttribute('pname');
                    const oct = el.getAttribute('oct');
                    const headShape = el.getAttribute('head.shape');
                    const headFill = el.getAttribute('head.fill');

                    for (const drum of DRUM_MAP) {
                        let matches = drum.match.pname === pname && drum.match.oct === oct;
                        if (drum.match['head.shape'] !== undefined) {
                            matches = matches && drum.match['head.shape'] === headShape;
                        } else if (headShape) {
                            // If MEI specifies a head shape but our map doesn't expect one, skip matching this rule unless it's default
                            matches = false;
                        }
                        if (drum.match['head.fill'] !== undefined) {
                            matches = matches && drum.match['head.fill'] === headFill;
                        }
                        if (matches) return drum.id;
                    }
                    return null;
                };

                const parseDuration = (node: Element, modifier: number): number => {
                    const durStr = node.getAttribute('dur');
                    if (!durStr) return 0;
                    const durInt = parseInt(durStr, 10);
                    if (isNaN(durInt) || durInt === 0) return 0;

                    let baseTicks = (4 / durInt) * TICKS_PER_QUARTER;
                    if (node.getAttribute('dots') === '1') {
                        baseTicks *= 1.5;
                    }
                    return baseTicks * modifier;
                };

                const scoreDef = xmlDoc.querySelector('scoreDef');
                const meterSig = xmlDoc.querySelector('meterSig');

                let meterCount = 4;
                let meterUnit = 4;

                if (meterSig) {
                    if (meterSig.getAttribute('count')) meterCount = parseInt(meterSig.getAttribute('count')!, 10);
                    if (meterSig.getAttribute('unit')) meterUnit = parseInt(meterSig.getAttribute('unit')!, 10);
                } else if (scoreDef) {
                    if (scoreDef.getAttribute('meter.count')) meterCount = parseInt(scoreDef.getAttribute('meter.count')!, 10);
                    if (scoreDef.getAttribute('meter.unit')) meterUnit = parseInt(scoreDef.getAttribute('meter.unit')!, 10);
                }

                // Check for heavy triplet usage (tuplet tags or tuplet number attributes)
                const hasTuplets = xmlDoc.querySelectorAll('tuplet').length > 0 || xmlDoc.querySelectorAll('note[num="3"], chord[num="3"]').length > 0;

                // 12/8 or 4/4 with triplets uses 8th notes (but effectively 12 columns if 4/4). Other signatures use 16th notes.
                const is12_8_feel = (meterCount === 12 && meterUnit === 8) || (meterCount === 4 && meterUnit === 4 && hasTuplets);

                let ticksPerColumn = TICKS_PER_QUARTER / 4; // Default to 16th note columns
                let measureLengthQuarters = meterCount * (4 / meterUnit);
                let columns = 16;
                let ticksPerMeasure = measureLengthQuarters * TICKS_PER_QUARTER;

                if (is12_8_feel) {
                    if (meterCount === 12 && meterUnit === 8) {
                        // In 12/8, the measure is 6 quarter notes long (12 eighths)
                        ticksPerColumn = TICKS_PER_QUARTER / 2; // Eighth note length (96 ticks)
                        columns = 12;
                        ticksPerMeasure = columns * ticksPerColumn; // 12 * 96 = 1152 ticks
                    } else {
                        // 4/4 triplet feel
                        ticksPerColumn = Math.round(TICKS_PER_QUARTER / 3); // 64 ticks
                        columns = 12;
                        ticksPerMeasure = columns * ticksPerColumn; // 12 * 64 = 768 ticks
                    }
                } else {
                    columns = Math.round(ticksPerMeasure / ticksPerColumn);
                }

                setGridConfig({ columns, ticksPerColumn, ticksPerMeasure });

                const measures = xmlDoc.getElementsByTagName('measure');
                let globalTick = 0;

                for (let i = 0; i < measures.length; i++) {
                    const measure = measures[i];

                    // Skip measure 0 (the count-in)
                    if (measure.getAttribute('n') === '0') continue;

                    const layers = measure.getElementsByTagName('layer');
                    for (let l = 0; l < layers.length; l++) {
                        const layer = layers[l];
                        let layerTick = globalTick;

                        const processNode = (node: Element, inheritedModifier: number = 1) => {
                            let modifier = inheritedModifier;

                            if (node.tagName === 'tuplet' || node.tagName === 'beam') {
                                if (node.hasAttribute('num') && node.hasAttribute('numbase')) {
                                    const numStr = node.getAttribute('num');
                                    const numbaseStr = node.getAttribute('numbase');
                                    const num = numStr ? parseInt(numStr, 10) : 3;
                                    const numbase = numbaseStr ? parseInt(numbaseStr, 10) : 2;
                                    if (num > 0) modifier *= (numbase / num);
                                }
                            }

                            if (node.tagName === 'note') {
                                let noteModifier = inheritedModifier;
                                if (node.hasAttribute('num') && node.hasAttribute('numbase')) {
                                    const numStr = node.getAttribute('num');
                                    const numbaseStr = node.getAttribute('numbase');
                                    const num = numStr ? parseInt(numStr, 10) : 3;
                                    const numbase = numbaseStr ? parseInt(numbaseStr, 10) : 2;
                                    if (num > 0) noteModifier *= (numbase / num);
                                }
                                const instId = findInstrument(node);
                                if (instId) notes.push({ tick: Math.round(layerTick), instrumentId: instId });
                                if (node.parentElement?.tagName !== 'chord') {
                                    layerTick += parseDuration(node, noteModifier);
                                }
                            } else if (node.tagName === 'rest' || node.tagName === 'space') {
                                let restModifier = inheritedModifier;
                                if (node.hasAttribute('num') && node.hasAttribute('numbase')) {
                                    const numStr = node.getAttribute('num');
                                    const numbaseStr = node.getAttribute('numbase');
                                    const num = numStr ? parseInt(numStr, 10) : 3;
                                    const numbase = numbaseStr ? parseInt(numbaseStr, 10) : 2;
                                    if (num > 0) restModifier *= (numbase / num);
                                }
                                layerTick += parseDuration(node, restModifier);
                            } else if (node.tagName === 'chord') {
                                let chordModifier = inheritedModifier;
                                if (node.hasAttribute('num') && node.hasAttribute('numbase')) {
                                    const numStr = node.getAttribute('num');
                                    const numbaseStr = node.getAttribute('numbase');
                                    const num = numStr ? parseInt(numStr, 10) : 3;
                                    const numbase = numbaseStr ? parseInt(numbaseStr, 10) : 2;
                                    if (num > 0) chordModifier *= (numbase / num);
                                }
                                const chordNotes = node.getElementsByTagName('note');
                                for (let n = 0; n < chordNotes.length; n++) {
                                    const instId = findInstrument(chordNotes[n]);
                                    if (instId) notes.push({ tick: Math.round(layerTick), instrumentId: instId });
                                }
                                layerTick += parseDuration(node, chordModifier);
                            } else if (node.tagName === 'beam' || node.tagName === 'tuplet') {
                                const children = Array.from(node.children);
                                for (const child of children) {
                                    processNode(child, modifier);
                                }
                            }
                        };

                        const children = Array.from(layer.children);
                        for (const child of children) {
                            processNode(child);
                        }
                    }
                    globalTick += gridConfig.ticksPerMeasure;
                }
                setMeiNotes(notes);
            })
            .catch(console.error);
    }, [selectedSong]);

    const OFFSET_TICKS = 192; // 1 beat count-in from GameContext logic

    // Derived Data for Grid
    const { activeInstruments, gridData, currentColumn } = useMemo(() => {
        // Find current measure and column
        // Since playPosition is absolute, but meiNotes starts playing at playPosition = OFFSET_TICKS (from measure 1)
        // Note: Because we skipped measure 0, measure 1 starts at globalTick = 0.
        // Therefore, scoreTick 0 lines up with globalTick 0 seamlessly!
        const scoreTick = Math.max(0, playPosition - OFFSET_TICKS);
        const curMeasure = Math.floor(scoreTick / gridConfig.ticksPerMeasure);
        const tickInMeasure = scoreTick % gridConfig.ticksPerMeasure;
        const curCol = Math.floor(tickInMeasure / gridConfig.ticksPerColumn);

        const activeIds = new Set<string>();
        // gridData[instrumentId][colIndex] = true
        const grid: Record<string, boolean[]> = {};

        const measureStartTick = curMeasure * gridConfig.ticksPerMeasure;
        const measureEndTick = measureStartTick + gridConfig.ticksPerMeasure;

        meiNotes.forEach(note => {
            activeIds.add(note.instrumentId);
            if (!grid[note.instrumentId]) {
                grid[note.instrumentId] = Array(gridConfig.columns).fill(false);
            }

            // Map matching measure notes
            if (note.tick >= measureStartTick && note.tick < measureEndTick) {
                const localTick = note.tick - measureStartTick;
                const col = Math.floor(localTick / gridConfig.ticksPerColumn);
                if (col >= 0 && col < gridConfig.columns) {
                    grid[note.instrumentId][col] = true;
                }
            }
        });

        // Filter valid configurations and sort them
        const configs = Array.from(activeIds)
            .map(id => DRUM_MAP.find(d => d.id === id))
            .filter((c): c is DrumMapItem => !!c)
            .sort((a, b) => b.order - a.order);

        return {
            activeInstruments: configs,
            gridData: grid,
            currentMeasure: curMeasure,
            currentColumn: curCol,
        };
    }, [meiNotes, playPosition, gridConfig]); // Added gridConfig to dependencies

    if (!selectedSong || activeInstruments.length === 0) return null;

    const { columns } = gridConfig;

    return (
        <div style={{
            width: '100%',
            backgroundColor: 'var(--color-bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '10px 0',
            borderTop: '1px solid #333',
            overflowX: 'auto'
        }}>
            <div style={{
                display: 'grid',
                border: '1px solid #333',
                gridTemplateColumns: `50px repeat(${columns}, 40px)`,
                gridAutoRows: '40px',
                background: '#1A1A1A'
            }}>
                {activeInstruments.map((config) => {
                    return (
                        <React.Fragment key={config.id}>
                            <div style={{
                                width: '100%', height: '100%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 'bold', color: '#aaa',
                                borderRight: '1px solid #333', borderBottom: '1px solid #333'
                            }}>
                                {config.label}
                            </div>

                            {Array.from({ length: columns }).map((_, cIndex) => {
                                const hasNote = gridData[config.id]?.[cIndex];
                                const isActiveColumn = cIndex === currentColumn && playPosition >= OFFSET_TICKS;

                                return (
                                    <div key={cIndex} style={{
                                        position: 'relative', width: '100%', height: '100%',
                                        borderRight: '1px solid #333', borderBottom: '1px solid #333',
                                        background: isActiveColumn ? 'rgba(245, 87, 108, 0.25)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {hasNote && <DrumShape type={config.uiShape} color={config.color} />}
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

const DrumShape: React.FC<{ type: DrumMapItem['uiShape'], color: string }> = ({ type, color }) => {
    switch (type) {
        case 'circle':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="7" fill={color} />
                </svg>
            );
        case 'cross':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <line x1="4" y1="4" x2="16" y2="16" stroke={color} strokeWidth="3" strokeLinecap="round" />
                    <line x1="16" y1="4" x2="4" y2="16" stroke={color} strokeWidth="3" strokeLinecap="round" />
                </svg>
            );
        case 'plus':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <line x1="10" y1="3" x2="10" y2="17" stroke={color} strokeWidth="3" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="17" y2="10" stroke={color} strokeWidth="3" strokeLinecap="round" />
                </svg>
            );
        case 'diamond':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <polygon points="10,2 18,10 10,18 2,10" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
                </svg>
            );
        case 'slash':
            return (
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <line x1="16" y1="4" x2="4" y2="16" stroke={color} strokeWidth="3" strokeLinecap="round" />
                </svg>
            );
        default:
            return null;
    }
};

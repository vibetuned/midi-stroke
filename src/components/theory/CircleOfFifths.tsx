import React, { useMemo, useState } from 'react';
import type { VerovioToolkit } from 'verovio/esm';
import { keyAlter } from '../../utils/musicxml';

/**
 * Circle-of-fifths "virtual instrument" for the theory mode: three rings —
 * major keys, their relative minors, and the diminished triad on each key's
 * leading tone. Clicking a sector plays/enters that root (at a chosen
 * octave). The hub engraves the selected key's clef + signature (via
 * Verovio) and lists the scale (or triad) notes. The current exercise key
 * is outlined with the accent color.
 */

const MAJORS = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
const MINORS = ['a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'e♭', 'b♭', 'f', 'c', 'g', 'd'];
// Diminished triad on the leading tone (vii°) of each major key.
const DIMS = ['b', 'f♯', 'c♯', 'g♯', 'd♯', 'a♯', 'f', 'c', 'g', 'd', 'a', 'e'];
// Tonic pitch class of the major key at each wheel position (C at 12 o'clock).
const MAJOR_PC = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

type Ring = 'major' | 'minor' | 'dim';

const R_OUT = 104;
const R_MAJ = 80;
const R_MIN = 58;
const R_HUB = 40;
const LETTERS = 'CDEFGAB';

interface CircleOfFifthsProps {
    /** Exercise key in music21 style ("C", "a", "E-") — its sector gets outlined. */
    highlightKey?: string;
    /** Called with the root MIDI number when a sector is clicked. */
    onNoteInput?: (midi: number) => void;
    /** Shared Verovio toolkit, used to engrave the hub's key signature. */
    toolkit?: VerovioToolkit | null;
}

function polar(radius: number, angleDeg: number): [number, number] {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return [radius * Math.cos(rad), radius * Math.sin(rad)];
}

/** Annular sector path centered on the given wheel position (30° each). */
function sectorPath(index: number, rOut: number, rIn: number): string {
    const a0 = index * 30 - 15;
    const a1 = index * 30 + 15;
    const [x0, y0] = polar(rOut, a0);
    const [x1, y1] = polar(rOut, a1);
    const [x2, y2] = polar(rIn, a1);
    const [x3, y3] = polar(rIn, a0);
    return `M ${x0} ${y0} A ${rOut} ${rOut} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${rIn} ${rIn} 0 0 0 ${x3} ${y3} Z`;
}

/**
 * Key signature (in fifths) for a wheel position. Position 6 is the
 * enharmonic seam: the major ring shows F♯ (+6) while the minor/dim rings
 * show the flat-side spellings (e♭, f) that belong to G♭ (-6).
 */
function effectiveFifths(ring: Ring, index: number): number {
    if (index === 6) return ring === 'major' ? 6 : -6;
    return index <= 6 ? index : index - 12;
}

function ringName(ring: Ring, index: number): string {
    return ring === 'major' ? MAJORS[index] : ring === 'minor' ? MINORS[index] : DIMS[index];
}

function alterSymbol(alter: number): string {
    return alter === 1 ? '♯' : alter === -1 ? '♭' : '';
}

/** Scale notes (major/minor) or triad notes (dim) of a wheel position. */
function scaleNotes(ring: Ring, index: number): string[] {
    const fifths = effectiveFifths(ring, index);
    const startLetter = ringName(ring, index)[0].toUpperCase();
    const count = ring === 'dim' ? 3 : 7;
    const step = ring === 'dim' ? 2 : 1;
    const start = LETTERS.indexOf(startLetter);
    return Array.from({ length: count }, (_, k) => {
        const letter = LETTERS[(start + k * step) % 7];
        return letter + alterSymbol(keyAlter(letter, fifths));
    });
}

/** Parse "C" / "a" / "E-" / "f#" into a wheel position + ring, or null. */
function parseKey(key: string | undefined): { index: number; ring: Ring } | null {
    if (!key) return null;
    const m = key.trim().match(/^([A-Ga-g])([#-]?)$/);
    if (!m) return null;
    const isMajor = m[1] === m[1].toUpperCase();
    const basePc: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let pc = basePc[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === '-' ? -1 : 0);
    pc = ((pc % 12) + 12) % 12;
    for (let i = 0; i < 12; i++) {
        const majorPc = MAJOR_PC[i];
        const minorPc = (majorPc + 9) % 12;
        if (isMajor && majorPc === pc) return { index: i, ring: 'major' };
        if (!isMajor && minorPc === pc) return { index: i, ring: 'minor' };
    }
    return null;
}

/** Minimal MusicXML whose render is just a clef + key signature. */
function keySignatureXml(fifths: number): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name/></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><clef><sign>G</sign><line>2</line></clef></attributes>
      <note print-object="no"><rest measure="yes"/><duration>16</duration></note>
    </measure>
  </part>
</score-partwise>`;
}

export const CircleOfFifths: React.FC<CircleOfFifthsProps> = ({ highlightKey, onNoteInput, toolkit }) => {
    const highlighted = useMemo(() => parseKey(highlightKey), [highlightKey]);
    const [hovered, setHovered] = useState<string | null>(null);
    // Start on the exercise's key so the hub is meaningful right away
    const [selected, setSelected] = useState<string | null>(
        () => highlighted ? `${highlighted.ring}:${highlighted.index}` : 'major:0');
    const [octave, setOctave] = useState(4);

    const handleClick = (index: number, ring: Ring) => {
        setSelected(`${ring}:${index}`);
        const majorPc = MAJOR_PC[index];
        const pc = ring === 'major' ? majorPc : ring === 'minor' ? (majorPc + 9) % 12 : (majorPc + 11) % 12;
        onNoteInput?.((octave + 1) * 12 + pc);
    };

    const active = hovered ?? selected;
    const [activeRing, activeIndex] = active
        ? [active.split(':')[0] as Ring, parseInt(active.split(':')[1], 10)]
        : ['major' as Ring, 0];
    const activeName = active
        ? `${ringName(activeRing, activeIndex)}${activeRing === 'dim' ? '°' : ''} ${activeRing === 'dim' ? 'dim' : activeRing}`
        : '';
    const activeScale = active ? scaleNotes(activeRing, activeIndex) : [];

    // Engrave the active key's clef + signature; nested into the hub as an
    // inner <svg> so it scales with the wheel.
    const keySigSvg = useMemo(() => {
        if (!toolkit || !active) return null;
        const [ring, indexStr] = active.split(':');
        const fifths = effectiveFifths(ring as Ring, parseInt(indexStr, 10));
        try {
            toolkit.setOptions({
                breaks: 'none', adjustPageWidth: true, adjustPageHeight: true,
                svgViewBox: true, header: 'none', footer: 'none', scale: 100,
                measureMinWidth: 1,
                pageMarginLeft: 0, pageMarginRight: 0, pageMarginTop: 0, pageMarginBottom: 0,
            });
            toolkit.loadData(keySignatureXml(fifths));
            return toolkit.renderToSVG(1, {})
                .replace('<svg ', '<svg x="-27" y="-19" width="54" height="28" ');
        } catch {
            return null;
        }
    }, [toolkit, active]);

    const sector = (index: number, ring: Ring) => {
        const id = `${ring}:${index}`;
        const isHover = hovered === id;
        const isSelected = selected === id;
        const isKey = highlighted?.ring === ring && highlighted.index === index;
        const [rOut, rIn] = ring === 'major' ? [R_OUT, R_MAJ] : ring === 'minor' ? [R_MAJ, R_MIN] : [R_MIN, R_HUB];
        const labelR = (rOut + rIn) / 2;
        const [lx, ly] = polar(labelR, index * 30);
        const baseFill = ring === 'major' ? '#2b2b34' : ring === 'minor' ? '#23232c' : '#1d1d25';
        const baseText = ring === 'major' ? '#e8e8e8' : ring === 'minor' ? '#a8a8b6' : '#84848f';
        return (
            <g
                key={id}
                onPointerDown={() => handleClick(index, ring)}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(h => (h === id ? null : h))}
                style={{ cursor: 'pointer' }}
            >
                <path
                    d={sectorPath(index, rOut, rIn)}
                    fill={isSelected ? 'var(--color-accent)' : isHover ? '#3a3a48' : baseFill}
                    stroke={isKey ? 'var(--color-accent)' : '#111'}
                    strokeWidth={isKey ? 2.5 : 1}
                />
                <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isSelected ? '#fff' : isKey ? 'var(--color-accent)' : baseText}
                    fontSize={ring === 'major' ? 13 : ring === 'minor' ? 10 : 8}
                    fontFamily="system-ui, sans-serif"
                    fontWeight={isKey || isSelected ? 700 : 500}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                    {ringName(ring, index)}{ring === 'dim' ? '°' : ''}
                </text>
            </g>
        );
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}>
            <svg
                viewBox="-110 -110 220 220"
                role="img"
                aria-label="Circle of fifths"
                style={{ width: 'min(100%, 350px)', aspectRatio: '1 / 1', height: 'auto', flexShrink: 1, minWidth: 0 }}
            >
                {Array.from({ length: 12 }, (_, i) => sector(i, 'major'))}
                {Array.from({ length: 12 }, (_, i) => sector(i, 'minor'))}
                {Array.from({ length: 12 }, (_, i) => sector(i, 'dim'))}

                {/* Hub: engraved key signature + scale notes on a dark disc
                    that continues the rings' inward-darkening pattern. The
                    engraving is monochrome black, so we invert it to white. */}
                <circle r={R_HUB - 2} fill="#17171e" stroke="#111" />
                <text x={0} y={-27} textAnchor="middle" fill="#e8e8e8" fontSize={8.5} fontWeight={700}
                    fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {activeName}
                </text>
                {keySigSvg && <g style={{ filter: 'invert(1)' }} dangerouslySetInnerHTML={{ __html: keySigSvg }} />}
                <text x={0} y={26} textAnchor="middle" fill="#5cc99a" fontSize={6.5} fontWeight={600}
                    fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {activeScale.join(' ')}
                </text>
            </svg>

            {/* Octave picker: which octave a clicked root is entered at */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                <button
                    onClick={() => setOctave(o => Math.min(6, o + 1))}
                    style={octaveButtonStyle}
                    title="Octave up"
                >▲</button>
                <div style={{ color: 'var(--color-text-secondary, #aaa)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    oct {octave}
                </div>
                <button
                    onClick={() => setOctave(o => Math.max(2, o - 1))}
                    style={octaveButtonStyle}
                    title="Octave down"
                >▼</button>
            </div>
        </div>
    );
};

const octaveButtonStyle: React.CSSProperties = {
    width: '30px',
    height: '24px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '0.65rem',
};

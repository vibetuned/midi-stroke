import React, { memo } from 'react';

import * as Tone from 'tone';

import { useMidi } from '../../hooks/useMidi';

import { useGameLogic, SAXO_INPUT_TRANSPOSE_SEMITONES } from '../../hooks/useGameLogic';

import { getSaxoFingering, type AuxKey, type SaxoFingering } from './saxoFingering';



// How a drawn key derives its pressed state from a fingering:

// {main:n} → fingering.main includes n ; {oct} → fingering.oct ;

// {aux:x} → fingering.aux includes x ; {deco} → decorative, never lit.

type KeyRef = { main: number } | { oct: true } | { aux: AuxKey } | { deco: true };



interface SaxoKey {

    ref: KeyRef;

    shape: 'circle' | 'ellipse' | 'rrect' | 'half';

    label?: string;

    // geometry (per shape)

    cx?: number; cy?: number; r?: number; // circle / half

    rx?: number; ry?: number; rot?: number; // ellipse

    x?: number; y?: number; w?: number; h?: number; rrx?: number; // rrect

    side?: 'top' | 'bottom'; // half

}



// Full alto key layout, traced against a real fingering chart (viewBox 300×560).

const KEYS: SaxoKey[] = [

    // Main front keys

    { ref: { main: 1 }, shape: 'circle', cx: 140, cy: 100, r: 22, label: 'B' },

    { ref: { main: 2 }, shape: 'circle', cx: 140, cy: 163, r: 22, label: 'A' },

    { ref: { main: 3 }, shape: 'circle', cx: 140, cy: 226, r: 22, label: 'G' },

    { ref: { main: 4 }, shape: 'circle', cx: 140, cy: 322, r: 22, label: 'F' },

    { ref: { main: 5 }, shape: 'circle', cx: 140, cy: 385, r: 22, label: 'E' },

    { ref: { main: 6 }, shape: 'circle', cx: 140, cy: 448, r: 22, label: 'D' },

    // Octave (thumb), front F (teardrop), bis

    { ref: { oct: true }, shape: 'ellipse', cx: 92, cy: 120, rx: 10, ry: 25, rot: -12, label: '8' },

    { ref: { aux: 'frontF' }, shape: 'ellipse', cx: 140, cy: 50, rx: 10, ry: 25, rot: 60 },

    { ref: { aux: 'bis' }, shape: 'circle', cx: 172, cy: 132, r: 9 },

    // Palm keys (upper right)

    { ref: { aux: 'palmEb' }, shape: 'ellipse', cx: 220, cy: 80, rx: 12, ry: 26, rot: 160 },

    { ref: { aux: 'palmD' }, shape: 'ellipse', cx: 255, cy: 120, rx: 12, ry: 26, rot: 160 },

    { ref: { aux: 'palmF' }, shape: 'ellipse', cx: 215, cy: 130, rx: 12, ry: 26, rot: 160 },


    // Left pinky table (G#, low C#, low B, low Bb) — at the right-side cluster
    { ref: { aux: 'gsharp' }, shape: 'rrect', x: 180, y: 230, w: 50, h: 20, rrx: 8 },
    { ref: { aux: 'lowB' }, shape: 'rrect', x: 180, y: 260, w: 20, h: 20, rrx: 8 },
    { ref: { aux: 'lowCs' }, shape: 'rrect', x: 210, y: 260, w: 20, h: 20, rrx: 8 },
    { ref: { aux: 'lowBb' }, shape: 'rrect', x: 180, y: 290, w: 50, h: 20, rrx: 8 },

    // Side keys (left column) — side E lights for E6/F6; the others are decorative
    { ref: { aux: 'sideE' }, shape: 'rrect', x: 64, y: 220, w: 20, h: 30, rrx: 9 },
    { ref: { deco: true }, shape: 'rrect', x: 64, y: 260, w: 20, h: 30, rrx: 10 },
    { ref: { deco: true }, shape: 'rrect', x: 64, y: 300, w: 20, h: 30, rrx: 10 },


    // F# / alternate keys (left of RH stack)

    { ref: { deco: true }, shape: 'ellipse', cx: 95, cy: 360, rx: 10, ry: 25, rot: 200 },

    { ref: { deco: true }, shape: 'ellipse', cx: 95, cy: 420, rx: 10, ry: 25, rot: 160 },


    // Right pinky (bottom): low Eb (top half) + low C (bottom half)

    { ref: { aux: 'eb' }, shape: 'half', cx: 140, cy: 512, r: 24, side: 'top' },
    { ref: { aux: 'lowC' }, shape: 'half', cx: 140, cy: 524, r: 24, side: 'bottom' },

];



// Mouthpiece + neck + a single closed body/bell silhouette.

const OUTLINE_D = `

m 50 79 C -6 89 46 97 43 111 Q 123 80 114 193 C 108 320 100 442 111 502 C 121 543 159 554 190 537 C 233 515 276 468 287 396 C 294 354 294 323 264 311 C 242 303 223 308 215 367 C 209 312 201 200 189 120 C 183 96 180 54 130 69 Z

`;



const ON = 'var(--color-accent)';

const OFF = '#2b2b2e';

const STROKE = 'rgba(212,160,23,0.7)';



function isPressed(ref: KeyRef, f: SaxoFingering | null): boolean {

    if (!f) return false;

    if ('main' in ref) return (f.main ?? []).includes(ref.main);

    if ('oct' in ref) return !!f.oct;

    if ('aux' in ref) return (f.aux ?? []).includes(ref.aux);

    return false;

}



const Key: React.FC<{ k: SaxoKey; expected: boolean; active: boolean }> = ({ k, expected, active }) => {

    const fill = active ? ON : OFF;

    const stroke = expected ? '#ffe08a' : active ? '#ffffff' : STROKE;

    const sw = expected ? 3 : active ? 2 : 1.4;

    const style = expected
        ? { filter: 'drop-shadow(0 0 7px var(--color-accent-glow))' }
        : active
            ? { filter: 'drop-shadow(0 0 4px var(--color-accent-glow))' }
            : undefined;



    let shape: React.ReactNode = null;

    if (k.shape === 'circle') {

        shape = <circle cx={k.cx} cy={k.cy} r={k.r} fill={fill} stroke={stroke} strokeWidth={sw} style={style} />;

    } else if (k.shape === 'ellipse') {

        shape = <ellipse cx={k.cx} cy={k.cy} rx={k.rx} ry={k.ry}

            transform={k.rot ? `rotate(${k.rot} ${k.cx} ${k.cy})` : undefined}

            fill={fill} stroke={stroke} strokeWidth={sw} style={style} />;

    } else if (k.shape === 'rrect') {

        shape = <rect x={k.x} y={k.y} width={k.w} height={k.h} rx={k.rrx} fill={fill} stroke={stroke} strokeWidth={sw} style={style} />;

    } else if (k.shape === 'half') {

        const r = k.r!, cx = k.cx!, cy = k.cy!;

        const d = k.side === 'top'

            ? `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`

            : `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy} Z`;

        shape = <path d={d} fill={fill} stroke={stroke} strokeWidth={sw} style={style} />;

    }



    return (

        <g>

            {shape}

            {k.label && (

                <text x={k.cx} y={k.cy} dy="0.34em" textAnchor="middle"

                    fontSize="11" fontFamily="monospace"

                    fill={active ? '#1a1a1a' : expected ? '#ffe08a' : '#9a9aa2'}

                    style={{ userSelect: 'none', pointerEvents: 'none' }}>

                    {k.label}

                </text>

            )}

        </g>

    );

};



// Vertical breath/expression meter shown beside the sax — fills from the bottom
// as the wind-controller breath level rises (green → amber → red).
const BreathMeter: React.FC<{ value: number }> = ({ value }) => {
    const SEGMENTS = 16;
    const level = Math.max(0, Math.min(127, value)) / 127;
    const lit = Math.round(level * SEGMENTS);
    const segs = [];
    for (let i = SEGMENTS - 1; i >= 0; i--) {
        const frac = i / (SEGMENTS - 1);
        // Three golds from the sax theme: deep → accent → light (low → high).
        const color = frac > 0.82 ? '#ffe08a' : frac > 0.55 ? '#d4a017' : '#a07d12';
        const on = i < lit;
        segs.push(
            <div key={i} style={{
                flex: 1,
                background: on ? color : '#242426',
                borderRadius: '2px',
                boxShadow: on ? `0 0 4px ${color}` : 'none',
                opacity: on ? 1 : 0.5,
                transition: 'background 0.04s linear, box-shadow 0.04s linear, opacity 0.04s linear',
            }} />
        );
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: '4px', flex: '0 0 auto' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', width: '16px', minHeight: 0 }}>
                {segs}
            </div>
            <div style={{ fontSize: '0.5rem', color: '#777', fontFamily: 'monospace', letterSpacing: '0.5px' }}>AIR</div>
        </div>
    );
};

export const VirtualSaxo: React.FC = memo(() => {

    const { expectedNotes } = useGameLogic();

    const { activeNotes, breath } = useMidi();



    // Monophonic: a single note is expected at a time — take the highest if the

    // score ever yields more than one.

    const target = expectedNotes.length

        ? Math.max(...expectedNotes.map(e => e.note))

        : null;

    const fingering = target != null ? getSaxoFingering(target) : null;

    // The player's *actual* fingering: map their currently-held controller note
    // into the written domain and look up its canonical fingering.
    const heldDeviceNotes = Array.from(activeNotes.keys());
    const activeWritten = heldDeviceNotes.length
        ? Math.max(...heldDeviceNotes) + SAXO_INPUT_TRANSPOSE_SEMITONES
        : null;
    const activeFingering = activeWritten != null ? getSaxoFingering(activeWritten) : null;

    const noteName = target != null ? Tone.Frequency(target, 'midi').toNote() : '—';

    const outOfRange = target != null && fingering == null;

    const isOpen = !!fingering?.open;

    // Visual "you're holding it" cue (assumes SAXO_INPUT_TRANSPOSE = 0).

    const held = target != null && activeNotes.has(target - SAXO_INPUT_TRANSPOSE_SEMITONES);



    return (

        <div style={{

            width: '100%',

            height: '100%',

            background: '#161617',

            borderRight: '1px solid #2a2a2e',

            display: 'flex',

            flexDirection: 'column',

            alignItems: 'center',

            justifyContent: 'flex-start',

            padding: '1rem 0.5rem',

            boxSizing: 'border-box',

            gap: '0.5rem',

        }}>

            <div style={{ textAlign: 'center', minHeight: '3.2rem' }}>

                <div style={{

                    fontSize: '2.4rem',

                    fontWeight: 700,

                    lineHeight: 1,

                    color: held ? 'var(--color-success)' : 'var(--color-accent)',

                    fontFamily: 'monospace',

                    transition: 'color 0.08s ease',

                }}>

                    {noteName}

                </div>

                <div style={{ fontSize: '0.7rem', color: '#777', marginTop: '0.25rem', letterSpacing: '1px', textTransform: 'uppercase' }}>

                    {target == null ? 'waiting' : outOfRange ? 'out of range' : isOpen ? 'all open' : 'fingering'}

                </div>

            </div>



            <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <svg
                    viewBox="0 0 300 560"
                    style={{ height: '100%', maxWidth: '170px', minHeight: 0 }}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <path d={OUTLINE_D} fill="none" stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                    {KEYS.map((k, i) => (
                        <Key key={i} k={k} expected={isPressed(k.ref, fingering)} active={isPressed(k.ref, activeFingering)} />
                    ))}
                </svg>
                <BreathMeter value={breath} />
            </div>



            <div style={{ fontSize: '0.65rem', color: '#666', textAlign: 'center', fontFamily: 'monospace' }}>

                alto · written pitch

            </div>

        </div>

    );

});
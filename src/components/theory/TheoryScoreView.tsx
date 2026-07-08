import React, { useEffect, useRef } from 'react';
import type { ParsedExercise } from '../../utils/musicxml';
import type { CourseExercise } from '../../utils/course';

interface TheoryScoreViewProps {
    exercise: CourseExercise;
    svg: string | null;
    loading: boolean;
    error: string | null;
    parsed: ParsedExercise | null;
    selectedSlot: number | null;
    revealed: boolean;
    filledSlots: number;
    totalSlots: number;
    /** Correct slots from the last check, or null before any check. */
    correctCount: number | null;
    onSelectMeasure: (measureIndex: number) => void;
}

const SELECTED_FILL = 'rgba(47, 174, 118, 0.16)';
const EDITABLE_FILL = 'rgba(47, 174, 118, 0.05)';

/**
 * Interactive worksheet score. The SVG comes pre-rendered from
 * useTheoryExercise; this component maps clicks on Verovio's g.measure
 * groups back to measure indexes and paints the fillable/selected measures.
 */
export const TheoryScoreView: React.FC<TheoryScoreViewProps> = ({
    exercise, svg, loading, error, parsed, selectedSlot, revealed,
    filledSlots, totalSlots, correctCount, onSelectMeasure,
}) => {
    const scoreRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // After each render of the SVG: overlay the fillable measures and keep
    // the selected one in view (input auto-advances across measures).
    useEffect(() => {
        const container = scoreRef.current;
        if (!container || !parsed || !svg) return;

        container.querySelectorAll('.theory-slot-rect').forEach(r => r.remove());
        const measures = Array.from(container.querySelectorAll('g.measure'));
        const editable = new Set(parsed.slots.map(s => s.measureIndex));
        const selectedMeasure = selectedSlot !== null ? parsed.slots[selectedSlot].measureIndex : -1;

        measures.forEach((g, i) => {
            if (!editable.has(i)) return;
            const bbox = (g as SVGGraphicsElement).getBBox();
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const pad = bbox.height * 0.05;
            rect.setAttribute('class', 'theory-slot-rect');
            rect.setAttribute('x', String(bbox.x - pad));
            rect.setAttribute('y', String(bbox.y - pad));
            rect.setAttribute('width', String(bbox.width + 2 * pad));
            rect.setAttribute('height', String(bbox.height + 2 * pad));
            rect.setAttribute('rx', String(pad));
            rect.setAttribute('fill', i === selectedMeasure && !revealed ? SELECTED_FILL : EDITABLE_FILL);
            // The rect also makes the measure's empty space clickable
            rect.setAttribute('pointer-events', 'all');
            rect.style.cursor = 'pointer';
            g.insertBefore(rect, g.firstChild);
            (g as SVGElement).style.cursor = 'pointer';
        });

        const scroller = scrollRef.current;
        const selected = measures[selectedMeasure] as SVGGElement | undefined;
        if (scroller && selected) {
            const gr = selected.getBoundingClientRect();
            const cr = scroller.getBoundingClientRect();
            if (gr.left < cr.left + 8 || gr.right > cr.right - 8) {
                scroller.scrollBy({
                    left: gr.left - cr.left - (cr.width - gr.width) / 2,
                    behavior: 'smooth',
                });
            }
        }
    }, [svg, parsed, selectedSlot, revealed]);

    const handleClick = (e: React.MouseEvent) => {
        const container = scoreRef.current;
        if (!container) return;
        const g = (e.target as Element).closest('g.measure');
        if (!g) return;
        const index = Array.from(container.querySelectorAll('g.measure')).indexOf(g);
        if (index >= 0) onSelectMeasure(index);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.75rem 1rem' }}>
            {/* Exercise header: title, chips, instructions */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{exercise.title}</h3>
                    <span style={chipStyle}>{exercise.type}</span>
                    <span style={chipStyle}>key: {exercise.key}</span>
                    <span style={{ ...chipStyle, color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}>
                        {filledSlots}/{totalSlots} filled
                    </span>
                    {correctCount !== null && (
                        <span style={{
                            ...chipStyle,
                            color: correctCount === totalSlots ? 'var(--color-accent)' : '#e0505e',
                            borderColor: correctCount === totalSlots ? 'var(--color-accent)' : '#e0505e',
                        }}>
                            {correctCount}/{totalSlots} correct
                        </span>
                    )}
                    {revealed && (
                        <span style={{ ...chipStyle, color: '#b8860b', borderColor: '#b8860b' }}>model solution</span>
                    )}
                </div>
                <p style={{
                    margin: '0.35rem 0 0', fontSize: '0.85rem', lineHeight: 1.4,
                    color: 'var(--color-text-secondary, #9a9aa8)', maxWidth: '75rem',
                }}>
                    {exercise.instructions}
                </p>
            </div>

            {/* Score paper — same strip height as the piano app's score (25vh) */}
            <div
                ref={scrollRef}
                style={{
                    height: '25vh',
                    minHeight: '170px',
                    background: '#fbfaf6',
                    borderRadius: '10px',
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    boxShadow: 'inset 0 0 12px rgba(0,0,0,0.15)',
                }}
            >
                {loading && <Centered>Loading exercise…</Centered>}
                {error && <Centered color="#e0505e">Could not load exercise: {error}</Centered>}
                {!loading && !error && !svg && <Centered color="#e0505e">Could not render this exercise.</Centered>}
                {!loading && !error && svg && (
                    <div
                        ref={scoreRef}
                        className="theory-score-svg"
                        onClick={handleClick}
                        style={{ height: '100%', width: 'fit-content', padding: '0.5rem 1rem', boxSizing: 'border-box' }}
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                )}
            </div>
        </div>
    );
};

const chipStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    padding: '2px 8px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.25)',
    color: 'var(--color-text-secondary, #9a9aa8)',
    whiteSpace: 'nowrap',
};

const Centered: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
    <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color ?? '#666', fontSize: '0.95rem', padding: '0 2rem', textAlign: 'center',
    }}>
        {children}
    </div>
);

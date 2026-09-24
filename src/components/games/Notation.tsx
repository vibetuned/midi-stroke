import React, { useMemo } from 'react';
import { useVerovio } from '../../hooks/useVerovio';

/**
 * A level written out, for the results: a lesson's own MEI or a piece (its
 * bars cut with `measureRange`), each played note in the colour of how it
 * went — `colors` by note id. What was felt, shown as it is read.
 */
export const Notation: React.FC<{
    mei: string;
    measureRange?: string;
    /** Bars shown: up to eight go on one line, longer in systems. */
    bars: number;
    colors: Map<string, string>;
    caption: string;
}> = ({ mei, measureRange, bars, colors, caption }) => {
    const { toolkit } = useVerovio();
    const svg = useMemo(() => {
        if (!toolkit) return null;
        try {
            toolkit.setOptions({
                scale: 42, pageWidth: bars <= 8 ? 60000 : 2400, pageHeight: 60000, adjustPageHeight: true,
                header: 'none', footer: 'none', breaks: bars <= 8 ? 'none' : 'auto', pageMarginTop: 40, pageMarginBottom: 20,
            });
            toolkit.loadData(mei);
            if (measureRange) {
                toolkit.select({ measureRange });
                toolkit.redoLayout();
            }
            return toolkit.renderToSVG(1, {});
        } catch (e) {
            console.error('Results notation failed:', e);
            return null;
        }
    }, [toolkit, mei, measureRange, bars]);

    const css = useMemo(() => [...colors].map(([id, c]) => `#${CSS.escape(id)} { fill: ${c}; color: ${c}; stroke: ${c}; }`).join('\n'), [colors]);

    return (
        <div style={{ background: '#f4f4f5', borderRadius: 12, padding: '0.8rem', color: '#111' }}>
            <div style={{ fontSize: '0.75rem', color: '#555', margin: '0 0 0.4rem 0.3rem' }}>{caption}</div>
            <style>{css}</style>
            {svg
                ? <div className="games-notation" dangerouslySetInnerHTML={{ __html: svg }} />
                : <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Writing it out…</div>}
        </div>
    );
};

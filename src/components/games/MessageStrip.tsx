import React from 'react';
import type { EchoLevel, Message } from '../../games/echo';

/**
 * The message that reaches Earth, along a strip of the level's bars: a mark
 * for every note relayed, where it falls — a green tremolo for one that got
 * through, a quarter rest for one lost (let go too soon, or never sent), a
 * tofu box for one garbled (held too long). The game fills it in as you go
 * and moves its playhead; the results show it whole.
 */
export const MessageStrip: React.FC<{
    level: EchoLevel;
    messages: Array<Message | null>;
    height?: number;
    playheadRef?: React.Ref<HTMLDivElement>;
    style?: React.CSSProperties;
}> = ({ level, messages, height = 40, playheadRef, style }) => {
    const totalBeats = level.bars * level.beatsPerBar;
    return (
        <div style={{ position: 'relative', height, display: 'flex', borderRadius: 8, background: '#05060c', border: '1px solid rgba(255,255,255,0.16)', ...style }}>
            {Array.from({ length: level.bars }, (_, i) => (
                <div key={i} style={{ flex: 1, borderRight: i < level.bars - 1 ? '1px solid rgba(255,255,255,0.1)' : undefined }} />
            ))}
            {/* The line the message is written on. */}
            <div style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 1, background: 'rgba(255,255,255,0.12)' }} />
            {level.answers.map((a, k) => {
                const m = messages[k];
                if (!m) return null;
                return (
                    <div key={k} title={TITLE[m]} style={{ position: 'absolute', top: '50%', left: `${(a.start / totalBeats) * 100}%`, transform: 'translate(-50%, -50%)', lineHeight: 0 }}>
                        <Glyph kind={m} size={height / 40} />
                    </div>
                );
            })}
            {playheadRef && <div ref={playheadRef} style={{ position: 'absolute', top: -3, bottom: -3, width: 3, marginLeft: -1.5, left: 0, background: 'white', borderRadius: 2, opacity: 0 }} />}
        </div>
    );
};

const TITLE: Record<Message, string> = { received: 'Got through', lost: 'Lost: let go too soon', garbled: 'Garbled: held too long' };

/** The three marks, drawn: a tremolo's wave, a quarter rest, an empty box. */
export const Glyph: React.FC<{ kind: Message; size?: number }> = ({ kind, size = 1 }) => {
    if (kind === 'received') {
        return (
            <svg width={22 * size} height={14 * size} viewBox="0 0 22 14" aria-hidden>
                <path d="M1 7 Q3.5 1 6 7 T11 7 T16 7 T21 7" fill="none" stroke="#4ade80" strokeWidth={2.2} strokeLinecap="round" />
            </svg>
        );
    }
    if (kind === 'lost') {
        return (
            <svg width={11 * size} height={26 * size} viewBox="0 0 11 26" aria-hidden>
                <path d="M3.2 0.8 L8.8 7.2 C6.6 9.2 5.9 11.2 8.9 15.3 L8.3 15.9 C5.6 14.6 3.3 15.6 4.9 20.4 C2.4 18.4 1.2 14.4 5.7 13.8 L1.4 8.7 C3.9 6.6 4.3 4.4 2.7 1.8 Z" fill="#d6d6e0" />
            </svg>
        );
    }
    return (
        <svg width={14 * size} height={18 * size} viewBox="0 0 14 18" aria-hidden>
            <rect x={1.5} y={1.5} width={11} height={15} rx={1.5} fill="none" stroke="#fb923c" strokeWidth={1.8} />
        </svg>
    );
};

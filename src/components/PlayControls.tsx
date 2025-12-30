import { useGame } from '../context/GameContext';

export const PlayControls: React.FC = () => {
    const { isPlaying, setIsPlaying, tempo, setTempo, isMetronomeMuted, setMetronomeMuted } = useGame();

    return (
        <div style={{
            background: 'var(--color-bg-secondary)',
            padding: '1rem 2rem',
            display: 'flex',
            gap: '1.5rem',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            width: '100%',
            height: '80px'
        }}>
            <button
                onClick={() => {
                    console.log("Toggling Play state. New state:", !isPlaying);
                    setIsPlaying(!isPlaying);
                }}
                style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--color-accent)',
                    color: 'white',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s'
                }}
                className="hover-scale"
            >
                {isPlaying ? '⏸' : '▶'}
            </button>

            <button
                onClick={() => setMetronomeMuted(!isMetronomeMuted)}
                title={isMetronomeMuted ? "Unmute Metronome" : "Mute Metronome"}
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: '1px solid var(--color-text-secondary)',
                    background: isMetronomeMuted ? 'transparent' : 'rgba(255,255,255,0.1)',
                    color: 'var(--color-text-primary)',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                }}
                className="hover-scale"
            >
                {isMetronomeMuted ? '🔇' : '🔊'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '200px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontWeight: 'bold' }}>
                    Tempo: {tempo} BPM
                </span>
                <input
                    type="range"
                    min="30"
                    max="120"
                    step="30"
                    value={tempo}
                    onChange={(e) => setTempo(Number(e.target.value))}
                    style={{
                        flex: 1,
                        cursor: 'pointer',
                        accentColor: 'var(--color-accent)'
                    }}
                />
            </div>
        </div>
    );
};

import { useGame } from '../context/GameContext';

export const PlayControls: React.FC = () => {
    const { isPlaying, setIsPlaying, tempo, setTempo } = useGame();

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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>Tempo</span>
                <input
                    type="number"
                    value={tempo}
                    onChange={(e) => setTempo(Number(e.target.value))}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '0.4rem',
                        borderRadius: '4px',
                        width: '60px',
                        color: 'white',
                        textAlign: 'center'
                    }}
                />
            </div>
        </div>
    );
};

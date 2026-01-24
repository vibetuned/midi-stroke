import { ScoreView } from './components/ScoreView';
import { MidiStatus } from './components/MidiStatus';
import { PlayControls } from './components/PlayControls';
import { GameProvider, useMidiFile, useGame } from './context/GameContext';
import { useAudio } from './hooks/useAudio';
import { StartOverlay } from './components/StartOverlay';
import { PianoSetup } from './components/PianoSetup';
import { SongSelector } from './components/SongSelector';
import { VirtualPiano } from './components/VirtualPiano';

const GameContent = () => {
  // Initialize Audio
  useAudio();
  useMidiFile();
  const { selectedSong, setSelectedSong } = useGame();

  return (
    <div className="app-container">
      <StartOverlay />
      <PianoSetup />
      <SongSelector />
      <header style={{
        padding: '1rem',
        borderBottom: '1px solid var(--color-bg-secondary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Piano Verovio Game</h1>
        {selectedSong && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              {selectedSong.split('/').pop()}
            </span>
            <button
              onClick={() => setSelectedSong(null)}
              style={{
                padding: '0.5rem 1rem',
                background: '#444',
                border: '1px solid #666',
                color: 'white',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Change Song
            </button>
          </div>
        )}
      </header>
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MidiStatus />
        <ScoreView />
      </main>
      <VirtualPiano />
      <PlayControls />
    </div>
  );
};

function App() {
  return (
    <GameProvider>
      <GameContent />
    </GameProvider>
  )
}

export default App

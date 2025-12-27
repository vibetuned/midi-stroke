import { ScoreView } from './components/ScoreView';
import { MidiStatus } from './components/MidiStatus';
import { PlayControls } from './components/PlayControls';
import { GameProvider } from './context/GameContext';
import { useAudio } from './hooks/useAudio';
import { StartOverlay } from './components/StartOverlay';

const GameContent = () => {
  // Initialize Audio
  useAudio();

  return (
    <div className="app-container">
      <StartOverlay />
      <header style={{ padding: '1rem', borderBottom: '1px solid var(--color-bg-secondary)' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Piano Verovio Game</h1>
      </header>
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MidiStatus />
        <ScoreView />
      </main>
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

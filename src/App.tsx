import { useState } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { DrumsApp } from './components/DrumsApp';
import { PianoApp } from './components/PianoApp';
import { GameProvider } from './context/GameContext';
import { StatsProvider } from './context/StatsContext';

function App() {
  const [currentApp, setCurrentApp] = useState<'splash' | 'piano' | 'drums'>('splash');

  if (currentApp === 'splash') {
    return <SplashScreen onSelectApp={setCurrentApp} />;
  }

  // StatsProvider wraps both instruments so stats persist across switches
  if (currentApp === 'drums') {
    return (
      <StatsProvider>
        <GameProvider instrument="drums">
          <DrumsApp onBack={() => setCurrentApp('splash')} />
        </GameProvider>
      </StatsProvider>
    );
  }

  return (
    <StatsProvider>
      <GameProvider instrument="piano">
        <PianoApp onBack={() => setCurrentApp('splash')} />
      </GameProvider>
    </StatsProvider>
  );
}

export default App

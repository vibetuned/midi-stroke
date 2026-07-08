import { useState } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { DrumsApp } from './components/drums/DrumsApp';
import { PianoApp } from './components/piano/PianoApp';
import { SaxoApp } from './components/saxo/SaxoApp';
import { TheoryApp } from './components/theory/TheoryApp';
import { GameProvider } from './context/GameContext';
import { StatsProvider } from './context/StatsContext';

function App() {
  const [currentApp, setCurrentApp] = useState<'splash' | 'piano' | 'drums' | 'saxo' | 'theory'>('splash');

  if (currentApp === 'splash') {
    return <SplashScreen onSelectApp={setCurrentApp} />;
  }

  // StatsProvider wraps every instrument so stats persist across switches
  if (currentApp === 'drums') {
    return (
      <StatsProvider>
        <GameProvider instrument="drums">
          <DrumsApp onBack={() => setCurrentApp('splash')} />
        </GameProvider>
      </StatsProvider>
    );
  }

  if (currentApp === 'saxo') {
    return (
      <StatsProvider>
        <GameProvider instrument="saxo">
          <SaxoApp onBack={() => setCurrentApp('splash')} />
        </GameProvider>
      </StatsProvider>
    );
  }

  if (currentApp === 'theory') {
    return (
      <StatsProvider>
        <GameProvider instrument="theory">
          <TheoryApp onBack={() => setCurrentApp('splash')} />
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

import { useState } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { DrumsApp } from './components/DrumsApp';
import { PianoApp } from './components/PianoApp';
import { GameProvider } from './context/GameContext';

function App() {
  const [currentApp, setCurrentApp] = useState<'splash' | 'piano' | 'drums'>('splash');

  if (currentApp === 'splash') {
    return <SplashScreen onSelectApp={setCurrentApp} />;
  }

  if (currentApp === 'drums') {
    return (
      <GameProvider instrument="drums">
        <DrumsApp onBack={() => setCurrentApp('splash')} />
      </GameProvider>
    );
  }

  return (
    <GameProvider instrument="piano">
      <PianoApp onBack={() => setCurrentApp('splash')} />
    </GameProvider>
  )
}

export default App

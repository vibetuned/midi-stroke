import { useState } from 'react';
import { SplashScreen } from './components/SplashScreen';
import { DrumsApp } from './components/drums/DrumsApp';
import { PianoApp } from './components/piano/PianoApp';
import { SaxoApp } from './components/saxo/SaxoApp';
import { TheoryApp } from './components/theory/TheoryApp';
import { GamesApp } from './components/games/GamesApp';
import { GameProvider } from './context/GameContext';
import { StatsProvider } from './context/StatsContext';

function App() {
  const [currentApp, setCurrentApp] = useState<'splash' | 'piano' | 'drums' | 'saxo' | 'theory' | 'games'>('splash');
  // A piece to open straight away — a game's "play it on the saxophone" (or piano, or drums).
  const [initialSong, setInitialSong] = useState<string | null>(null);
  const back = () => { setInitialSong(null); setCurrentApp('splash'); };

  if (currentApp === 'splash') {
    return <SplashScreen onSelectApp={setCurrentApp} />;
  }

  // StatsProvider wraps every instrument so stats persist across switches
  if (currentApp === 'games') {
    return (
      <GamesApp
        onBack={back}
        onOpenInstrument={(instrument, songKey) => { setInitialSong(songKey); setCurrentApp(instrument); }}
      />
    );
  }

  if (currentApp === 'drums') {
    return (
      <StatsProvider>
        <GameProvider instrument="drums" initialSong={initialSong}>
          <DrumsApp onBack={back} />
        </GameProvider>
      </StatsProvider>
    );
  }

  if (currentApp === 'saxo') {
    return (
      <StatsProvider>
        <GameProvider instrument="saxo" initialSong={initialSong}>
          <SaxoApp onBack={back} />
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
      <GameProvider instrument="piano" initialSong={initialSong}>
        <PianoApp onBack={back} />
      </GameProvider>
    </StatsProvider>
  );
}

export default App

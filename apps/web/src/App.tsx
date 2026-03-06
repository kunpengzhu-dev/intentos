import { useState } from 'react';
import { AppBackdrop } from '@intentos/ui/react';
import mercuryBackground from './assets/backgrounds/mercury-background.jpg';
import { BootPage } from './features/boot/BootPage';
import { ExecutionPage } from './features/execution/ExecutionPage';
import { HomePage } from './features/home/HomePage';
import { Orb } from './features/orb/Orb';

type Route =
  | { page: 'home' }
  | { page: 'execution'; intentId: string; runId: string };

export function App() {
  const [booted, setBooted] = useState(false);
  const [route, setRoute] = useState<Route>({ page: 'home' });

  if (!booted) {
    return <BootPage onReady={() => setBooted(true)} />;
  }

  return (
    <div className="w-full h-full relative isolate overflow-hidden">
      <AppBackdrop backgroundImageUrl={mercuryBackground} className="-z-10" />

      {route.page === 'home' && (
        <HomePage
          onCardClick={(intentId, runId) =>
            setRoute({ page: 'execution', intentId, runId })
          }
        />
      )}
      {route.page === 'execution' && (
        <ExecutionPage
          intentId={route.intentId}
          runId={route.runId}
          onBack={() => setRoute({ page: 'home' })}
        />
      )}
      <Orb />
    </div>
  );
}

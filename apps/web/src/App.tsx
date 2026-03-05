import { useState } from 'react';
import { BootPage } from './pages/BootPage';
import { HomePage } from './pages/HomePage';
import { ExecutionPage } from './pages/ExecutionPage';
import { Orb } from './components/Orb';

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
    <div className="w-full h-full relative">
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

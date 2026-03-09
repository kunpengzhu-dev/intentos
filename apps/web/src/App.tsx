import { useCallback, useEffect, useRef, useState } from 'react';
import { AppBackdrop } from '@intentos/ui/react';
import mercuryBackground from './assets/backgrounds/mercury-background.jpg';
import { BootPage } from './features/boot/BootPage';
import { ExecutionPage } from './features/execution/ExecutionPage';
import { HomePage } from './features/home/HomePage';
import { Orb } from './features/orb/Orb';
import { initialOrbTransitionState } from './features/orb/types';
import type { OrbTransitionState } from './features/orb/types';

type Route =
  | { page: 'home' }
  | { page: 'execution'; intentId: string; runId: string };

export function App() {
  const [booted, setBooted] = useState(false);
  const [route, setRoute] = useState<Route>({ page: 'home' });
  const [orbTransition, setOrbTransition] = useState<OrbTransitionState>(initialOrbTransitionState);
  const readyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current);
      }
    };
  }, []);

  const handleBootReady = useCallback(() => {
    setBooted(true);
    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current);
    }
    readyTimerRef.current = window.setTimeout(() => {
      setOrbTransition({ mode: 'ready', opacity: 1, cornered: true });
      readyTimerRef.current = null;
    }, 520);
  }, []);
  const handleOrbTransitionChange = useCallback((next: Partial<OrbTransitionState>) => {
    setOrbTransition((current) => {
      const merged = { ...current, ...next };
      if (
        merged.mode === current.mode &&
        merged.opacity === current.opacity &&
        merged.cornered === current.cornered
      ) {
        return current;
      }
      return merged;
    });
  }, []);

  return (
    <div className="w-full h-full relative isolate overflow-hidden">
      {!booted ? (
        <BootPage
          onReady={handleBootReady}
          onOrbTransitionChange={handleOrbTransitionChange}
        />
      ) : (
        <>
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
        </>
      )}
      <Orb transition={orbTransition} />
    </div>
  );
}

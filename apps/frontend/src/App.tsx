import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntentSummary } from '@intentos/shared';
import { AppBackdrop } from './ui/react';
import mercuryBackground from './assets/backgrounds/mercury-background.jpg';
import { BootPage } from './features/boot/BootPage';
import { HomePage } from './features/home/HomePage';
import { Orb } from './features/orb/Orb';
import { IntentDetailPage } from './features/detail/IntentDetailPage';
import { markBootSeen, shouldShowBoot } from './features/boot/bootGate';
import { useBackendBoot } from './hooks/useBackendBoot';
import { useIntentCatalog } from './hooks/useIntentCatalog';
import {
  initialOrbTransitionState,
  readyOrbTransitionState,
  type OrbTransitionState,
} from './features/orb/types';

type Route =
  | { page: 'home' }
  | { page: 'detail'; intentKey: string };

function normalizeSuggestionPrompt(message: string): string {
  switch (message) {
    case 'morning_brief':
      return 'Give me a concise morning brief for today: priorities, likely blockers, and one recommended focus block.';
    case 'deep_focus':
      return 'Help me create a 90-minute deep focus plan and a clean task sequence for the current workspace.';
    case 'quick_note':
      return 'Capture a quick note, organize it into bullets, and suggest the next best follow-up action.';
    case 'elden_ring':
      return 'Plan a short Elden Ring session for tonight with one clear goal and a lightweight checklist.';
    case 'meeting_prep':
      return 'Prepare me for a Q3 review meeting with a crisp agenda, talking points, and risks to watch.';
    case 'fallout':
      return 'Give me a quick recap and viewing suggestion for Fallout, optimized for a relaxed evening.';
    default:
      return message;
  }
}

export function App() {
  const boot = useBackendBoot();
  const appShellRef = useRef<HTMLDivElement>(null);
  const initialShouldShowBoot = useRef(shouldShowBoot(window.location.search)).current;
  const [booted, setBooted] = useState(() => !initialShouldShowBoot);
  const [route, setRoute] = useState<Route>({ page: 'home' });
  const [orbDraft, setOrbDraft] = useState('');
  const [orbTransition, setOrbTransition] = useState<OrbTransitionState>(() =>
    initialShouldShowBoot ? initialOrbTransitionState : readyOrbTransitionState,
  );
  const readyTimerRef = useRef<number | null>(null);
  const catalog = useIntentCatalog(boot.phase === 'ready');

  useEffect(() => {
    return () => {
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current);
      }
    };
  }, []);

  const handleBootReady = useCallback(() => {
    markBootSeen();
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
    setOrbTransition((current) => ({ ...current, ...next }));
  }, []);

  const handleIntentOpen = useCallback((intentKey: string) => {
    setRoute({ page: 'detail', intentKey });
  }, []);

  const handleSuggestion = useCallback(
    (message: string) => {
      const prompt = normalizeSuggestionPrompt(message);
      setOrbDraft(prompt);
    },
    [],
  );

  const selectedIntent: IntentSummary | null =
    route.page === 'detail'
      ? catalog.intents.find((intent) => intent.key === route.intentKey) ?? null
      : null;

  return (
    <div ref={appShellRef} className="relative isolate h-full w-full overflow-hidden">
      {!booted ? (
        <BootPage
          phase={boot.phase}
          progress={boot.progress}
          gatewayState={boot.gatewayState}
          setupSummary={boot.setupSummary}
          failureText={boot.failureText}
          currentStepLabel={boot.currentStepLabel}
          onReady={handleBootReady}
          onOrbTransitionChange={handleOrbTransitionChange}
          transitionHostRef={appShellRef}
        />
      ) : (
        <>
          <AppBackdrop backgroundImageUrl={mercuryBackground} className="-z-10" />
          {route.page === 'home' ? (
            <HomePage
              intents={catalog.intents}
              isLoading={catalog.isLoading}
              error={catalog.error}
              gatewayState={boot.gatewayState}
              onIntentOpen={handleIntentOpen}
              onSuggestion={handleSuggestion}
            />
          ) : (
            <IntentDetailPage
              intentKey={route.intentKey}
              intentSummary={selectedIntent}
              onBack={() => setRoute({ page: 'home' })}
            />
          )}
        </>
      )}
      <Orb
        intentKey={boot.orbIntentKey}
        transition={orbTransition}
        initialDraft={orbDraft}
        onDraftConsumed={() => setOrbDraft('')}
      />
    </div>
  );
}

import type { IntentSummary } from '@intentos/shared';
import { Surface } from '../../ui/react';
import { AnimatePresence } from 'framer-motion';
import { SuggestionCard } from './components/SuggestionCard';
import { IntentCard as IntentCardView } from './components/IntentCard';
import { suggestionMocks } from './suggestionMocks';

const hiddenIntentKeys = new Set(['agent:main:main', 'agent:main:intentos:global']);

export function HomePage({
  intents,
  isLoading,
  error,
  gatewayState,
  onIntentOpen,
  onSuggestion,
}: {
  intents: IntentSummary[];
  isLoading: boolean;
  error: string | null;
  gatewayState: string;
  onIntentOpen: (intentKey: string) => void;
  onSuggestion: (message: string) => void;
}) {
  const visibleIntents = intents.filter((intent) => !hiddenIntentKeys.has(intent.key));
  const active = visibleIntents.filter((intent) => intent.status !== 'completed');
  const completed = visibleIntents.filter((intent) => intent.status === 'completed');

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 pb-24 pt-8 md:px-12 md:pt-10">
        <header className="mb-10">
          <div className="flex justify-end">
            <div className="text-sm font-medium tracking-wide text-slate-500">
              {gatewayState === 'connected' ? 'Gateway Connected' : `Gateway ${gatewayState}`}
            </div>
          </div>
        </header>

        <section className="mb-14">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-medium tracking-wide text-slate-500">Suggested for you</h2>
            <div className="hidden items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 md:flex">
              <span>Curated intents</span>
              <div className="mercury-hairline h-px w-20" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-4 md:auto-rows-[220px]">
            {suggestionMocks.map((mock) => (
              <SuggestionCard
                key={mock.title}
                mock={mock}
                onClick={() => onSuggestion(mock.message)}
              />
            ))}
          </div>
        </section>

        <div className="mb-10 flex items-center gap-6 opacity-70">
          <div className="mercury-hairline h-px flex-1" />
          <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Your workspace
          </span>
          <div className="mercury-hairline h-px flex-1" />
        </div>

        <section className="mb-12">
          <div className="mb-6 flex items-end gap-3">
            <h2 className="text-4xl font-semibold tracking-tight text-slate-800">Today</h2>
            <span className="text-sm font-medium text-slate-400">Active intents</span>
          </div>

          {error && (
            <Surface variant="soft" className="mb-5 rounded-[1.6rem] px-5 py-4 text-sm text-rose-600">
              {error}
            </Surface>
          )}

          {isLoading ? (
            <Surface variant="soft" className="rounded-[2rem] px-6 py-8 text-sm text-slate-500">
              Loading current intent workspace...
            </Surface>
          ) : active.length === 0 ? (
            <Surface variant="soft" className="rounded-[2rem] px-6 py-8 text-sm text-slate-500">
              No active tasks yet. Launch one from the suggestion board to start a new flow.
            </Surface>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {active.map((intent) => (
                  <IntentCardView
                    key={intent.key}
                    intent={intent}
                    onClick={() => onIntentOpen(intent.key)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {completed.length > 0 && (
          <section>
            <div className="mb-6 flex items-end gap-3">
              <h2 className="text-4xl font-semibold tracking-tight text-slate-800/70">Earlier</h2>
              <span className="text-sm font-medium text-slate-400">Completed outcomes</span>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {completed.map((intent) => (
                  <IntentCardView
                    key={intent.key}
                    intent={intent}
                    onClick={() => onIntentOpen(intent.key)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

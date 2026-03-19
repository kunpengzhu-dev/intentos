import { useEffect } from 'react';
import { Surface } from '@intentos/ui/react';
import { AnimatePresence } from 'framer-motion';
import { useConnectionStore } from '../../store/connection';
import { useIntentStore, type IntentCard } from '../../store/intents';
import type { Envelope } from '@intentos/protocol';
import { SuggestionCard } from './components/SuggestionCard';
import { IntentCard as IntentCardView } from './components/IntentCard';
import { suggestionMocks } from './suggestionMocks';

export function HomePage({ onCardClick }: { onCardClick?: (intentId: string, runId: string) => void }) {
  const { getClient, state } = useConnectionStore();
  const { upsertIntent, getActiveIntents, getCompletedIntents } = useIntentStore();

  useEffect(() => {
    if (state !== 'connected') return;
    const client = getClient();
    client.subscribe(['global']);

    const offCreated = client.on('intent/created', (env: Envelope) => {
      const p = env.payload as IntentCard & { createdAt: number };
      upsertIntent({
        intentId: p.intentId,
        title: p.title,
        status: p.status ?? 'active',
        currentRunId: p.currentRunId,
        updatedAt: p.createdAt ?? Date.now(),
        needsAttention: false,
      });
    });

    const offChanged = client.on('intent/status_changed', (env: Envelope) => {
      const p = env.payload as IntentCard;
      upsertIntent(p);
    });

    const offSnapshot = client.on('global/snapshot', (env: Envelope) => {
      const p = env.payload as { intents: Array<Record<string, unknown>> };
      if (!p.intents) return;
      for (const raw of p.intents) {
        upsertIntent({
          intentId: raw.intent_id as string,
          title: raw.title as string,
          summary: raw.summary as string | undefined,
          status: raw.status as string,
          currentRunId: raw.current_run_id as string | undefined,
          updatedAt: raw.updated_at as number,
          needsAttention: raw.needs_attention as boolean,
          progress: raw.progress as number | undefined,
          artifactCount: raw.artifact_count as number | undefined,
        });
      }
    });

    return () => {
      offCreated();
      offChanged();
      offSnapshot();
    };
  }, [state]);

  const active = getActiveIntents();
  const completed = getCompletedIntents();

  const handleCreateIntent = (message: string) => {
    if (state !== 'connected') return;
    getClient().send('intent/create', { message }).catch(console.error);
  };

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 pb-24 pt-8 md:px-12 md:pt-10">
        <header className="mb-10">
          <div className="flex justify-end">
            <div className="text-sm font-medium tracking-wide text-slate-500">{state === 'connected' ? 'Connected' : 'Syncing'}</div>
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
                onClick={() => handleCreateIntent(mock.message)}
              />
            ))}
          </div>
        </section>

        <div className="mb-10 flex items-center gap-6 opacity-70">
          <div className="mercury-hairline h-px flex-1" />
          <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Your workspace</span>
          <div className="mercury-hairline h-px flex-1" />
        </div>

        <section className="mb-12">
          <div className="mb-6 flex items-end gap-3">
            <h2 className="text-4xl font-semibold tracking-tight text-slate-800">Today</h2>
            <span className="text-sm font-medium text-slate-400">Active intents</span>
          </div>

          {active.length === 0 ? (
            <Surface variant="soft" className="rounded-[2rem] px-6 py-8 text-sm text-slate-500">
              No active tasks yet. Launch one from the suggestion board to start a new flow.
            </Surface>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {active.map((card) => (
                  <IntentCardView
                    key={card.intentId}
                    card={card}
                    onClick={() => card.currentRunId && onCardClick?.(card.intentId, card.currentRunId)}
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
                {completed.map((card) => (
                  <IntentCardView
                    key={card.intentId}
                    card={card}
                    onClick={() => card.currentRunId && onCardClick?.(card.intentId, card.currentRunId)}
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

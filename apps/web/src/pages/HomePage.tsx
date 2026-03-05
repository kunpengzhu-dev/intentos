import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConnectionStore } from '../store/connection';
import { useIntentStore, type IntentCard } from '../store/intents';
import type { Envelope } from '@intentos/protocol';

function SuggestionCard({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex flex-col gap-1.5 p-4 rounded-xl bg-gray-800/50 border border-gray-700/50 hover:border-indigo-500/30 hover:bg-gray-800/80 transition-colors text-left cursor-pointer w-full"
    >
      <span className="text-sm font-medium text-gray-200">{title}</span>
      <span className="text-xs text-gray-500 line-clamp-2">{description}</span>
    </motion.button>
  );
}

const statusColors: Record<string, string> = {
  active: 'bg-indigo-500',
  waiting: 'bg-amber-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-500',
};

const statusLabels: Record<string, string> = {
  active: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function IntentCardComponent({ card }: { card: IntentCard }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.01 }}
      className="p-4 rounded-xl bg-gray-800/60 border border-gray-700/50 hover:border-indigo-500/20 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-200 truncate">{card.title}</h3>
          {card.summary && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{card.summary}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`w-2 h-2 rounded-full ${statusColors[card.status] ?? 'bg-gray-500'}`} />
          <span className="text-xs text-gray-400">{statusLabels[card.status] ?? card.status}</span>
        </div>
      </div>

      {card.progress != null && card.status === 'active' && (
        <div className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden">
          <motion.div className="h-full bg-indigo-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.round(card.progress * 100)}%` }} transition={{ duration: 0.5 }} />
        </div>
      )}

      {(card.artifactCount ?? 0) > 0 && card.status === 'completed' && (
        <div className="mt-2 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-green-400">
            {card.artifactCount} artifact{(card.artifactCount ?? 0) > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {card.needsAttention && (
        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="mt-2 text-xs text-amber-400 font-medium">
          Needs your attention
        </motion.div>
      )}
    </motion.div>
  );
}

export function HomePage() {
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
      if (p.intents) {
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
  const suggestions = [
    { title: 'Schedule a meeting', description: 'Set up a meeting with your team for next week' },
    { title: 'Research a topic', description: 'Deep dive into the latest AI developments' },
    { title: 'Draft an email', description: 'Write a professional follow-up email' },
    { title: 'Analyze data', description: 'Process and analyze your Q4 sales report' },
  ];

  const handleCreateIntent = (message: string) => {
    if (state !== 'connected') return;
    getClient().send('intent/create', { message }).catch(console.error);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8 max-w-4xl mx-auto">
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">Suggested Tasks</h2>
        <div className="grid grid-cols-2 gap-3">
          {suggestions.map((s) => (
            <SuggestionCard key={s.title} title={s.title} description={s.description} onClick={() => handleCreateIntent(s.title)} />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">
          Active Tasks
          {active.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">({active.length})</span>}
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-gray-600">No active tasks. Try a suggestion above!</p>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {active.map((card) => (
                <IntentCardComponent key={card.intentId} card={card} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Completed
            <span className="ml-2 text-sm font-normal text-gray-500">({completed.length})</span>
          </h2>
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {completed.map((card) => (
                <IntentCardComponent key={card.intentId} card={card} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}
    </div>
  );
}

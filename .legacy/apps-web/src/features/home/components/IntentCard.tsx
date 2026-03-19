import { Surface } from '@intentos/ui/react';
import { motion } from 'framer-motion';
import type { IntentCard as IntentCardModel } from '../../../store/intents';

const statusTone: Record<string, string> = {
  active: 'bg-blue-500',
  waiting: 'bg-amber-500',
  completed: 'bg-emerald-500',
  failed: 'bg-rose-500',
  cancelled: 'bg-slate-400',
};

const statusLabel: Record<string, string> = {
  active: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function IntentCard({ card, onClick }: { card: IntentCardModel; onClick?: () => void }) {
  return (
    <Surface
      as={motion.button}
      variant="panel"
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.01, x: 4 }}
      onClick={onClick}
      className="w-full rounded-[1.75rem] p-6 text-left transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className={`h-2.5 w-2.5 rounded-full ${statusTone[card.status] ?? 'bg-slate-400'}`} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              {statusLabel[card.status] ?? card.status}
            </p>
          </div>
          <h3 className="mt-3 truncate text-xl font-medium text-slate-800">{card.title}</h3>
          <p className="mt-2 line-clamp-2 min-h-11 text-sm leading-6 text-slate-500">
            {card.summary ?? 'IntentOS is coordinating the workstream and waiting for the next visible update.'}
          </p>
        </div>

        <div className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-500">
          {card.artifactCount ?? 0} artifacts
        </div>
      </div>

      {card.progress != null && card.status === 'active' && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>Processing</span>
            <span>{Math.round(card.progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/70">
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-blue-500 to-indigo-500"
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(card.progress * 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {card.needsAttention && <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">Needs attention</span>}
          {card.status === 'completed' && (card.artifactCount ?? 0) > 0 && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700">Deliverables ready</span>
          )}
        </div>
        <span className="text-sm font-medium text-slate-500">Open details</span>
      </div>
    </Surface>
  );
}

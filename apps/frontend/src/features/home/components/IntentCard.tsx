import type { IntentSummary } from '@intentos/shared';
import { Surface } from '../../../ui/react';
import { motion } from 'framer-motion';

const statusTone: Record<string, string> = {
  ready: 'bg-sky-500',
  active: 'bg-blue-500',
  running: 'bg-blue-500',
  waiting: 'bg-amber-500',
  idle: 'bg-slate-400',
  completed: 'bg-emerald-500',
  failed: 'bg-rose-500',
  aborted: 'bg-slate-400',
  unknown: 'bg-slate-400',
};

const statusLabel: Record<string, string> = {
  ready: 'Ready',
  active: 'Running',
  running: 'Running',
  waiting: 'Waiting',
  idle: 'Idle',
  completed: 'Completed',
  failed: 'Failed',
  aborted: 'Aborted',
  unknown: 'Unknown',
};

export function IntentCard({ intent, onClick }: { intent: IntentSummary; onClick?: () => void }) {
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
            <span className={`h-2.5 w-2.5 rounded-full ${statusTone[intent.status] ?? 'bg-slate-400'}`} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              {statusLabel[intent.status] ?? intent.status}
            </p>
          </div>
          <h3 className="mt-3 truncate text-xl font-medium text-slate-800">{intent.title}</h3>
          <p className="mt-2 line-clamp-2 min-h-11 text-sm leading-6 text-slate-500">
            {intent.previewText ?? 'IntentOS is coordinating the workstream and waiting for the next visible update.'}
          </p>
        </div>

        <div className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-500">
          {intent.kind === 'orb' ? 'Orb' : 'Intent'}
        </div>
      </div>

      {intent.execution.busy && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span>Execution</span>
            <span>{intent.execution.phase}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/70">
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-blue-500 to-indigo-500"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {intent.execution.interruptible && (
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">
              Interruptible
            </span>
          )}
          {intent.runtime.model && (
            <span className="rounded-full bg-white/70 px-3 py-1 font-medium text-slate-600">
              {intent.runtime.model}
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-slate-500">Open details</span>
      </div>
    </Surface>
  );
}

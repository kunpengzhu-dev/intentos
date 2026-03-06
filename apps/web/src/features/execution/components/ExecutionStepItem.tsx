import { Surface } from '@intentos/ui/react';
import { motion } from 'framer-motion';
import type { RunStep } from '../../../store/run';

const stepStatusIcon: Record<string, { color: string; icon: string }> = {
  queued: { color: 'text-slate-400', icon: '○' },
  running: { color: 'text-blue-600', icon: '◉' },
  done: { color: 'text-emerald-600', icon: '●' },
  failed: { color: 'text-rose-600', icon: '✕' },
};

export function ExecutionStepItem({ step, index }: { step: RunStep; index: number }) {
  const { color, icon } = stepStatusIcon[step.status] ?? stepStatusIcon.queued;

  return (
    <motion.div
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.24 }}
      className="flex items-start gap-4"
    >
      <div className="flex flex-col items-center pt-1">
        <span className={`text-lg ${color}`}>{icon}</span>
        {index >= 0 && <div className="mt-2 h-12 w-px bg-slate-300/70 last:hidden" />}
      </div>

      <Surface variant="soft" className="flex-1 rounded-[1.5rem] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800">{step.title}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{step.kind}</p>
          </div>
          <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${color}`}>{step.status}</span>
        </div>

        {step.progress != null && step.status === 'running' && (
          <div className="mt-4">
            <div className="mb-2 flex justify-between text-xs text-slate-400">
              <span>Progress</span>
              <span>{Math.round(step.progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <motion.div
                className="h-full rounded-full bg-linear-to-r from-blue-500 to-indigo-500"
                animate={{ width: `${Math.round(step.progress * 100)}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </Surface>
    </motion.div>
  );
}

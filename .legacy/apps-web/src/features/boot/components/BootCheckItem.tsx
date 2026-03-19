import { Surface } from '@intentos/ui/react';
import { motion } from 'framer-motion';
import type { BootCheck } from '../../../store/boot';

export function BootCheckItem({ check, index }: { check: BootCheck; index: number }) {
  const tone =
    check.state === 'ok'
      ? 'text-emerald-700'
      : check.state === 'failed'
        ? 'text-rose-700'
        : check.state === 'running'
          ? 'text-blue-700'
          : 'text-slate-500';

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.12, duration: 0.28 }}
      className="flex items-center gap-4"
    >
      <Surface variant="soft" className="flex w-full items-center gap-4 rounded-2xl px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70">
          {check.state === 'pending' && <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />}
          {check.state === 'running' && (
            <motion.div
              className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          )}
          {check.state === 'ok' && (
            <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {check.state === 'failed' && (
            <svg className="h-5 w-5 text-rose-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${tone}`}>{check.label}</p>
          {check.message && !check.error && <p className="mt-1 text-xs text-slate-500">{check.message}</p>}
          {check.error && <p className="mt-1 text-xs text-rose-600">{check.error}</p>}
        </div>
      </Surface>
    </motion.div>
  );
}

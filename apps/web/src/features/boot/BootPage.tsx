import { useEffect, useRef } from 'react';
import { AppBackdrop, Surface } from '@intentos/ui/react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  BootCompletedPayload,
  BootFailedPayload,
  BootStartAckPayload,
  BootStepUpdatedPayload,
  Envelope,
} from '@intentos/protocol';
import mercuryBackground from '../../assets/backgrounds/mercury-background.jpg';
import { useBootStore } from '../../store/boot';
import { useConnectionStore } from '../../store/connection';
import { BootCheckItem } from './components/BootCheckItem';

export function BootPage({ onReady }: { onReady: () => void }) {
  const { phase, checks, progress, setPhase, startBoot, updateCheck, failBoot, reset } = useBootStore();
  const { init, getClient, state } = useConnectionStore();
  const bootSent = useRef(false);

  useEffect(() => {
    init();
    const client = getClient();
    client.connect();
  }, []);

  useEffect(() => {
    if (state !== 'connected' || bootSent.current) return;
    bootSent.current = true;

    const client = getClient();

    const offStepUpdated = client.on('boot/step.updated', (env: Envelope) => {
      updateCheck(env.payload as BootStepUpdatedPayload);
    });

    const offCompleted = client.on('boot/completed', (env: Envelope) => {
      void (env.payload as BootCompletedPayload);
      setPhase('ready');
      setTimeout(onReady, 900);
    });

    const offFailed = client.on('boot/failed', (env: Envelope) => {
      void (env.payload as BootFailedPayload);
      failBoot();
    });

    client.send('boot/start', {}).then((env) => {
      startBoot(env.payload as BootStartAckPayload);
    }).catch(() => {
      failBoot();
    });

    return () => {
      offStepUpdated();
      offCompleted();
      offFailed();
      reset();
    };
  }, [failBoot, getClient, onReady, reset, setPhase, startBoot, state, updateCheck]);

  return (
    <div className="flex h-full w-full items-center justify-center px-6 isolate">
      <AppBackdrop backgroundImageUrl={mercuryBackground} className="-z-10" />

      <Surface
        as={motion.div}
        variant="panel"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 w-full max-w-xl rounded-[2.25rem] px-7 py-8 md:px-9"
      >
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">IntentOS boot</p>
            <h1 className="mt-3 text-4xl font-light leading-none text-slate-800">Preparing your workspace</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
              Connecting the runtime, storage, and agent bridge before handing control to the main surface.
            </p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-base font-semibold text-white shadow-lg shadow-slate-300/50">
            IO
          </div>
        </div>

        <div className="space-y-3">
          <div className="mb-4 overflow-hidden rounded-full bg-white/55">
            <motion.div
              className="h-2 rounded-full bg-slate-900"
              animate={{ width: `${Math.max(progress * 100, phase === 'ready' ? 100 : 6)}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
          {checks.map((check, index) => (
            <BootCheckItem key={check.id} check={check} index={index} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {phase === 'ready' && (
            <motion.p
              key="ready"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-6 text-sm font-medium text-blue-700"
            >
              System ready. Opening the dashboard…
            </motion.p>
          )}
          {phase === 'failed' && (
            <motion.p
              key="failed"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-6 text-sm font-medium text-rose-700"
            >
              Startup checks failed. Please inspect the failed subsystem and retry.
            </motion.p>
          )}
        </AnimatePresence>

        <p className="mt-4 text-xs text-slate-400">{state === 'connecting' ? 'Connecting to server…' : 'Waiting for startup stream…'}</p>
      </Surface>
    </div>
  );
}

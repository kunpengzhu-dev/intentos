import { useEffect, useRef } from 'react';
import { AppBackdrop, Surface } from '@intentos/ui/react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Envelope } from '@intentos/protocol';
import mercuryBackground from '../../assets/backgrounds/mercury-background.jpg';
import { useBootStore, type BootCheck } from '../../store/boot';
import { useConnectionStore } from '../../store/connection';
import { BootCheckItem } from './components/BootCheckItem';

export function BootPage({ onReady }: { onReady: () => void }) {
  const { phase, checks, setPhase, updateCheck } = useBootStore();
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

    const offProgress = client.on('boot/progress', (env: Envelope) => {
      const p = env.payload as { checkId: string; label: string; state: string; error?: string };
      updateCheck({ checkId: p.checkId, label: p.label, state: p.state as BootCheck['state'], error: p.error });
    });

    const offReady = client.on('boot/ready', () => {
      setPhase('ready');
      setTimeout(onReady, 900);
    });

    client.sendFire('boot/check', {});

    return () => {
      offProgress();
      offReady();
    };
  }, [state]);

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
          {checks.map((check, index) => (
            <BootCheckItem key={check.checkId} check={check} index={index} />
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

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBootStore, type BootCheck } from '../store/boot';
import { useConnectionStore } from '../store/connection';
import type { Envelope } from '@intentos/protocol';

function CheckItem({ check, index }: { check: BootCheck; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.15, duration: 0.3 }}
      className="flex items-center gap-3 py-2"
    >
      <div className="w-5 h-5 flex items-center justify-center">
        {check.state === 'pending' && <div className="w-3 h-3 rounded-full bg-gray-600" />}
        {check.state === 'running' && (
          <motion.div
            className="w-4 h-4 rounded-full border-2 border-indigo-400 border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        )}
        {check.state === 'ok' && (
          <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-5 h-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </motion.svg>
        )}
        {check.state === 'fail' && (
          <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </motion.svg>
        )}
      </div>
      <span
        className={`text-sm font-medium ${
          check.state === 'ok'
            ? 'text-green-300'
            : check.state === 'fail'
              ? 'text-red-300'
              : check.state === 'running'
                ? 'text-indigo-300'
                : 'text-gray-400'
        }`}
      >
        {check.label}
      </span>
      {check.error && <span className="text-xs text-red-400 ml-2">{check.error}</span>}
    </motion.div>
  );
}

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
      setTimeout(onReady, 800);
    });

    client.sendFire('boot/check', {});

    return () => {
      offProgress();
      offReady();
    };
  }, [state]);

  return (
    <div className="flex items-center justify-center w-full h-full bg-gray-950">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-8">
        {/* Logo */}
        <motion.div
          animate={{ boxShadow: phase === 'ready' ? '0 0 60px 20px rgba(99,102,241,0.3)' : '0 0 40px 10px rgba(99,102,241,0.15)' }}
          className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
        >
          <motion.span
            animate={phase !== 'ready' ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
            transition={phase !== 'ready' ? { duration: 2, repeat: Infinity } : {}}
            className="text-3xl font-bold text-white"
          >
            IO
          </motion.span>
        </motion.div>

        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-100 tracking-wide">IntentOS</h1>
          <p className="text-sm text-gray-500 mt-1">Initializing system...</p>
        </div>

        <div className="w-64">
          {checks.map((check, i) => (
            <CheckItem key={check.checkId} check={check} index={i} />
          ))}
        </div>

        <AnimatePresence>
          {phase === 'ready' && (
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-indigo-400 font-medium">
              System Ready
            </motion.p>
          )}
          {phase === 'failed' && (
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-red-400">
              System initialization failed
            </motion.p>
          )}
        </AnimatePresence>

        {state === 'connecting' && <p className="text-xs text-gray-600">Connecting to server...</p>}
      </motion.div>
    </div>
  );
}

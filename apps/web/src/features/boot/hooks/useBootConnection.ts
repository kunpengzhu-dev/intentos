import { useEffect, useMemo, useRef } from 'react';
import type {
  BootCompletedPayload,
  BootFailedPayload,
  BootStartAckPayload,
  BootStepUpdatedPayload,
  Envelope,
} from '@intentos/protocol';
import { useBootStore } from '../../../store/boot';
import { useConnectionStore } from '../../../store/connection';

export function useBootConnection() {
  const { phase, checks, progress, setPhase, startBoot, updateCheck, failBoot, reset } = useBootStore();
  const { init, getClient, state } = useConnectionStore();
  const bootSent = useRef(false);

  const failureText = useMemo(() => {
    const failedCheck = checks.find((check) => check.state === 'failed');
    return failedCheck?.error ?? 'Startup checks failed. Please inspect the failed subsystem and retry.';
  }, [checks]);

  useEffect(() => {
    init();
    const client = getClient();
    client.connect();
  }, [getClient, init]);

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
      bootSent.current = false;
      reset();
    };
  }, [failBoot, getClient, reset, setPhase, startBoot, state, updateCheck]);

  return {
    phase,
    progress,
    state,
    failureText,
  };
}

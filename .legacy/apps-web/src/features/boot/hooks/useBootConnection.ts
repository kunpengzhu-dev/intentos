import { useMemo } from 'react';
import { useBootStore } from '../../../store/boot';
import { useConnectionStore } from '../../../store/connection';

export function useBootConnection() {
  const { phase, checks, progress, failureReason } = useBootStore();
  const { state } = useConnectionStore();

  const failureText = useMemo(() => {
    const failedCheck = checks.find((check) => check.state === 'failed');
    return failedCheck?.error ?? failureReason ?? 'Startup checks failed. Please inspect the failed subsystem and retry.';
  }, [checks, failureReason]);

  const currentStepLabel = useMemo(() => {
    const runningCheck = checks.find((check) => check.state === 'running');
    if (runningCheck) return runningCheck.label;

    const pendingCheck = checks.find((check) => check.state === 'pending');
    if (pendingCheck) return pendingCheck.label;

    const failedCheck = checks.find((check) => check.state === 'failed');
    if (failedCheck) return failedCheck.label;

    return undefined;
  }, [checks]);

  return {
    phase,
    progress,
    state,
    failureText,
    currentStepLabel,
  };
}

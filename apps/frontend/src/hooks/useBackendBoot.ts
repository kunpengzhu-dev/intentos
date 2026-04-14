import { useEffect, useMemo, useState } from 'react';
import { fetchBootSetupStatus, fetchHealth, fetchOrbIntent, subscribeToBootSetupEvents } from '../lib/api';
import type { BootSetupStatus, BootSetupStepState } from '@intentos/shared';

type BootPhase = 'checking' | 'ready' | 'failed';
type BootStepState = 'pending' | 'running' | 'ok' | 'failed';

type BootCheck = {
  id: string;
  label: string;
  weight: number;
  state: BootStepState;
  error?: string;
};

const bootScript: Array<Pick<BootCheck, 'id' | 'label' | 'weight'>> = [
  { id: 'backend', label: 'Connecting to backend', weight: 2 },
  { id: 'gateway', label: 'Reading gateway state', weight: 1 },
  { id: 'orb', label: 'Loading orb intent', weight: 2 },
];

function toCheckState(stepState: BootSetupStepState): BootStepState {
  switch (stepState) {
    case 'running':
      return 'running';
    case 'completed':
      return 'ok';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function createChecks(
  bootSetup?: BootSetupStatus,
  baseStates: Partial<Record<'backend' | 'gateway' | 'orb', BootStepState>> = {},
): BootCheck[] {
  const setupChecks = bootSetup?.enabled
    ? bootSetup.steps.map((step) => ({
        id: step.id,
        label: step.label,
        weight: Math.max(Math.round(step.durationMs / 1_000), 1),
        state: toCheckState(step.state),
      }))
    : [];

  return [
    { ...bootScript[0], state: baseStates.backend ?? 'pending' },
    ...setupChecks,
    { ...bootScript[1], state: baseStates.gateway ?? 'pending' },
    { ...bootScript[2], state: baseStates.orb ?? 'pending' },
  ];
}

function updateCheckState(
  checks: BootCheck[],
  stepId: string,
  state: BootStepState,
  error?: string,
): BootCheck[] {
  return checks.map((check) =>
    check.id === stepId
      ? {
          ...check,
          state,
          ...(error ? { error } : {}),
        }
      : check,
  );
}

function calculateProgress(checks: BootCheck[]): number {
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  if (totalWeight <= 0) {
    return 0;
  }

  const completedWeight = checks
    .filter((check) => check.state === 'ok')
    .reduce((sum, check) => sum + check.weight, 0);

  return completedWeight / totalWeight;
}

export function useBackendBoot() {
  const [phase, setPhase] = useState<BootPhase>('checking');
  const [checks, setChecks] = useState<BootCheck[]>(() => createChecks());
  const [failureText, setFailureText] = useState('');
  const [gatewayState, setGatewayState] = useState('connecting');
  const [setupSummary, setSetupSummary] = useState('');
  const [orbIntentKey, setOrbIntentKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let unsubscribeBootEvents: (() => void) | undefined;

    async function boot() {
      if (cancelled) {
        return;
      }

      let currentStepId: BootCheck['id'] = 'backend';

      setPhase('checking');
      setFailureText('');
      setChecks(createChecks());
      setGatewayState('connecting');
      setSetupSummary('');

      try {
        currentStepId = 'backend';
        setChecks((current) => updateCheckState(current, 'backend', 'running'));
        const [health, bootSetup] = await Promise.all([fetchHealth(), fetchBootSetupStatus()]);
        if (cancelled) {
          return;
        }

        setGatewayState(health.gateway.connectionState);
        setSetupSummary(bootSetup.summary);
        setChecks(createChecks(bootSetup, { backend: 'ok' }));

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const finishResolve = () => {
            if (settled) {
              return;
            }
            settled = true;
            resolve();
          };
          const finishReject = (error: Error) => {
            if (settled) {
              return;
            }
            settled = true;
            reject(error);
          };

          if (!bootSetup.enabled || bootSetup.phase === 'ready') {
            finishResolve();
            return;
          }

          if (bootSetup.phase === 'failed') {
            finishReject(new Error(bootSetup.lastError ?? bootSetup.summary));
            return;
          }

          const disconnectWithError = () => {
            finishReject(new Error('Boot event stream disconnected before setup completed'));
          };

          unsubscribeBootEvents = subscribeToBootSetupEvents(
            (event) => {
              if (cancelled) {
                return;
              }

              currentStepId = event.bootSetup.currentStepId ?? currentStepId;
              setSetupSummary(event.bootSetup.summary);
              setChecks(createChecks(event.bootSetup, { backend: 'ok' }));

              if (event.bootSetup.phase === 'ready') {
                unsubscribeBootEvents?.();
                unsubscribeBootEvents = undefined;
                finishResolve();
                return;
              }

              if (event.bootSetup.phase === 'failed') {
                unsubscribeBootEvents?.();
                unsubscribeBootEvents = undefined;
                finishReject(new Error(event.bootSetup.lastError ?? event.bootSetup.summary));
              }
            },
            () => {
              unsubscribeBootEvents?.();
              unsubscribeBootEvents = undefined;
              disconnectWithError();
            },
          );
        });

        currentStepId = 'gateway';
        setChecks((current) => updateCheckState(current, 'gateway', 'running'));
        setChecks((current) => updateCheckState(current, 'gateway', 'ok'));

        currentStepId = 'orb';
        setChecks((current) => updateCheckState(current, 'orb', 'running'));
        const orb = await fetchOrbIntent();
        if (cancelled) {
          return;
        }

        setOrbIntentKey(orb.intent.key);
        setChecks((current) => updateCheckState(current, 'orb', 'ok'));
        setPhase('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Failed to connect to backend';
        setChecks((current) => updateCheckState(current, currentStepId, 'failed', message));
        setFailureText(message);
        setPhase('failed');
        retryTimer = window.setTimeout(() => {
          void boot();
        }, 1500);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      unsubscribeBootEvents?.();
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, []);

  const progress = useMemo(() => calculateProgress(checks), [checks]);

  const currentStepLabel = useMemo(() => {
    const runningCheck = checks.find((check) => check.state === 'running');
    if (runningCheck) {
      return runningCheck.label;
    }

    const pendingCheck = checks.find((check) => check.state === 'pending');
    if (pendingCheck) {
      return pendingCheck.label;
    }

    const failedCheck = checks.find((check) => check.state === 'failed');
    return failedCheck?.label ?? undefined;
  }, [checks]);

  return {
    phase,
    progress,
    failureText,
    currentStepLabel: currentStepLabel ?? 'Loading',
    gatewayState,
    setupSummary,
    orbIntentKey,
  };
}

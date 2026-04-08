import { useEffect, useMemo, useState } from 'react';
import { fetchHealth, fetchOrbIntent } from '../lib/api';

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
  { id: 'deployment', label: 'Reading deployment state', weight: 1 },
  { id: 'gateway', label: 'Reading gateway state', weight: 1 },
  { id: 'orb', label: 'Loading orb intent', weight: 2 },
];

function createInitialChecks(): BootCheck[] {
  return bootScript.map((step) => ({
    ...step,
    state: 'pending',
  }));
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
  const [checks, setChecks] = useState<BootCheck[]>(() => createInitialChecks());
  const [failureText, setFailureText] = useState('');
  const [gatewayState, setGatewayState] = useState('connecting');
  const [deploymentSummary, setDeploymentSummary] = useState('');
  const [orbIntentKey, setOrbIntentKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    async function boot() {
      if (cancelled) {
        return;
      }

      let currentStepId: BootCheck['id'] = 'backend';

      setPhase('checking');
      setFailureText('');
      setChecks(createInitialChecks());
      setGatewayState('connecting');
      setDeploymentSummary('');

      try {
        currentStepId = 'backend';
        setChecks((current) => updateCheckState(current, 'backend', 'running'));
        const health = await fetchHealth();
        if (cancelled) {
          return;
        }

        setChecks((current) => updateCheckState(current, 'backend', 'ok'));
        currentStepId = 'deployment';
        setChecks((current) => updateCheckState(current, 'deployment', 'running'));
        setDeploymentSummary(health.deployment.summary);
        setChecks((current) => updateCheckState(current, 'deployment', 'ok'));

        currentStepId = 'gateway';
        setChecks((current) => updateCheckState(current, 'gateway', 'running'));
        setGatewayState(health.gateway.connectionState);
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
    deploymentSummary,
    orbIntentKey,
  };
}

import { create } from 'zustand';
import type { BootStartAckPayload, BootStep, BootStepState, BootStepUpdatedPayload } from '@intentos/protocol';

export type BootCheck = BootStep & {
  state: BootStepState;
  message?: string;
  error?: string;
  updatedAt?: string;
};

type BootStore = {
  phase: 'checking' | 'ready' | 'failed';
  checks: BootCheck[];
  progress: number;
  failureReason?: string;
  setPhase: (phase: 'checking' | 'ready' | 'failed') => void;
  startBoot: (payload: BootStartAckPayload) => void;
  updateCheck: (payload: BootStepUpdatedPayload) => void;
  failBoot: (reason?: string) => void;
  reset: () => void;
};

function toBootChecks(steps: BootStep[]): BootCheck[] {
  return [...steps].map((step) => ({
    ...step,
    state: 'pending',
  }));
}

function calculateProgress(checks: BootCheck[]): number {
  const totalWeight = checks.reduce((sum, check) => sum + (check.weight ?? 1), 0);
  if (totalWeight === 0) {
    return 0;
  }

  const doneWeight = checks
    .filter((check) => check.state === 'ok')
    .reduce((sum, check) => sum + (check.weight ?? 1), 0);

  return doneWeight / totalWeight;
}

export const useBootStore = create<BootStore>((set) => ({
  phase: 'checking',
  checks: [],
  progress: 0,
  failureReason: undefined,
  setPhase: (phase) => set({ phase }),
  startBoot: ({ steps }) =>
    set({
      phase: 'checking',
      checks: toBootChecks(steps),
      progress: 0,
      failureReason: undefined,
    }),
  updateCheck: ({ stepId, state, message, error, updatedAt }) =>
    set((store) => {
      if (!store.checks.some((check) => check.id === stepId)) {
        return store;
      }

      const checks = store.checks.map((check) =>
        check.id === stepId
          ? { ...check, state, message, error, updatedAt }
          : check,
      );

      return {
        checks,
        progress: calculateProgress(checks),
        phase: state === 'failed' ? 'failed' : store.phase,
        failureReason: state === 'failed' ? (error ?? message ?? store.failureReason) : store.failureReason,
      };
    }),
  failBoot: (reason) => set({ phase: 'failed', failureReason: reason }),
  reset: () => set({ phase: 'checking', checks: [], progress: 0, failureReason: undefined }),
}));

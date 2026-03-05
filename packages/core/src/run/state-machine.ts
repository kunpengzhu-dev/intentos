import { RunStatus } from '@intentos/protocol';

type RunStatusValue = (typeof RunStatus)[keyof typeof RunStatus];

const VALID_RUN_TRANSITIONS: Record<string, RunStatusValue[]> = {
  [RunStatus.Queued]: [RunStatus.Running, RunStatus.Cancelled],
  [RunStatus.Running]: [RunStatus.WaitingForUser, RunStatus.Completed, RunStatus.Failed, RunStatus.Cancelled],
  [RunStatus.WaitingForUser]: [RunStatus.Running, RunStatus.Cancelled],
  [RunStatus.Completed]: [],
  [RunStatus.Failed]: [],
  [RunStatus.Cancelled]: [],
};

export function isValidRunTransition(from: RunStatusValue, to: RunStatusValue): boolean {
  return VALID_RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

export type RunState = {
  runId: string;
  intentId: string;
  status: RunStatusValue;
  startedAt?: number;
  completedAt?: number;
};

export function createRunState(runId: string, intentId: string): RunState {
  return {
    runId,
    intentId,
    status: RunStatus.Queued,
  };
}

export function transitionRunStatus(
  state: RunState,
  newStatus: RunStatusValue,
  now?: number,
): RunState {
  if (state.status === newStatus) return state;
  if (!isValidRunTransition(state.status, newStatus)) {
    throw new Error(`Invalid run transition: ${state.status} -> ${newStatus}`);
  }
  const updates: Partial<RunState> = { status: newStatus };
  if (newStatus === RunStatus.Running) {
    updates.startedAt = now;
  }
  if (
    newStatus === RunStatus.Completed ||
    newStatus === RunStatus.Failed ||
    newStatus === RunStatus.Cancelled
  ) {
    updates.completedAt = now;
  }
  return { ...state, ...updates };
}

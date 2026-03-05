import { IntentStatus } from '@intentos/protocol';
import { isValidIntentTransition } from './transitions.js';

type IntentStatusValue = (typeof IntentStatus)[keyof typeof IntentStatus];

export type IntentState = {
  intentId: string;
  status: IntentStatusValue;
  currentRunId?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export function createIntentState(intentId: string, title: string, runId: string, now: number): IntentState {
  return {
    intentId,
    status: IntentStatus.Active,
    currentRunId: runId,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

export function transitionIntentStatus(
  state: IntentState,
  newStatus: IntentStatusValue,
  updates?: Partial<Pick<IntentState, 'currentRunId' | 'updatedAt'>>,
): IntentState {
  if (state.status === newStatus) return state;
  if (!isValidIntentTransition(state.status, newStatus)) {
    throw new Error(`Invalid intent transition: ${state.status} -> ${newStatus}`);
  }
  return { ...state, status: newStatus, ...updates };
}

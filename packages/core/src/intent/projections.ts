import { IntentStatus, RunStatus, isReplayable } from '@intentos/protocol';
import type { Envelope } from '@intentos/protocol';

type IntentStatusValue = (typeof IntentStatus)[keyof typeof IntentStatus];
type RunStatusValue = (typeof RunStatus)[keyof typeof RunStatus];

export type IntentSummary = {
  intentId: string;
  title: string;
  summary?: string;
  status: IntentStatusValue;
  currentRunId?: string;
  updatedAt: number;
  needsAttention: boolean;
  progress?: number;
  artifactCount?: number;
};

export type ProjectedRunState = {
  intentId: string;
  runId: string;
  status: RunStatusValue;
  startedAt?: number;
  completedAt?: number;
  steps: Map<string, { id: string; status: string; title: string; progress?: number }>;
  pendingApprovals: Map<string, { id: string; title: string; kind: string }>;
  artifactCount: number;
  error?: { code: string; message: string };
};

/**
 * Derives intent summary from global stream [R] events only.
 * For homepage cards. Does NOT consume run stream events.
 * Returns Desynced status if seq gaps detected.
 */
export function deriveIntentSummary(globalEvents: Envelope[]): Map<string, IntentSummary> {
  const summaries = new Map<string, IntentSummary>();
  let lastSeq = -1;

  for (const evt of globalEvents) {
    if (!isReplayable(evt.type)) continue;
    if (evt.kind !== 'evt') continue;

    if (evt.serverSeq != null) {
      if (lastSeq >= 0 && evt.serverSeq !== lastSeq + 1) {
        for (const [id, summary] of summaries) {
          summaries.set(id, { ...summary, status: IntentStatus.Desynced });
        }
        return summaries;
      }
      lastSeq = evt.serverSeq;
    }

    const payload = evt.payload as Record<string, unknown>;
    const intentId = payload.intentId as string;

    if (evt.type === 'intent/created') {
      summaries.set(intentId, {
        intentId,
        title: (payload.title as string) ?? '',
        summary: payload.summary as string | undefined,
        status: (payload.status as IntentStatusValue) ?? IntentStatus.Active,
        currentRunId: payload.currentRunId as string | undefined,
        updatedAt: (payload.createdAt as number) ?? evt.ts,
        needsAttention: false,
        progress: undefined,
        artifactCount: undefined,
      });
    } else if (evt.type === 'intent/status_changed') {
      summaries.set(intentId, {
        intentId,
        title: (payload.title as string) ?? summaries.get(intentId)?.title ?? '',
        summary: payload.summary as string | undefined,
        status: (payload.status as IntentStatusValue) ?? IntentStatus.Active,
        currentRunId: payload.currentRunId as string | undefined,
        updatedAt: (payload.updatedAt as number) ?? evt.ts,
        needsAttention: (payload.needsAttention as boolean) ?? false,
        progress: payload.progress as number | undefined,
        artifactCount: payload.artifactCount as number | undefined,
      });
    }
  }

  return summaries;
}

/**
 * Derives run status from a single run stream's [R] events.
 * For execution page. Does NOT consume global stream events.
 * Returns partial state if seq gaps detected.
 */
export function deriveRunStatus(runEvents: Envelope[]): ProjectedRunState | null {
  let state: ProjectedRunState | null = null;
  let lastSeq = -1;

  for (const evt of runEvents) {
    if (!isReplayable(evt.type)) continue;
    if (evt.kind !== 'evt') continue;

    if (evt.serverSeq != null) {
      if (lastSeq >= 0 && evt.serverSeq !== lastSeq + 1) {
        if (state) {
          return { ...state, status: RunStatus.Running };
        }
        return null;
      }
      lastSeq = evt.serverSeq;
    }

    const payload = evt.payload as Record<string, unknown>;

    if (evt.type === 'run/started') {
      state = {
        intentId: payload.intentId as string,
        runId: payload.runId as string,
        status: RunStatus.Running,
        startedAt: payload.startedAt as number,
        steps: new Map(),
        pendingApprovals: new Map(),
        artifactCount: 0,
      };
    } else if (state) {
      switch (evt.type) {
        case 'run/step_upserted': {
          const step = payload.step as { id: string; status: string; title: string; progress?: number };
          state.steps.set(step.id, step);
          break;
        }
        case 'run/needs_approval': {
          const approval = payload.approval as { id: string; title: string; kind: string };
          state.pendingApprovals.set(approval.id, approval);
          state.status = RunStatus.WaitingForUser;
          break;
        }
        case 'run/approval_recorded': {
          const approvalId = payload.approvalId as string;
          state.pendingApprovals.delete(approvalId);
          if (state.pendingApprovals.size === 0) {
            state.status = RunStatus.Running;
          }
          break;
        }
        case 'run/completed': {
          const artifacts = payload.artifacts as unknown[];
          state.status = RunStatus.Completed;
          state.completedAt = evt.ts;
          state.artifactCount = artifacts?.length ?? 0;
          break;
        }
        case 'run/failed': {
          const error = payload.error as { code: string; message: string };
          state.status = RunStatus.Failed;
          state.completedAt = evt.ts;
          state.error = error;
          break;
        }
        case 'run/cancelled': {
          state.status = RunStatus.Cancelled;
          state.completedAt = evt.ts;
          break;
        }
      }
    }
  }

  return state;
}

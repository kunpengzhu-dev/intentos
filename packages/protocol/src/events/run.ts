import type { RunStepDTO } from '../dto/run-step.js';
import type { ApprovalDTO } from '../dto/approval.js';
import type { ArtifactDTO } from '../dto/artifact.js';
import type { IntentError } from '../dto/error.js';

export type RunSnapshotPayload = {
  v: number;
  snapshotId: string;
  streamId: string;
  intentId: string;
  runId: string;
  steps: RunStepDTO[];
  approvals: ApprovalDTO[];
  artifacts: ArtifactDTO[];
  coverage: { steps: boolean; approvals: boolean; artifacts: boolean };
  atSeq: number;
  headSeq: number;
};

export type RunStartedPayload = {
  intentId: string;
  runId: string;
  startedAt: number;
};

export type RunStepUpsertedPayload = {
  intentId: string;
  runId: string;
  step: RunStepDTO;
};

export type RunProgressPayload = {
  intentId: string;
  runId: string;
  progress: number;
  message: string;
};

export type RunNeedsApprovalPayload = {
  intentId: string;
  runId: string;
  approval: ApprovalDTO;
};

export type RunApprovePayload = {
  intentId: string;
  runId: string;
  approvalId: string;
  decision: string;
  data?: unknown;
};

export type RunApproveAckPayload = {
  accepted: boolean;
  reason?: string;
  approvalId?: string;
};

export type RunApprovalRecordedPayload = {
  intentId: string;
  runId: string;
  approvalId: string;
  decision: string;
};

export type RunCompletedPayload = {
  intentId: string;
  runId: string;
  artifacts: ArtifactDTO[];
};

export type RunFailedPayload = {
  intentId: string;
  runId: string;
  error: IntentError;
};

export type RunCancelledPayload = {
  intentId: string;
  runId: string;
};

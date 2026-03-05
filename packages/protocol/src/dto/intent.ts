import type { IntentStatus, RunStatus } from '../constants.js';
import type { ArtifactDTO } from './artifact.js';
import type { IntentError } from './error.js';
import type { ChatMessage } from './message.js';

export type IntentDTO = {
  id: string;
  title: string;
  originalMessage: string;
  context?: ChatMessage[];
  status: IntentStatus;
  currentRunId?: string;
  createdAt: number;
};

export type IntentRunDTO = {
  id: string;
  intentId: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  error?: IntentError;
  artifacts: ArtifactDTO[];
};

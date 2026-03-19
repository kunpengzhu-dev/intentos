import type { ChatMessage } from '../dto/message.js';
import type { IntentSuggestionDTO } from '../dto/suggestion.js';

export type IntentCreatePayload = {
  message: string;
  context?: ChatMessage[];
};

export type IntentCreateAckPayload = {
  accepted: boolean;
  reason?: string;
  intentId?: string;
  runId?: string;
};

export type IntentCreatedPayload = {
  intentId: string;
  title: string;
  summary?: string;
  status: string;
  currentRunId: string;
  createdAt: number;
  source: 'user' | 'agent';
};

export type IntentStatusChangedPayload = {
  intentId: string;
  title: string;
  summary?: string;
  status: string;
  currentRunId: string;
  updatedAt: number;
  needsAttention: boolean;
  progress?: number;
  artifactCount?: number;
  artifactPreview?: string;
};

export type IntentSuggestedPayload = {
  suggestion: IntentSuggestionDTO;
  autoCreate: boolean;
};

export type IntentCancelPayload = {
  intentId: string;
};

export type IntentCancelAckPayload = {
  accepted: boolean;
  reason?: string;
  intentId?: string;
};

export type IntentRetryPayload = {
  intentId: string;
};

export type IntentRetryAckPayload = {
  accepted: boolean;
  reason?: string;
  intentId?: string;
  newRunId?: string;
};

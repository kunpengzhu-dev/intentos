export type ChatSendPayload = {
  message: string;
  contextId?: string;
};

export type ChatDeltaPayload = {
  delta: string;
  done: boolean;
  contextId: string;
  runId?: string;
};

export type ChatHistoryPayload = {
  contextId?: string;
  limit?: number;
};

export type ChatHistoryTextPart = {
  type: 'text';
  text: string;
};

export type ChatHistoryToolCallPart = {
  type: 'toolCall';
  id: string;
  name: string;
  argumentsJson?: string;
};

export type ChatHistoryToolResultPart = {
  type: 'toolResult';
  toolCallId?: string;
  toolName?: string;
  text: string;
  isError?: boolean;
};

export type ChatHistoryPart =
  | ChatHistoryTextPart
  | ChatHistoryToolCallPart
  | ChatHistoryToolResultPart;

export type ChatHistoryEntry = {
  id: string;
  role: 'user' | 'assistant' | 'toolResult';
  timestamp: number;
  stopReason?: string;
  parts: ChatHistoryPart[];
};

export type ChatHistoryOkPayload = {
  accepted: boolean;
  contextId?: string;
  limit: number;
  reason?: string;
  entries: ChatHistoryEntry[];
};

export type ChatHistorySyncPayload = {
  contextId: string;
  entries: ChatHistoryEntry[];
};

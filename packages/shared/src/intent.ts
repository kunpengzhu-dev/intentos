export type IntentJsonPrimitive = string | number | boolean | null;

export type IntentJsonValue =
  | IntentJsonPrimitive
  | IntentJsonValue[]
  | { [key: string]: IntentJsonValue };

export type IntentKind = "orb" | "intent";

export type IntentPlacement = "orb" | "background";

export type IntentStatus =
  | "ready"
  | "active"
  | "idle"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "aborted"
  | "unknown"
  | (string & {});

export type IntentExecutionPhase =
  | "ready"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "aborted"
  | "idle"
  | "unknown"
  | (string & {});

export type IntentRunDisposition =
  | "success"
  | "failed"
  | "aborted"
  | "unknown"
  | (string & {});

export type IntentMessageRole =
  | "user"
  | "assistant"
  | "system"
  | "tool"
  | "other"
  | (string & {});

export type IntentMessagePart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      mimeType?: string;
      content?: string;
      source?: Record<string, IntentJsonValue>;
    }
  | {
      type: "toolcall";
      id?: string;
      name: string;
      arguments?: IntentJsonValue;
      summary?: string;
    }
  | {
      type: "toolresult";
      name: string;
      text?: string;
      summary?: string;
      isError?: boolean;
    }
  | ({
      type?: string;
    } & Record<string, IntentJsonValue>);

export type IntentMessageSource = {
  kind?: string;
  intentKey?: string;
  channel?: string;
  tool?: string;
};

export type IntentMessage = {
  id: string;
  role: IntentMessageRole;
  parts: IntentMessagePart[];
  text: string;
  timestamp: number | null;
  runId?: string;
  toolCallId?: string;
  displayGroupId?: string;
  source?: IntentMessageSource;
};

export type IntentPreviewItem = {
  role: IntentMessageRole;
  text: string;
};

export type IntentOrigin = {
  label?: string;
  provider?: string;
  surface?: string;
  chatType?: string;
  from?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
};

export type IntentDelivery = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
};

export type IntentLineage = {
  orbIntentKey: string;
  parentIntentKey?: string;
  spawnedByIntentKey?: string;
  depth: number;
};

export type IntentTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  contextTokens?: number;
};

export type IntentExecutionSnapshot = {
  phase: IntentExecutionPhase;
  busy: boolean;
  interruptible: boolean;
  lastDisposition?: IntentRunDisposition;
};

export type IntentCapabilities = {
  canSendMessages: boolean;
  canAbortRuns: boolean;
  canPatch: boolean;
  canReset: boolean;
  canDelete: boolean;
  canCompact: boolean;
  supportsHistory: boolean;
  supportsPreview: boolean;
  supportsStreaming: boolean;
};

export type IntentRuntimeSnapshot = {
  backingId?: string;
  model?: string;
  modelProvider?: string;
  channel?: string;
  chatType?: string;
  spawnedBy?: string;
  deliveryTarget?: string;
  origin?: IntentOrigin;
  delivery?: IntentDelivery;
  lineage: IntentLineage;
  tokens?: IntentTokenUsage;
};

export type IntentDefaults = {
  modelProvider: string | null;
  model: string | null;
  contextTokens: number | null;
};

export type IntentSummary = {
  id: string;
  key: string;
  kind: IntentKind;
  placement: IntentPlacement;
  title: string;
  status: IntentStatus;
  updatedAt: number | null;
  previewText?: string;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  execution: IntentExecutionSnapshot;
  capabilities: IntentCapabilities;
  runtime: IntentRuntimeSnapshot;
};

export type IntentDetail = IntentSummary & {
  defaults: IntentDefaults;
  preview?: IntentPreviewItem[];
};

export type IntentView = {
  intent: IntentDetail;
  messages: IntentMessage[];
};

export type IntentEvent =
  | {
      type: "message";
      intentKey: string;
      runId: string;
      state: string;
      message: IntentMessage;
      usage?: Record<string, IntentJsonValue>;
    }
  | {
      type: "status";
      intentKey: string;
      runId: string;
      state: string;
      errorMessage?: string | null;
      usage?: Record<string, IntentJsonValue>;
    };

export type IntentStreamEvent =
  | {
      type: "run";
      intentKey: string;
      runId: string;
      phase: string;
      seq?: number;
      timestamp: number | null;
    }
  | {
      type: "message";
      intentKey: string;
      runId: string;
      state: string;
      message: IntentMessage;
      seq?: number;
      timestamp: number | null;
      usage?: Record<string, IntentJsonValue>;
    }
  | {
      type: "tool";
      intentKey: string;
      runId: string;
      toolCallId: string;
      toolName?: string;
      phase: string;
      seq?: number;
      timestamp: number | null;
      args?: IntentJsonValue;
      meta?: string;
      summary?: string;
      isError?: boolean;
    }
  | {
      type: "status";
      intentKey: string;
      runId: string;
      state: string;
      seq?: number;
      timestamp: number | null;
      errorMessage?: string | null;
      usage?: Record<string, IntentJsonValue>;
    };

export type IntentListResponse = {
  orbIntentKey: string;
  intents: IntentSummary[];
};

export type IntentDetailResponse = {
  intent: IntentDetail;
};

export type IntentViewResponse = IntentView;

export type IntentMessagesResponse = {
  intent: IntentSummary;
  messages: IntentMessage[];
};

export type IntentPreviewResponse = {
  intent: IntentSummary;
  preview: IntentPreviewItem[];
};

export type SendIntentMessageRequest = {
  text: string;
  thinking?: string;
  deliver?: boolean;
  waitForFinal?: boolean;
  timeoutMs?: number;
};

export type SendIntentMessageResponse = {
  intent: IntentSummary;
  runId: string;
  accepted: boolean;
  finalState?: string;
  finalMessage?: IntentMessage;
};

export type AbortIntentMessageRequest = {
  runId?: string;
};

export type AbortIntentMessageResponse = {
  ok: boolean;
  intentKey: string;
  aborted?: boolean;
  runIds?: string[];
};

export type PatchIntentRequest = {
  changes: Record<string, IntentJsonValue>;
};

export type PatchIntentResponse = {
  intent: IntentDetail;
};

export type ResetIntentRequest = {
  reason?: string;
};

export type ResetIntentResponse = {
  ok: boolean;
  intentKey: string;
  intent: IntentDetail;
};

export type CompactIntentRequest = {
  reason?: string;
};

export type CompactIntentResponse = {
  ok: boolean;
  intentKey: string;
  compacted?: boolean;
  reason?: string;
};

export type DeleteIntentResponse = {
  ok: boolean;
  intentKey: string;
  deleted?: boolean;
  archived?: boolean;
};

export type BootSetupPhase =
  | "idle"
  | "installing-package"
  | "running-commands"
  | "ready"
  | "failed";

export type BootSetupStepState = "pending" | "running" | "completed" | "failed";

export type BootSetupStep = {
  id: string;
  label: string;
  command?: string;
  durationMs: number;
  state: BootSetupStepState;
};

export type BootSetupStatus = {
  enabled: boolean;
  phase: BootSetupPhase;
  summary: string;
  packageName?: string;
  steps: BootSetupStep[];
  currentStepId?: string;
  lastError?: string;
};

export type BootSetupEvent = {
  type: "boot-status";
  bootSetup: BootSetupStatus;
};

export type HealthResponse = {
  ok: boolean;
  gateway: {
    connectionState: string;
  };
};

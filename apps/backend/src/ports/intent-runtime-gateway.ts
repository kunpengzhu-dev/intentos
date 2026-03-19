import type {
  IntentDefaults,
  IntentDelivery,
  IntentJsonValue,
  IntentMessagePart,
  IntentMessageRole,
  IntentOrigin,
  IntentPreviewItem,
  IntentTokenUsage,
} from "@intentos/shared";

export type IntentRuntimeConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | (string & {});

export type RuntimeIntentRecord = {
  key: string;
  title?: string;
  previewText?: string;
  updatedAt: number | null;
  backingId?: string;
  spawnedBy?: string;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  modelProvider?: string;
  model?: string;
  contextTokens?: number;
  channel?: string;
  chatType?: string;
  deliveryTarget?: string;
  origin?: IntentOrigin;
  delivery?: IntentDelivery;
  tokens?: IntentTokenUsage;
};

export type RuntimeIntentCatalog = {
  defaults: IntentDefaults;
  intents: RuntimeIntentRecord[];
};

export type RuntimeIntentPreview = {
  intentKey: string;
  status: "ok" | "empty" | "missing" | "error";
  items: IntentPreviewItem[];
};

export type RuntimeIntentMessageSource = {
  kind?: string;
  sourceIntentKey?: string;
  sourceChannel?: string;
  sourceTool?: string;
};

export type RuntimeIntentMessageRecord = {
  role: IntentMessageRole;
  parts?: IntentMessagePart[];
  text?: string;
  timestamp?: number;
  runId?: string;
  toolCallId?: string;
  source?: RuntimeIntentMessageSource;
};

export type RuntimeIntentHistory = {
  intentKey: string;
  messages: RuntimeIntentMessageRecord[];
};

export type RuntimeIntentSendAck = {
  runId: string;
  status: string;
};

export type RuntimeIntentEvent = {
  intentKey?: string;
  runId: string;
  state: string;
  message?: RuntimeIntentMessageRecord;
  errorMessage?: string | null;
  usage?: Record<string, IntentJsonValue>;
};

export type RuntimeIntentStreamEvent =
  | {
      type: "run";
      intentKey?: string;
      runId: string;
      phase: string;
      seq?: number;
      timestamp?: number;
    }
  | {
      type: "message";
      intentKey?: string;
      runId: string;
      state: string;
      seq?: number;
      timestamp?: number;
      message: RuntimeIntentMessageRecord;
      usage?: Record<string, IntentJsonValue>;
    }
  | {
      type: "tool";
      intentKey?: string;
      runId: string;
      toolCallId?: string;
      toolName?: string;
      phase: string;
      seq?: number;
      timestamp?: number;
      args?: IntentJsonValue;
      meta?: string;
      summary?: string;
      isError?: boolean;
    }
  | {
      type: "status";
      intentKey?: string;
      runId: string;
      state: string;
      seq?: number;
      timestamp?: number;
      errorMessage?: string | null;
      usage?: Record<string, IntentJsonValue>;
    };

export type RuntimeIntentPatchResult = {
  ok: boolean;
};

export type RuntimeIntentResetResult = {
  ok: boolean;
};

export type RuntimeIntentDeleteResult = {
  ok: boolean;
  deleted?: boolean;
  archived?: boolean;
};

export type RuntimeIntentCompactResult = {
  ok: boolean;
  compacted?: boolean;
  reason?: string;
};

export type RuntimeIntentEventListener = (payload: RuntimeIntentStreamEvent) => void;

export interface IntentRuntimeGateway {
  getConnectionState(): IntentRuntimeConnectionState;
  listIntents(): Promise<RuntimeIntentCatalog>;
  previewIntents(params: {
    intentKeys: string[];
    limit?: number;
    maxChars?: number;
  }): Promise<RuntimeIntentPreview[]>;
  readIntentMessages(params: { intentKey: string; limit?: number }): Promise<RuntimeIntentHistory>;
  sendIntentMessage(params: {
    intentKey: string;
    message: string;
    thinking?: string;
    deliver?: boolean;
    timeoutMs?: number;
  }): Promise<RuntimeIntentSendAck>;
  sendIntentMessageAndWait(params: {
    intentKey: string;
    message: string;
    thinking?: string;
    deliver?: boolean;
    timeoutMs?: number;
  }): Promise<{
    ack: RuntimeIntentSendAck;
    final: RuntimeIntentEvent;
  }>;
  abortIntentRun(params: {
    intentKey: string;
    runId?: string;
  }): Promise<{
    ok: boolean;
    aborted?: boolean;
    runIds?: string[];
  }>;
  updateIntent(params: {
    intentKey: string;
    changes: Record<string, IntentJsonValue>;
  }): Promise<RuntimeIntentPatchResult>;
  resetIntent(params: {
    intentKey: string;
    reason?: string;
  }): Promise<RuntimeIntentResetResult>;
  deleteIntent(params: {
    intentKey: string;
    deleteTranscript?: boolean;
    emitLifecycleHooks?: boolean;
  }): Promise<RuntimeIntentDeleteResult>;
  compactIntent(params: {
    intentKey: string;
    reason?: string;
  }): Promise<RuntimeIntentCompactResult>;
  onIntentEvent(listener: RuntimeIntentEventListener): Promise<() => void>;
}

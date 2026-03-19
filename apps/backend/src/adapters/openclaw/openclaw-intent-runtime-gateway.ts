import {
  OpenClawGatewayClient,
  type AgentEventPayload,
  type ChatEventPayload,
  type ChatMessage,
  type ChatMessageContentBlock,
  type GatewayEventFrame,
  type GatewaySessionRow,
  type JsonValue,
  type SessionsPreviewEntry,
} from "openclaw-gateway-client";
import type {
  IntentJsonValue,
  IntentMessagePart,
  IntentMessageRole,
  IntentOrigin,
  IntentPreviewItem,
  IntentTokenUsage,
} from "@intentos/shared";
import { GatewayConnectionError } from "../../domain/errors.js";
import { summarizeToolCall, summarizeToolResult } from "../../domain/tool-summary.js";
import type {
  IntentRuntimeGateway,
  RuntimeIntentCatalog,
  RuntimeIntentEventListener,
  RuntimeIntentEvent,
  RuntimeIntentHistory,
  RuntimeIntentMessageRecord,
  RuntimeIntentPreview,
  RuntimeIntentRecord,
  RuntimeIntentStreamEvent,
} from "../../ports/intent-runtime-gateway.js";

export type OpenClawIntentRuntimeGatewayOptions = {
  client: OpenClawGatewayClient;
};

function toIntentRole(role: string): IntentMessageRole {
  const normalized = role.trim().toLowerCase();
  if (normalized === "toolresult") {
    return "tool";
  }
  if (role === "user" || role === "assistant" || role === "system" || role === "tool") {
    return role;
  }
  return "other";
}

function normalizeBlockType(type: unknown): string | undefined {
  if (typeof type !== "string") {
    return undefined;
  }
  return type.replace(/[_-]/gu, "").toLowerCase();
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonString(record: Record<string, JsonValue>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readJsonRecord(
  record: Record<string, JsonValue>,
  key: string,
): Record<string, IntentJsonValue> | undefined {
  const value = record[key];
  return isJsonRecord(value) ? (value as Record<string, IntentJsonValue>) : undefined;
}

function readToolArguments(block: ChatMessageContentBlock): IntentJsonValue | undefined {
  if ("arguments" in block && block.arguments !== undefined) {
    return block.arguments as IntentJsonValue;
  }

  if ("partialJson" in block && typeof block.partialJson === "string") {
    try {
      return JSON.parse(block.partialJson) as IntentJsonValue;
    } catch {
      return block.partialJson;
    }
  }

  return undefined;
}

function readToolResultText(block: ChatMessageContentBlock): string | undefined {
  if ("text" in block && typeof block.text === "string") {
    return block.text;
  }
  if ("content" in block && typeof block.content === "string") {
    return block.content;
  }
  if ("output" in block && typeof block.output === "string") {
    return block.output;
  }
  return undefined;
}

function readMessageString(message: ChatMessage, key: string): string | undefined {
  const value = message[key];
  return typeof value === "string" ? value : undefined;
}

function mapToolResultMessage(message: ChatMessage): IntentMessagePart[] {
  const toolName = readMessageString(message, "toolName") ?? "toolresult";
  const rawText =
    (Array.isArray(message.content)
      ? message.content.map((block) => readToolResultText(block)).find((value) => typeof value === "string")
      : undefined) ?? (typeof message.text === "string" ? message.text : undefined);
  const result = summarizeToolResult({
    toolName,
    text: rawText,
  });

  return [
    {
      type: "toolresult",
      name: toolName,
      ...(rawText === undefined ? {} : { text: rawText }),
      ...(result.summary === undefined ? {} : { summary: result.summary }),
      ...(result.isError === undefined ? {} : { isError: result.isError }),
    },
  ];
}

function mapContentBlock(block: ChatMessageContentBlock): IntentMessagePart {
  const blockType = normalizeBlockType(block.type);
  const record = block as Record<string, JsonValue>;

  if (blockType === "text" && "text" in block && typeof block.text === "string") {
    return { type: "text", text: block.text };
  }
  if (blockType === "image") {
    return {
      type: "image",
      ...(readJsonString(record, "mimeType") ? { mimeType: readJsonString(record, "mimeType") } : {}),
      ...(readJsonString(record, "content") ? { content: readJsonString(record, "content") } : {}),
      ...(readJsonRecord(record, "source") ? { source: readJsonRecord(record, "source") } : {}),
    };
  }
  if (blockType === "toolcall") {
    const argumentsValue = readToolArguments(block);
    const summary = summarizeToolCall(readJsonString(record, "name"), argumentsValue);
    return {
      type: "toolcall",
      ...(readJsonString(record, "id") ? { id: readJsonString(record, "id") } : {}),
      name: readJsonString(record, "name") ?? "toolcall",
      ...(argumentsValue === undefined ? {} : { arguments: argumentsValue }),
      ...(summary === undefined ? {} : { summary }),
    };
  }
  if (blockType === "toolresult") {
    const text = readToolResultText(block);
    return {
      type: "toolresult",
      name: readJsonString(record, "name") ?? "toolresult",
      ...(text === undefined ? {} : { text }),
    };
  }
  return block as IntentMessagePart;
}

function mapGatewayMessage(message: ChatMessage): RuntimeIntentMessageRecord {
  const role = toIntentRole(message.role);
  const parts =
    role === "tool"
      ? mapToolResultMessage(message)
      : Array.isArray(message.content)
        ? message.content.map((block) => mapContentBlock(block))
        : undefined;
  const provenance =
    typeof message.provenance === "object" &&
    message.provenance !== null &&
    !Array.isArray(message.provenance)
      ? (message.provenance as Record<string, IntentJsonValue>)
      : undefined;

  return {
    role,
    ...(parts && parts.length > 0 ? { parts } : {}),
    ...(typeof message.text === "string"
      ? { text: message.text }
      : Array.isArray(parts)
        ? {
            text: parts
              .map((part) => {
                if (part.type === "text") {
                  return part.text;
                }
                if (part.type === "toolresult") {
                  return part.text ?? "";
                }
                if (part.type === "toolcall") {
                  return `${part.name}()`;
                }
                return "";
              })
              .filter(Boolean)
              .join("\n"),
          }
        : {}),
    ...(typeof message.timestamp === "number" ? { timestamp: message.timestamp } : {}),
    ...(typeof message.runId === "string" ? { runId: message.runId } : {}),
    ...(typeof message.toolCallId === "string"
      ? { toolCallId: message.toolCallId }
      : Array.isArray(message.content)
        ? (() => {
            const toolCallBlock = message.content.find(
              (block) => isJsonRecord(block) && normalizeBlockType(block.type) === "toolcall",
            );
            const toolCallId = toolCallBlock ? readJsonString(toolCallBlock, "id") : undefined;
            return toolCallId
              ? { toolCallId }
              : {};
          })()
        : {}),
    ...(provenance
      ? {
          source: {
            ...(typeof provenance.kind === "string" ? { kind: provenance.kind } : {}),
            ...(typeof provenance.sourceSessionKey === "string"
              ? { sourceIntentKey: provenance.sourceSessionKey }
              : {}),
            ...(typeof provenance.sourceChannel === "string"
              ? { sourceChannel: provenance.sourceChannel }
              : {}),
            ...(typeof provenance.sourceTool === "string"
              ? { sourceTool: provenance.sourceTool }
              : {}),
          },
        }
      : {}),
  };
}

export const __testOnly = {
  mapContentBlock,
  mapGatewayMessage,
};

function mapGatewayPreview(preview: SessionsPreviewEntry): RuntimeIntentPreview {
  return {
    intentKey: preview.key,
    status: preview.status,
    items: preview.items.map(
      (item): IntentPreviewItem => ({
        role: toIntentRole(item.role),
        text: item.text,
      }),
    ),
  };
}

function mapOrigin(row: GatewaySessionRow): IntentOrigin | undefined {
  if (!row.origin) {
    return undefined;
  }
  return {
    label: row.origin.label,
    provider: row.origin.provider,
    surface: row.origin.surface,
    chatType: row.origin.chatType,
    from: row.origin.from,
    to: row.origin.to,
    accountId: row.origin.accountId,
    threadId: row.origin.threadId,
  };
}

function mapTokenUsage(row: GatewaySessionRow): IntentTokenUsage | undefined {
  if (
    row.inputTokens === undefined &&
    row.outputTokens === undefined &&
    row.totalTokens === undefined &&
    row.totalTokensFresh === undefined &&
    row.contextTokens === undefined
  ) {
    return undefined;
  }
  return {
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    totalTokensFresh: row.totalTokensFresh,
    contextTokens: row.contextTokens,
  };
}

function mapGatewayIntent(row: GatewaySessionRow): RuntimeIntentRecord {
  return {
    key: row.key,
    title: row.displayName ?? row.derivedTitle ?? row.label ?? row.subject ?? row.key,
    previewText: row.lastMessagePreview,
    updatedAt: row.updatedAt,
    backingId: row.sessionId,
    spawnedBy: row.spawnedBy,
    abortedLastRun: row.abortedLastRun,
    thinkingLevel: row.thinkingLevel,
    verboseLevel: row.verboseLevel,
    reasoningLevel: row.reasoningLevel,
    elevatedLevel: row.elevatedLevel,
    modelProvider: row.modelProvider,
    model: row.model,
    contextTokens: row.contextTokens,
    channel: row.channel ?? row.lastChannel,
    chatType: row.chatType,
    deliveryTarget: row.lastTo,
    origin: mapOrigin(row),
    delivery: row.deliveryContext
      ? {
          channel: row.deliveryContext.channel,
          to: row.deliveryContext.to,
          accountId: row.deliveryContext.accountId,
          threadId: row.deliveryContext.threadId,
        }
      : undefined,
    tokens: mapTokenUsage(row),
  };
}

function mapGatewayEvent(payload: ChatEventPayload): RuntimeIntentEvent {
  const message = payload.message ? mapGatewayMessage(payload.message) : undefined;
  return {
    ...(typeof payload.sessionKey === "string" ? { intentKey: payload.sessionKey } : {}),
    runId: payload.runId,
    state: payload.state,
    ...(message ? { message } : {}),
    ...(typeof payload.errorMessage === "string" || payload.errorMessage === null
      ? { errorMessage: payload.errorMessage }
      : {}),
    ...(payload.usage && typeof payload.usage === "object"
      ? { usage: payload.usage as Record<string, IntentJsonValue> }
      : {}),
  };
}

function mapGatewayChatStreamEvent(payload: ChatEventPayload): RuntimeIntentStreamEvent {
  const base = {
    ...(typeof payload.sessionKey === "string" ? { intentKey: payload.sessionKey } : {}),
    runId: payload.runId,
    ...(typeof payload.seq === "number" ? { seq: payload.seq } : {}),
  };

  const timestamp =
    payload.message && typeof payload.message.timestamp === "number" ? payload.message.timestamp : undefined;

  if (payload.message) {
    return {
      type: "message",
      ...base,
      state: payload.state,
      ...(timestamp === undefined ? {} : { timestamp }),
      message: mapGatewayMessage(payload.message),
      ...(payload.usage && typeof payload.usage === "object"
        ? { usage: payload.usage as Record<string, IntentJsonValue> }
        : {}),
    };
  }

  return {
    type: "status",
    ...base,
    state: payload.state,
    ...(timestamp === undefined ? {} : { timestamp }),
    ...(typeof payload.errorMessage === "string" || payload.errorMessage === null
      ? { errorMessage: payload.errorMessage }
      : {}),
    ...(payload.usage && typeof payload.usage === "object"
      ? { usage: payload.usage as Record<string, IntentJsonValue> }
      : {}),
  };
}

function readAgentEventString(
  data: AgentEventPayload["data"] | undefined,
  key: string,
): string | undefined {
  if (!data) {
    return undefined;
  }
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

function readAgentEventBoolean(
  data: AgentEventPayload["data"] | undefined,
  key: string,
): boolean | undefined {
  if (!data) {
    return undefined;
  }
  const value = data[key];
  return typeof value === "boolean" ? value : undefined;
}

function readAgentEventNumber(
  data: AgentEventPayload["data"] | undefined,
  key: string,
): number | undefined {
  if (!data) {
    return undefined;
  }
  const value = data[key];
  return typeof value === "number" ? value : undefined;
}

function readAgentEventJson(
  data: AgentEventPayload["data"] | undefined,
  key: string,
): IntentJsonValue | undefined {
  if (!data) {
    return undefined;
  }
  const value = data[key];
  return value === undefined ? undefined : (value as IntentJsonValue);
}

function mapGatewayAgentStreamEvent(payload: AgentEventPayload): RuntimeIntentStreamEvent | null {
  if (typeof payload.runId !== "string") {
    return null;
  }

  const stream = typeof payload.stream === "string" ? payload.stream : undefined;
  const base = {
    ...(typeof payload.sessionKey === "string" ? { intentKey: payload.sessionKey } : {}),
    runId: payload.runId,
    ...(typeof payload.seq === "number" ? { seq: payload.seq } : {}),
    ...(typeof payload.ts === "number" ? { timestamp: payload.ts } : {}),
  };

  if (stream === "lifecycle") {
    const phase = readAgentEventString(payload.data, "phase");
    if (!phase) {
      return null;
    }

    return {
      type: "run",
      ...base,
      phase,
    };
  }

  if (stream === "tool") {
    const phase = readAgentEventString(payload.data, "phase");
    if (!phase) {
      return null;
    }
    const toolName = readAgentEventString(payload.data, "name");
    const args = readAgentEventJson(payload.data, "args");
    const meta = readAgentEventString(payload.data, "meta");
    const summary =
      summarizeToolResult({
        toolName,
        meta,
      }).summary ?? summarizeToolCall(toolName, args);

    return {
      type: "tool",
      ...base,
      ...(readAgentEventString(payload.data, "toolCallId")
        ? { toolCallId: readAgentEventString(payload.data, "toolCallId") }
        : {}),
      ...(toolName ? { toolName } : {}),
      phase,
      ...(args === undefined ? {} : { args }),
      ...(meta ? { meta } : {}),
      ...(summary === undefined ? {} : { summary }),
      ...(readAgentEventBoolean(payload.data, "isError") === undefined
        ? {}
        : { isError: readAgentEventBoolean(payload.data, "isError") }),
    };
  }

  return null;
}

export class OpenClawIntentRuntimeGateway implements IntentRuntimeGateway {
  private connectPromise: Promise<unknown> | null = null;

  constructor(private readonly options: OpenClawIntentRuntimeGatewayOptions) {}

  getConnectionState() {
    return this.options.client.connectionState;
  }

  async listIntents(): Promise<RuntimeIntentCatalog> {
    await this.ensureConnected();
    const result = await this.options.client.sessions.list();
    return {
      defaults: result.defaults,
      intents: result.sessions.map((row) => mapGatewayIntent(row)),
    };
  }

  async previewIntents(params: {
    intentKeys: string[];
    limit?: number;
    maxChars?: number;
  }) {
    await this.ensureConnected();
    const result = await this.options.client.sessions.preview({
      keys: params.intentKeys,
      limit: params.limit,
      maxChars: params.maxChars,
    });
    return result.previews.map((preview) => mapGatewayPreview(preview));
  }

  async readIntentMessages(params: { intentKey: string; limit?: number }): Promise<RuntimeIntentHistory> {
    await this.ensureConnected();
    const result = await this.options.client.chat.history({
      sessionKey: params.intentKey,
      limit: params.limit,
    });
    return {
      intentKey: result.sessionKey,
      messages: result.messages.map((message) => mapGatewayMessage(message)),
    };
  }

  async sendIntentMessage(params: {
    intentKey: string;
    message: string;
    thinking?: string;
    deliver?: boolean;
    timeoutMs?: number;
  }) {
    await this.ensureConnected();
    const result = await this.options.client.chat.send({
      sessionKey: params.intentKey,
      message: params.message,
      thinking: params.thinking,
      deliver: params.deliver,
      timeoutMs: params.timeoutMs,
    });
    return {
      runId: result.runId,
      status: result.status,
    };
  }

  async sendIntentMessageAndWait(params: {
    intentKey: string;
    message: string;
    thinking?: string;
    deliver?: boolean;
    timeoutMs?: number;
  }) {
    await this.ensureConnected();
    const result = await this.options.client.chat.sendAndWaitFinal({
      sessionKey: params.intentKey,
      message: params.message,
      thinking: params.thinking,
      deliver: params.deliver,
      timeoutMs: params.timeoutMs,
    });
    return {
      ack: {
        runId: result.ack.runId,
        status: result.ack.status,
      },
      final: mapGatewayEvent(result.final),
    };
  }

  async abortIntentRun(params: { intentKey: string; runId?: string }) {
    await this.ensureConnected();
    const result = await this.options.client.chat.abort({
      sessionKey: params.intentKey,
      runId: params.runId,
    });
    return {
      ok: result.ok,
      aborted: result.aborted,
      runIds: result.runIds,
    };
  }

  async updateIntent(params: {
    intentKey: string;
    changes: Record<string, JsonValue>;
  }) {
    await this.ensureConnected();
    await this.options.client.sessions.patch({
      key: params.intentKey,
      ...params.changes,
    });
    return { ok: true };
  }

  async resetIntent(params: { intentKey: string; reason?: string }) {
    await this.ensureConnected();
    const result = await this.options.client.sessions.reset({
      key: params.intentKey,
      reason: params.reason,
    });
    return { ok: result.ok };
  }

  async deleteIntent(params: {
    intentKey: string;
    deleteTranscript?: boolean;
    emitLifecycleHooks?: boolean;
  }) {
    await this.ensureConnected();
    const result = await this.options.client.sessions.delete({
      key: params.intentKey,
      deleteTranscript: params.deleteTranscript,
      emitLifecycleHooks: params.emitLifecycleHooks,
    });
    return {
      ok: result.ok,
      deleted: result.deleted,
      archived: result.archived,
    };
  }

  async compactIntent(params: { intentKey: string; reason?: string }) {
    await this.ensureConnected();
    const result = await this.options.client.sessions.compact({
      key: params.intentKey,
      reason: params.reason,
    });
    return {
      ok: result.ok,
      compacted: result.compacted,
      reason: result.reason,
    };
  }

  async onIntentEvent(listener: RuntimeIntentEventListener): Promise<() => void> {
    await this.ensureConnected();
    const unsubscribeChat = this.options.client.chat.onEvent((frame: GatewayEventFrame<ChatEventPayload>) => {
      if (frame.payload) {
        listener(mapGatewayChatStreamEvent(frame.payload));
      }
    });
    const unsubscribeAgent = this.options.client.agent.onEvent(
      (frame: GatewayEventFrame<AgentEventPayload>) => {
        if (!frame.payload) {
          return;
        }
        const event = mapGatewayAgentStreamEvent(frame.payload);
        if (event) {
          listener(event);
        }
      },
    );

    return () => {
      unsubscribeChat();
      unsubscribeAgent();
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.options.client.connectionState === "connected") {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.options.client.connect().catch((error: unknown) => {
        throw new GatewayConnectionError("Failed to connect to OpenClaw gateway", {
          cause: error,
        });
      });
      void this.connectPromise.finally(() => {
        this.connectPromise = null;
      });
    }

    const connectPromise = this.connectPromise;
    if (!connectPromise) {
      throw new GatewayConnectionError("Failed to start gateway connection");
    }

    await connectPromise;
  }
}

import type {
  IntentCapabilities,
  IntentDetail,
  IntentExecutionSnapshot,
  IntentEvent,
  IntentMessage,
  IntentMessagePart,
  IntentPreviewItem,
  IntentStatus,
  IntentSummary,
} from "@intentos/shared";
import { isRenderableIntentMessage } from "./intent-message-policy.js";
import type {
  RuntimeIntentEvent,
  RuntimeIntentMessageRecord,
  RuntimeIntentPreview,
  RuntimeIntentRecord,
} from "../ports/intent-runtime-gateway.js";

type MapperOptions = {
  orbIntentKey: string;
};

function toIntentRole(role: string): IntentMessage["role"] {
  if (role === "user" || role === "assistant" || role === "system" || role === "tool") {
    return role;
  }
  return "other";
}

function messageTextFromParts(parts: IntentMessagePart[]): string {
  return parts
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
      if (part.type === "image") {
        return "[image]";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function deriveIntentTitle(record: RuntimeIntentRecord, kind: IntentSummary["kind"]): string {
  if (kind === "orb") {
    return "Orb";
  }
  return record.title ?? record.key;
}

function deriveIntentStatus(record: RuntimeIntentRecord): IntentStatus {
  if (record.abortedLastRun) {
    return "aborted";
  }
  if (typeof record.updatedAt === "number") {
    return Date.now() - record.updatedAt < 5 * 60 * 1000 ? "running" : "ready";
  }
  return "unknown";
}

function deriveExecution(record: RuntimeIntentRecord): IntentExecutionSnapshot {
  if (record.abortedLastRun) {
    return {
      phase: "aborted",
      busy: false,
      interruptible: false,
      lastDisposition: "aborted",
    };
  }

  const active =
    typeof record.updatedAt === "number" && Date.now() - record.updatedAt < 5 * 60 * 1000;
  return {
    phase: active ? "running" : "ready",
    busy: active,
    interruptible: active,
    lastDisposition: "unknown",
  };
}

function deriveCapabilities(kind: IntentSummary["kind"]): IntentCapabilities {
  return {
    canSendMessages: true,
    canAbortRuns: true,
    canPatch: true,
    canReset: true,
    canDelete: kind !== "orb",
    canCompact: true,
    supportsHistory: true,
    supportsPreview: true,
    supportsStreaming: true,
  };
}

function deriveLineage(record: RuntimeIntentRecord, orbIntentKey: string) {
  if (record.key === orbIntentKey) {
    return {
      orbIntentKey,
      depth: 0,
    };
  }

  return {
    orbIntentKey,
    parentIntentKey: record.spawnedBy ? orbIntentKey : undefined,
    spawnedByIntentKey: record.spawnedBy,
    depth: 1,
  };
}

export class IntentMapper {
  constructor(private readonly options: MapperOptions) {}

  toIntentSummary(record: RuntimeIntentRecord): IntentSummary {
    const kind = record.key === this.options.orbIntentKey ? "orb" : "intent";
    const execution = deriveExecution(record);
    return {
      id: record.key,
      key: record.key,
      kind,
      placement: kind === "orb" ? "orb" : "background",
      title: deriveIntentTitle(record, kind),
      status: deriveIntentStatus(record),
      updatedAt: record.updatedAt ?? null,
      previewText: record.previewText ?? undefined,
      thinkingLevel: record.thinkingLevel,
      verboseLevel: record.verboseLevel,
      reasoningLevel: record.reasoningLevel,
      elevatedLevel: record.elevatedLevel,
      execution,
      capabilities: deriveCapabilities(kind),
      runtime: {
        backingId: record.backingId,
        model: record.model,
        modelProvider: record.modelProvider,
        channel: record.channel,
        chatType: record.chatType,
        spawnedBy: record.spawnedBy,
        deliveryTarget: record.deliveryTarget,
        origin: record.origin,
        delivery: record.delivery,
        lineage: deriveLineage(record, this.options.orbIntentKey),
        tokens: record.tokens,
      },
    };
  }

  toIntentDetail(
    record: RuntimeIntentRecord,
    defaults: IntentDetail["defaults"],
    preview?: RuntimeIntentPreview,
  ): IntentDetail {
    return {
      ...this.toIntentSummary(record),
      defaults,
      preview: preview?.items.map((item) => this.toIntentPreview(item)),
    };
  }

  toIntentPreview(item: IntentPreviewItem): IntentPreviewItem {
    return {
      role: toIntentRole(item.role),
      text: item.text,
    };
  }

  toIntentMessage(message: RuntimeIntentMessageRecord, index: number): IntentMessage | null {
    if (!isRenderableIntentMessage(message)) {
      return null;
    }

    const parts =
      Array.isArray(message.parts) && message.parts.length > 0
        ? message.parts
        : typeof message.text === "string" && message.text.length > 0
          ? [{ type: "text", text: message.text }]
          : [];
    return {
      id: `${message.runId ?? "message"}:${message.timestamp ?? index}:${index}`,
      role: toIntentRole(message.role),
      parts,
      text: messageTextFromParts(parts),
      timestamp: typeof message.timestamp === "number" ? message.timestamp : null,
      runId: typeof message.runId === "string" ? message.runId : undefined,
      toolCallId: typeof message.toolCallId === "string" ? message.toolCallId : undefined,
      source: message.source
        ? {
            kind: message.source.kind,
            intentKey: message.source.sourceIntentKey,
            channel: message.source.sourceChannel,
            tool: message.source.sourceTool,
          }
        : undefined,
    };
  }

  toIntentMessages(messages: RuntimeIntentMessageRecord[]): IntentMessage[] {
    return messages
      .map((message, index) => this.toIntentMessage(message, index))
      .filter((message): message is IntentMessage => message !== null);
  }

  toIntentEvent(intentKey: string, payload: RuntimeIntentEvent): IntentEvent {
    if (payload.message) {
      const message = this.toIntentMessage(payload.message, 0);
      if (!message) {
        return {
          type: "status",
          intentKey,
          runId: payload.runId,
          state: payload.state,
          errorMessage: payload.errorMessage,
          usage: payload.usage,
        };
      }

      return {
        type: "message",
        intentKey,
        runId: payload.runId,
        state: payload.state,
        message,
        usage: payload.usage,
      };
    }

    return {
      type: "status",
      intentKey,
      runId: payload.runId,
      state: payload.state,
      errorMessage: payload.errorMessage,
      usage: payload.usage,
    };
  }
}

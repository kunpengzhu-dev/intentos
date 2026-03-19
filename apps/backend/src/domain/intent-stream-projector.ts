import type { IntentMessage, IntentStreamEvent } from "@intentos/shared";
import type { RuntimeIntentStreamEvent } from "../ports/intent-runtime-gateway.js";
import { IntentMapper } from "./intent-mapper.js";

const SILENT_REPLY_PREFIXES = ["N", "NO", "NO_", "NO_R", "NO_RE", "NO_REP", "NO_REPL", "NO_REPLY"];

type RunProjectionState = {
  hidden: boolean;
  emittedVisibleEvent: boolean;
  pendingRunStart?: IntentStreamEvent & { type: "run"; phase: "start" | (string & {}) };
  lastMessageFingerprint?: string;
  toolSummaries: Map<string, string>;
};

type IntentStreamProjectorOptions = {
  intentKey: string;
  mapper: IntentMapper;
};

function isSilentReplyOnly(text: string): boolean {
  return SILENT_REPLY_PREFIXES.includes(text) || text.startsWith("NO_REPLY");
}

function shouldTrimSilentSuffix(text: string, suffix: string): boolean {
  if (!text.endsWith(suffix) || text.length <= suffix.length) {
    return false;
  }
  const boundary = text.at(-(suffix.length + 1));
  if (!boundary) {
    return false;
  }
  return !/[A-Za-z0-9_]/.test(boundary);
}

function trimSilentReplySuffix(text: string): string {
  for (const suffix of [...SILENT_REPLY_PREFIXES].reverse()) {
    if (shouldTrimSilentSuffix(text, suffix)) {
      return text.slice(0, -suffix.length);
    }
  }
  return text;
}

function withSanitizedText(message: IntentMessage, text: string): IntentMessage {
  if (text === message.text) {
    return message;
  }

  const parts =
    message.parts.length === 1 && message.parts[0]?.type === "text"
      ? [{ ...message.parts[0], text }]
      : message.parts;

  return {
    ...message,
    text,
    parts,
  };
}

function sanitizeAssistantMessage(message: IntentMessage): { hidden: boolean; message: IntentMessage } {
  if (message.role !== "assistant") {
    return { hidden: false, message };
  }

  if (isSilentReplyOnly(message.text)) {
    return { hidden: true, message };
  }

  return {
    hidden: false,
    message: withSanitizedText(message, trimSilentReplySuffix(message.text)),
  };
}

export class IntentStreamProjector {
  private readonly runs = new Map<string, RunProjectionState>();

  constructor(private readonly options: IntentStreamProjectorOptions) {}

  project(event: RuntimeIntentStreamEvent): IntentStreamEvent[] {
    if (event.intentKey !== this.options.intentKey) {
      return [];
    }

    if (event.type === "run") {
      return this.projectRunEvent(event);
    }
    if (event.type === "tool") {
      return this.projectToolEvent(event);
    }
    if (event.type === "status") {
      return this.projectStatusEvent(event);
    }
    return this.projectMessageEvent(event);
  }

  private projectRunEvent(event: Extract<RuntimeIntentStreamEvent, { type: "run" }>): IntentStreamEvent[] {
    const state = this.getRunState(event.runId);
    const projected: IntentStreamEvent = {
      type: "run",
      intentKey: this.options.intentKey,
      runId: event.runId,
      phase: event.phase,
      ...(event.seq === undefined ? {} : { seq: event.seq }),
      timestamp: event.timestamp ?? null,
    };

    if (event.phase === "start") {
      state.pendingRunStart = projected as RunProjectionState["pendingRunStart"];
      return [];
    }

    if (state.hidden) {
      this.runs.delete(event.runId);
      return [];
    }

    const flushed = this.flushPendingRunStart(state);
    state.emittedVisibleEvent = true;
    this.runs.delete(event.runId);
    return [...flushed, projected];
  }

  private projectToolEvent(event: Extract<RuntimeIntentStreamEvent, { type: "tool" }>): IntentStreamEvent[] {
    const state = this.getRunState(event.runId);
    if (state.hidden || !event.toolCallId) {
      return [];
    }

    const summary = event.summary ?? state.toolSummaries.get(event.toolCallId);
    if (summary) {
      state.toolSummaries.set(event.toolCallId, summary);
    }

    const flushed = this.flushPendingRunStart(state);
    state.emittedVisibleEvent = true;
    return [
      ...flushed,
      {
        type: "tool",
        intentKey: this.options.intentKey,
        runId: event.runId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        phase: event.phase,
        ...(event.seq === undefined ? {} : { seq: event.seq }),
        timestamp: event.timestamp ?? null,
        ...(event.args === undefined ? {} : { args: event.args }),
        ...(event.meta === undefined ? {} : { meta: event.meta }),
        ...(summary === undefined ? {} : { summary }),
        ...(event.isError === undefined ? {} : { isError: event.isError }),
      },
    ];
  }

  private projectStatusEvent(
    event: Extract<RuntimeIntentStreamEvent, { type: "status" }>,
  ): IntentStreamEvent[] {
    const state = this.getRunState(event.runId);
    if (state.hidden) {
      if (event.state === "final" || event.state === "aborted" || event.state === "error") {
        this.runs.delete(event.runId);
      }
      return [];
    }

    const flushed = this.flushPendingRunStart(state);
    state.emittedVisibleEvent = true;
    if (event.state === "final" || event.state === "aborted" || event.state === "error") {
      this.runs.delete(event.runId);
    }

    return [
      ...flushed,
      {
        type: "status",
        intentKey: this.options.intentKey,
        runId: event.runId,
        state: event.state,
        ...(event.seq === undefined ? {} : { seq: event.seq }),
        timestamp: event.timestamp ?? null,
        ...(event.errorMessage === undefined ? {} : { errorMessage: event.errorMessage }),
        ...(event.usage === undefined ? {} : { usage: event.usage }),
      },
    ];
  }

  private projectMessageEvent(
    event: Extract<RuntimeIntentStreamEvent, { type: "message" }>,
  ): IntentStreamEvent[] {
    const state = this.getRunState(event.runId);
    const message = this.options.mapper.toIntentMessage(event.message, 0);
    if (!message) {
      return [];
    }

    const sanitized = sanitizeAssistantMessage(message);
    if (sanitized.hidden) {
      state.hidden = true;
      state.pendingRunStart = undefined;
      return [];
    }

    const fingerprint = `${event.state}:${sanitized.message.text}`;
    if (state.lastMessageFingerprint === fingerprint) {
      return [];
    }

    state.lastMessageFingerprint = fingerprint;
    const flushed = this.flushPendingRunStart(state);
    state.emittedVisibleEvent = true;
    if (event.state === "final" || event.state === "aborted" || event.state === "error") {
      this.runs.delete(event.runId);
    }

    return [
      ...flushed,
      {
        type: "message",
        intentKey: this.options.intentKey,
        runId: event.runId,
        state: event.state,
        message: sanitized.message,
        ...(event.seq === undefined ? {} : { seq: event.seq }),
        timestamp: event.timestamp ?? sanitized.message.timestamp ?? null,
        ...(event.usage === undefined ? {} : { usage: event.usage }),
      },
    ];
  }

  private getRunState(runId: string): RunProjectionState {
    const existing = this.runs.get(runId);
    if (existing) {
      return existing;
    }

    const created: RunProjectionState = {
      hidden: false,
      emittedVisibleEvent: false,
      toolSummaries: new Map(),
    };
    this.runs.set(runId, created);
    return created;
  }

  private flushPendingRunStart(state: RunProjectionState): IntentStreamEvent[] {
    if (!state.pendingRunStart) {
      return [];
    }
    const pending = state.pendingRunStart;
    state.pendingRunStart = undefined;
    return [pending];
  }
}

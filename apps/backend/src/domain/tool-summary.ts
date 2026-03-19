import type { IntentJsonValue } from "@intentos/shared";

type ToolResultSummary = {
  summary?: string;
  isError?: boolean;
};

function isRecord(value: IntentJsonValue | undefined): value is Record<string, IntentJsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function readString(record: Record<string, IntentJsonValue>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, IntentJsonValue>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function parseResultText(text: string | undefined): Record<string, IntentJsonValue> | undefined {
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as IntentJsonValue;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function joinSummary(parts: Array<string | undefined>): string | undefined {
  const visible = parts.map((part) => (typeof part === "string" ? normalizeWhitespace(part) : "")).filter(Boolean);
  if (visible.length === 0) {
    return undefined;
  }
  return visible.join(", ");
}

function summarizeSessionsSpawn(args: Record<string, IntentJsonValue>): string | undefined {
  const label = readString(args, "label");
  const task = readString(args, "task");
  const timeoutSeconds = readNumber(args, "timeoutSeconds") ?? readNumber(args, "runTimeoutSeconds");
  const cleanup = readString(args, "cleanup");

  return joinSummary([
    label ? `label ${label}` : undefined,
    task ? `task ${task}` : undefined,
    timeoutSeconds === undefined ? undefined : `timeout ${timeoutSeconds}`,
    cleanup ? `cleanup ${cleanup}` : undefined,
  ]);
}

function summarizeGenericArgs(args: Record<string, IntentJsonValue>, keys: string[]): string | undefined {
  return joinSummary(
    keys.map((key) => {
      const value = args[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return `${value}`;
      }
      return undefined;
    }),
  );
}

export function summarizeToolCall(toolName: string | undefined, args: IntentJsonValue | undefined): string | undefined {
  if (!toolName || !isRecord(args)) {
    return undefined;
  }

  if (toolName === "sessions_spawn") {
    return summarizeSessionsSpawn(args);
  }

  if (toolName === "sessions_yield") {
    return summarizeGenericArgs(args, ["message"]);
  }

  if (toolName === "read") {
    return summarizeGenericArgs(args, ["file_path", "path"]);
  }

  return undefined;
}

export function summarizeToolResult(params: {
  toolName?: string;
  text?: string;
  meta?: string;
}): ToolResultSummary {
  const meta = typeof params.meta === "string" && params.meta.trim().length > 0
    ? normalizeWhitespace(params.meta)
    : undefined;

  if (meta) {
    return { summary: meta, isError: false };
  }

  const payload = parseResultText(params.text);
  if (!payload) {
    return {};
  }

  const status = normalizeWhitespace(readString(payload, "status") ?? "").toLowerCase();
  const error = normalizeWhitespace(readString(payload, "error") ?? "");
  if (status === "error" || error) {
    return {
      summary: error || status,
      isError: true,
    };
  }

  if (params.toolName === "sessions_spawn" || params.toolName === "sessions_yield" || params.toolName === "read") {
    return {
      isError: false,
    };
  }

  const message = normalizeWhitespace(readString(payload, "message") ?? "");
  const note = normalizeWhitespace(readString(payload, "note") ?? "");
  return {
    summary: message || note || (status ? status : undefined),
    isError: false,
  };
}

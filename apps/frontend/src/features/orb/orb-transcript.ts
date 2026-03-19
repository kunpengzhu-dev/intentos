import type {
  IntentJsonValue,
  IntentMessage,
  IntentMessagePart,
  IntentStreamEvent,
} from '@intentos/shared';
import type { OrbChatEntry, OrbToolPill, OrbToolStatus } from './types';

type EntryToolState = OrbToolPill & {
  args?: IntentJsonValue;
};

type EntryState = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number | null;
  pending: boolean;
  runId: string | null;
  toolOrder: string[];
  tools: Map<string, EntryToolState>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createEntry(record: {
  id: string;
  role: string;
  content?: string;
  ts?: number | null;
  pending?: boolean;
  runId?: string | null;
}): EntryState {
  return {
    id: record.id,
    role: record.role === 'user' ? 'user' : 'assistant',
    content: record.content ?? '',
    ts: record.ts ?? null,
    pending: Boolean(record.pending),
    runId: record.runId ?? null,
    toolOrder: [],
    tools: new Map(),
  };
}

function collectRenderableText(parts: IntentMessagePart[], fallbackText = ''): string {
  const lines = parts
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }
      if (part.type === 'text' && typeof part.text === 'string') {
        return part.text;
      }
      if (part.type === 'toolresult') {
        if (typeof part.summary === 'string' && part.summary.length > 0) {
          return part.summary;
        }
        if (typeof part.text === 'string') {
          return part.text;
        }
      }
      if (part.type === 'image') {
        return '[image]';
      }
      return '';
    })
    .filter(Boolean);

  if (lines.length > 0) {
    return lines.join('\n');
  }

  if (parts.length > 0) {
    return '';
  }

  return typeof fallbackText === 'string' ? fallbackText : '';
}

function listToolCallParts(message: IntentMessage) {
  return message.parts.filter((part) => part.type === 'toolcall');
}

function extractHistoryToolCalls(message: IntentMessage) {
  const toolCalls = [];
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const totalToolCalls = listToolCallParts(message).length;

  for (const [index, part] of parts.entries()) {
    if (!part || part.type !== 'toolcall') {
      continue;
    }

    const toolId =
      typeof part.id === 'string'
        ? part.id
        : totalToolCalls === 1 && typeof message.toolCallId === 'string'
          ? message.toolCallId
          : `${message.id}:tool:${index}`;

    toolCalls.push({
      id: toolId,
      name: typeof part.name === 'string' ? part.name : 'tool',
      args:
        isRecord(part.arguments) || Array.isArray(part.arguments)
          ? part.arguments
          : part.arguments ?? null,
      summary: typeof part.summary === 'string' ? part.summary : '',
    });
  }

  return toolCalls;
}

function summarizeToolResult(text: string): { status: OrbToolStatus; meta: string } {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { status: 'completed', meta: '' };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      const statusText = typeof parsed.status === 'string' ? parsed.status : '';
      const errorText = typeof parsed.error === 'string' ? parsed.error : '';
      const messageText = typeof parsed.message === 'string' ? parsed.message : '';
      const noteText = typeof parsed.note === 'string' ? parsed.note : '';

      if (statusText.toLowerCase() === 'error' || errorText) {
        return { status: 'error', meta: errorText || messageText || noteText || statusText };
      }

      return {
        status: 'completed',
        meta: messageText || noteText || statusText,
      };
    }
  } catch {
    return { status: 'completed', meta: text };
  }

  return { status: 'completed', meta: text };
}

function readHistoryToolResult(message: IntentMessage): { status: OrbToolStatus; meta: string } {
  const toolResultPart = message.parts.find((part) => part?.type === 'toolresult');
  if (toolResultPart?.type === 'toolresult') {
    return {
      status: toolResultPart.isError ? 'error' : 'completed',
      meta: typeof toolResultPart.summary === 'string' ? toolResultPart.summary : '',
    };
  }

  return summarizeToolResult(collectRenderableText(message.parts, message.text));
}

function upsertTool(entry: EntryState, tool: EntryToolState) {
  if (!entry.tools.has(tool.id)) {
    entry.toolOrder.push(tool.id);
  }
  entry.tools.set(tool.id, tool);
}

function attachHistoryToolCalls(entry: EntryState, toolCalls: ReturnType<typeof extractHistoryToolCalls>) {
  for (const toolCall of toolCalls) {
    upsertTool(entry, {
      id: toolCall.id,
      name: toolCall.name,
      status: 'called',
      meta: toolCall.summary,
      args: toolCall.args ?? undefined,
    });
  }
}

function toolStatusFromEvent(event: Extract<IntentStreamEvent, { type: 'tool' }>): OrbToolStatus {
  if (event.phase === 'result') {
    return event.isError ? 'error' : 'completed';
  }
  if (event.phase === 'start') {
    return 'running';
  }
  return 'running';
}

function toolSummary(tool: OrbToolPill): string {
  if (tool.status === 'called') {
    return `${tool.name} called`;
  }
  if (tool.status === 'running') {
    return `${tool.name} running`;
  }
  if (tool.status === 'error') {
    return `${tool.name} failed`;
  }
  return `${tool.name} completed`;
}

export function formatOrbToolPill(tool: OrbToolPill): string {
  return tool.meta ? `${toolSummary(tool)} · ${tool.meta}` : toolSummary(tool);
}

export function buildOrbTranscript(
  messages: IntentMessage[],
  activityEvents: IntentStreamEvent[],
): OrbChatEntry[] {
  const entries: EntryState[] = [];
  const entryById = new Map<string, EntryState>();
  const runEntryIds = new Map<string, string>();
  const historyToolEntryIds = new Map<string, string>();
  const historyGroupEntryIds = new Map<string, string>();

  const appendEntry = (entry: EntryState) => {
    entries.push(entry);
    entryById.set(entry.id, entry);
    if (entry.runId) {
      runEntryIds.set(entry.runId, entry.id);
    }
  };

  const getLastAssistantEntry = () => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const candidate = entries[index];
      if (candidate?.role === 'assistant') {
        return candidate;
      }
    }
    return null;
  };

  const getOrCreateRunEntry = (runId: string, timestamp: number | null) => {
    const existingId = runEntryIds.get(runId);
    if (existingId) {
      const existing = entryById.get(existingId);
      if (existing) {
        return existing;
      }
    }

    const created = createEntry({
      id: `run:${runId}`,
      role: 'assistant',
      ts: timestamp,
      pending: true,
      runId,
    });
    appendEntry(created);
    return created;
  };

  for (const message of messages) {
    if (message.role === 'tool' && typeof message.toolCallId === 'string') {
      const entryId = historyToolEntryIds.get(message.toolCallId);
      if (entryId) {
        const entry = entryById.get(entryId);
        const tool = entry?.tools.get(message.toolCallId);
        if (entry && tool) {
          const result = readHistoryToolResult(message);
          entry.ts = message.timestamp ?? entry.ts;
          tool.status = result.status;
          tool.meta = result.meta || tool.meta;
          continue;
        }
      }
    }

    const content = collectRenderableText(message.parts, message.text);
    const toolCalls = message.role === 'assistant' ? extractHistoryToolCalls(message) : [];
    const displayGroupId =
      typeof message.displayGroupId === 'string' && message.displayGroupId.length > 0
        ? message.displayGroupId
        : null;

    if (displayGroupId) {
      const groupedEntryId = historyGroupEntryIds.get(displayGroupId);
      if (groupedEntryId) {
        const groupedEntry = entryById.get(groupedEntryId);
        if (groupedEntry) {
          if (message.role === 'assistant' && content) {
            groupedEntry.content = groupedEntry.content
              ? `${groupedEntry.content}\n${content}`
              : content;
          }
          if (message.role === 'assistant' && toolCalls.length > 0) {
            attachHistoryToolCalls(groupedEntry, toolCalls);
            for (const toolCall of toolCalls) {
              historyToolEntryIds.set(toolCall.id, groupedEntry.id);
            }
          }
          groupedEntry.ts = message.timestamp ?? groupedEntry.ts;
          if (message.runId) {
            groupedEntry.runId = message.runId;
            runEntryIds.set(message.runId, groupedEntry.id);
          }
          continue;
        }
      }
    }

    if (message.role === 'assistant' && !content && toolCalls.length > 0) {
      const mergedEntry = displayGroupId ? null : getLastAssistantEntry();
      if (mergedEntry) {
        attachHistoryToolCalls(mergedEntry, toolCalls);
        mergedEntry.ts = message.timestamp ?? mergedEntry.ts;
        if (message.runId) {
          mergedEntry.runId = message.runId;
          runEntryIds.set(message.runId, mergedEntry.id);
        }
        for (const toolCall of toolCalls) {
          historyToolEntryIds.set(toolCall.id, mergedEntry.id);
        }
        continue;
      }
    }

    const entry = createEntry({
      id: message.id,
      role: message.role,
      content,
      ts: message.timestamp,
      runId: message.runId ?? null,
    });

    if (message.role === 'assistant' && toolCalls.length > 0) {
      attachHistoryToolCalls(entry, toolCalls);
      for (const toolCall of toolCalls) {
        historyToolEntryIds.set(toolCall.id, entry.id);
      }
    }

    appendEntry(entry);

    if (displayGroupId) {
      historyGroupEntryIds.set(displayGroupId, entry.id);
    }

    if (!entry.content && entry.toolOrder.length === 0) {
      entries.pop();
      entryById.delete(entry.id);
      if (entry.runId) {
        runEntryIds.delete(entry.runId);
      }
    }
  }

  for (const event of activityEvents) {
    if (event.type === 'run') {
      if (event.phase === 'start') {
        getOrCreateRunEntry(event.runId, event.timestamp);
      }
      continue;
    }

    if (event.type === 'message') {
      const entry = getOrCreateRunEntry(event.runId, event.timestamp);
      entry.role = event.message.role === 'user' ? 'user' : 'assistant';
      entry.content = collectRenderableText(event.message.parts, event.message.text);
      entry.ts = event.message.timestamp ?? event.timestamp ?? entry.ts;
      entry.pending = !(
        event.state === 'final' ||
        event.state === 'error' ||
        event.state === 'aborted'
      );
      continue;
    }

    if (event.type === 'tool') {
      const entry = getOrCreateRunEntry(event.runId, event.timestamp);
      if (!entry.ts) {
        entry.ts = event.timestamp;
      }
      upsertTool(entry, {
        id: event.toolCallId,
        name: event.toolName ?? 'tool',
        status: toolStatusFromEvent(event),
        meta: event.summary ?? event.meta ?? entry.tools.get(event.toolCallId)?.meta ?? '',
        args: event.args,
      });
      continue;
    }

    if (event.type === 'status') {
      const entryId = runEntryIds.get(event.runId);
      const entry = entryId ? entryById.get(entryId) : null;
      if (entry && (event.state === 'error' || event.state === 'aborted' || event.state === 'final')) {
        entry.pending = false;
      }
      continue;
    }
  }

  return entries.map((entry) => ({
    id: entry.id,
    role: entry.role,
    content: entry.content,
    ts: entry.ts,
    pending: entry.pending,
    tools: entry.toolOrder
      .map((toolId) => entry.tools.get(toolId))
      .filter((tool): tool is EntryToolState => Boolean(tool))
      .map(({ id, name, status, meta }) => ({
        id,
        name,
        status,
        meta,
      })),
  }));
}

import { useCallback, useRef } from 'react';
import type { ChatHistoryEntry, ChatHistoryPart } from '@intentos/protocol';
import { useChatStore } from '../../store/chat';
import { useIntentStore, type IntentCard } from '../../store/intents';

const INTERNAL_RUNTIME_CONTEXT_PREFIX = 'OpenClaw runtime context (internal):';

type RawStructuredEntry = {
  role?: string;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  content?: Array<Record<string, unknown>>;
};

type SpawnToolCallInfo = {
  toolCallId: string;
  task: string;
};

type SpawnToolResultInfo = {
  toolCallId: string;
  childSessionKey: string;
  runId?: string;
  timestamp: number;
};

type SpawnIntentMeta = {
  intentId: string;
  sessionKey: string;
  runId?: string;
  task?: string;
};

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseStructuredEntry(entry: ChatHistoryEntry): RawStructuredEntry | null {
  for (const part of entry.parts) {
    if (part.type !== 'text') continue;
    const text = part.text?.trim();
    if (!text || !text.startsWith('{')) continue;
    const parsed = parseJson<RawStructuredEntry>(text);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  }
  return null;
}

function extractSpawnToolCallInfo(raw: RawStructuredEntry): SpawnToolCallInfo | null {
  if (raw.role !== 'assistant' || !Array.isArray(raw.content)) return null;
  for (const item of raw.content) {
    const type = typeof item?.type === 'string' ? item.type : '';
    const name = typeof item?.name === 'string' ? item.name : '';
    if (type !== 'toolCall' || name !== 'sessions_spawn') continue;
    const toolCallId = typeof item.id === 'string' ? item.id : '';
    if (!toolCallId) continue;
    const args = item.arguments && typeof item.arguments === 'object'
      ? (item.arguments as Record<string, unknown>)
      : null;
    const task = typeof args?.task === 'string' ? args.task.trim() : '';
    return { toolCallId, task };
  }
  return null;
}

function extractSpawnToolResultInfo(raw: RawStructuredEntry): SpawnToolResultInfo | null {
  if (raw.role !== 'toolResult' || raw.toolName !== 'sessions_spawn') return null;
  const toolCallId = typeof raw.toolCallId === 'string' ? raw.toolCallId : '';
  if (!toolCallId) return null;
  const textPart = Array.isArray(raw.content)
    ? raw.content.find((item) => item?.type === 'text' && typeof item?.text === 'string')
    : null;
  const payloadText = typeof textPart?.text === 'string' ? textPart.text : '';
  const payload = parseJson<Record<string, unknown>>(payloadText);
  if (!payload) return null;
  const status = typeof payload.status === 'string' ? payload.status : '';
  const childSessionKey = typeof payload.childSessionKey === 'string' ? payload.childSessionKey : '';
  if (status !== 'accepted' || !childSessionKey) return null;
  const runId = typeof payload.runId === 'string' ? payload.runId : undefined;
  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now();
  return { toolCallId, childSessionKey, runId, timestamp };
}

function extractSessionKeyFromInternalMessage(text: string): string | null {
  const match = text.match(/session_key:\s*([^\n\r]+)/);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function summarizeTask(task: string | undefined): { title: string; summary: string } {
  const clean = (task ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) {
    return {
      title: 'Subagent Task',
      summary: 'OpenClaw subagent task is running in background.',
    };
  }
  const title = clean.length > 36 ? `${clean.slice(0, 36)}…` : clean;
  const summary = clean.length > 120 ? `${clean.slice(0, 120)}…` : clean;
  return { title, summary };
}

function shouldUpsertIntent(existing: IntentCard | undefined, next: IntentCard): boolean {
  if (!existing) return true;
  return existing.title !== next.title
    || existing.summary !== next.summary
    || existing.status !== next.status
    || existing.currentRunId !== next.currentRunId
    || existing.updatedAt !== next.updatedAt
    || existing.needsAttention !== next.needsAttention
    || existing.progress !== next.progress
    || existing.artifactCount !== next.artifactCount
    || existing.runtimeContextText !== next.runtimeContextText
    || existing.subagentSessionKey !== next.subagentSessionKey;
}

function historyEntryPlainText(entry: ChatHistoryEntry): string {
  return entry.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function historyPartsToText(parts: ChatHistoryPart[]): string {
  const lines: string[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      if (part.text) lines.push(part.text);
      continue;
    }
    lines.push(JSON.stringify(part));
  }
  return lines.join('\n').trim();
}

function normalizeBubbleText(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

export function historyEntryToDisplayText(entry: ChatHistoryEntry): string {
  return historyPartsToText(entry.parts);
}

export function useSubagentIntentSync() {
  const upsertIntent = useIntentStore((s) => s.upsertIntent);
  const spawnByToolCallIdRef = useRef<Map<string, SpawnIntentMeta>>(new Map());
  const spawnBySessionKeyRef = useRef<Map<string, SpawnIntentMeta>>(new Map());
  const forwardedCompletionIdsRef = useRef<Set<string>>(new Set());
  const lastRuntimeContextTsRef = useRef(0);

  const isInternalRuntimeContextEntry = useCallback((entry: ChatHistoryEntry): boolean => {
    if (entry.role !== 'user') return false;
    return historyEntryPlainText(entry).startsWith(INTERNAL_RUNTIME_CONTEXT_PREFIX);
  }, []);

  const isSessionsSpawnToolEntry = useCallback((entry: ChatHistoryEntry): boolean => {
    const raw = parseStructuredEntry(entry);
    if (!raw) return false;
    if (extractSpawnToolCallInfo(raw)) return true;
    if (extractSpawnToolResultInfo(raw)) return true;
    return false;
  }, []);

  const syncSubagentIntentsFromEntries = useCallback((entries: ChatHistoryEntry[]) => {
    const toolCalls = new Map<string, SpawnToolCallInfo>();

    for (const entry of entries) {
      const raw = parseStructuredEntry(entry);
      if (!raw) continue;
      const toolCall = extractSpawnToolCallInfo(raw);
      if (!toolCall) continue;
      toolCalls.set(toolCall.toolCallId, toolCall);
    }

    for (const entry of entries) {
      const raw = parseStructuredEntry(entry);
      if (!raw) continue;
      const toolResult = extractSpawnToolResultInfo(raw);
      if (!toolResult) continue;

      const linkedCall = toolCalls.get(toolResult.toolCallId);
      const task = linkedCall?.task || spawnByToolCallIdRef.current.get(toolResult.toolCallId)?.task;
      const intentId = `spawn:${toolResult.childSessionKey}`;
      const meta: SpawnIntentMeta = {
        intentId,
        sessionKey: toolResult.childSessionKey,
        runId: toolResult.runId,
        task,
      };
      spawnByToolCallIdRef.current.set(toolResult.toolCallId, meta);
      spawnBySessionKeyRef.current.set(toolResult.childSessionKey, meta);

      const { title, summary } = summarizeTask(task);
      const nextCard: IntentCard = {
        intentId,
        title,
        summary: `${summary}\n\nsession_key: ${toolResult.childSessionKey}`,
        status: 'active',
        currentRunId: toolResult.runId ?? `local:${toolResult.childSessionKey}`,
        updatedAt: toolResult.timestamp,
        needsAttention: false,
        subagentSessionKey: toolResult.childSessionKey,
        runtimeContextText: undefined,
      };
      const existing = useIntentStore.getState().intents.get(intentId);
      if (shouldUpsertIntent(existing, nextCard)) {
        upsertIntent(nextCard);
      }
    }

    for (const entry of entries) {
      if (!isInternalRuntimeContextEntry(entry)) continue;
      const text = historyEntryPlainText(entry);
      const sessionKey = extractSessionKeyFromInternalMessage(text);
      if (!sessionKey) continue;
      const mapped = spawnBySessionKeyRef.current.get(sessionKey);
      const intentId = mapped?.intentId ?? `spawn:${sessionKey}`;
      const existing = useIntentStore.getState().intents.get(intentId);
      const { title, summary } = summarizeTask(mapped?.task);
      const nextCard: IntentCard = {
        intentId,
        title: existing?.title ?? title,
        summary: existing?.summary ?? `${summary}\n\nsession_key: ${sessionKey}`,
        status: 'completed',
        currentRunId: mapped?.runId ?? existing?.currentRunId,
        updatedAt: entry.timestamp,
        needsAttention: false,
        artifactCount: existing?.artifactCount,
        progress: existing?.progress,
        subagentSessionKey: sessionKey,
        runtimeContextText: text,
      };
      if (shouldUpsertIntent(existing, nextCard)) {
        upsertIntent(nextCard);
      }
    }
  }, [isInternalRuntimeContextEntry, upsertIntent]);

  const filterDisplayEntries = useCallback((entries: ChatHistoryEntry[]) => (
    entries
      .filter((entry) => !isInternalRuntimeContextEntry(entry))
      .filter((entry) => !isSessionsSpawnToolEntry(entry))
  ), [isInternalRuntimeContextEntry, isSessionsSpawnToolEntry]);

  const collectCompletionEntries = useCallback((entries: ChatHistoryEntry[]): ChatHistoryEntry[] => {
    const completionEntries: ChatHistoryEntry[] = [];
    let watermarkToCommit = lastRuntimeContextTsRef.current;

    for (let i = 0; i < entries.length; i += 1) {
      const current = entries[i];
      if (current.timestamp <= lastRuntimeContextTsRef.current) continue;
      if (!isInternalRuntimeContextEntry(current)) continue;

      let candidateAssistant: ChatHistoryEntry | null = null;
      for (let j = i + 1; j < entries.length; j += 1) {
        const next = entries[j];
        if (next.role !== 'assistant') continue;
        candidateAssistant = next;
        break;
      }
      if (!candidateAssistant) {
        continue;
      }
      if (forwardedCompletionIdsRef.current.has(candidateAssistant.id)) {
        watermarkToCommit = Math.max(watermarkToCommit, current.timestamp);
        continue;
      }
      forwardedCompletionIdsRef.current.add(candidateAssistant.id);

      const incomingText = normalizeBubbleText(historyEntryToDisplayText(candidateAssistant));
      const alreadyInChat = useChatStore.getState().messages.some((msg) => {
        if (msg.role !== 'assistant') return false;
        if (Math.abs(msg.ts - candidateAssistant.timestamp) > 60000) return false;
        return normalizeBubbleText(msg.content) === incomingText;
      });
      if (!alreadyInChat) {
        completionEntries.push(candidateAssistant);
      }
      watermarkToCommit = Math.max(watermarkToCommit, current.timestamp);
    }

    if (forwardedCompletionIdsRef.current.size > 200) {
      const first = forwardedCompletionIdsRef.current.values().next().value;
      if (first) forwardedCompletionIdsRef.current.delete(first);
    }

    lastRuntimeContextTsRef.current = watermarkToCommit;
    return completionEntries;
  }, [isInternalRuntimeContextEntry]);

  const resetSubagentSyncState = useCallback(() => {
    spawnByToolCallIdRef.current.clear();
    spawnBySessionKeyRef.current.clear();
    forwardedCompletionIdsRef.current.clear();
    lastRuntimeContextTsRef.current = 0;
  }, []);

  return {
    filterDisplayEntries,
    syncSubagentIntentsFromEntries,
    collectCompletionEntries,
    resetSubagentSyncState,
  };
}


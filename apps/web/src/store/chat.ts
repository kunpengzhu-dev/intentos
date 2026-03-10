import { create } from 'zustand';

export type ChatBubble = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  streaming?: boolean;
};

type ChatStore = {
  messages: ChatBubble[];
  isStreaming: boolean;
  addMessage: (msg: ChatBubble) => void;
  upsertMessages: (msgs: ChatBubble[]) => void;
  applyAssistantDelta: (delta: string, done: boolean, envelopeId: string, ts: number) => void;
  updateLastAssistant: (delta: string, done: boolean) => void;
  setStreaming: (v: boolean) => void;
  clear: () => void;
};

function isHistoryId(id: string): boolean {
  return id.startsWith('hist:');
}

function normalizeTextForCompare(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function mergeAssistantContent(current: string, delta: string): string {
  if (!delta) return current;
  if (delta === current) return current;
  if (delta.startsWith(current)) return delta;
  if (current.startsWith(delta)) return current;
  if (current.endsWith(delta)) return current;
  return current + delta;
}

function findMergeTargetId(existing: Map<string, ChatBubble>, incoming: ChatBubble): string | null {
  if (!isHistoryId(incoming.id)) return null;

  let bestId: string | null = null;
  let bestTsDiff = Number.POSITIVE_INFINITY;
  const maxTsDiffMs = incoming.role === 'assistant' ? 20000 : 20000;
  const incomingNormalized = normalizeTextForCompare(incoming.content);
  if (!incomingNormalized) return null;

  for (const candidate of existing.values()) {
    if (isHistoryId(candidate.id)) continue;
    if (candidate.role !== incoming.role) continue;
    const candidateNormalized = normalizeTextForCompare(candidate.content);
    if (!candidateNormalized || candidateNormalized !== incomingNormalized) continue;
    const tsDiff = Math.abs(candidate.ts - incoming.ts);
    if (tsDiff <= maxTsDiffMs && tsDiff < bestTsDiff) {
      bestTsDiff = tsDiff;
      bestId = candidate.id;
    }
  }

  return bestId;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  upsertMessages: (msgs) =>
    set((s) => {
      const merged = new Map<string, ChatBubble>();
      let changed = false;
      for (const existing of s.messages) {
        merged.set(existing.id, existing);
      }
      for (const incoming of msgs) {
        const previous = merged.get(incoming.id);
        if (previous) {
          const next = { ...previous, ...incoming };
          if (
            next.role !== previous.role ||
            next.content !== previous.content ||
            next.ts !== previous.ts ||
            Boolean(next.streaming) !== Boolean(previous.streaming)
          ) {
            changed = true;
          }
          merged.set(incoming.id, next);
          continue;
        }

        const mergeTargetId = findMergeTargetId(merged, incoming);
        if (mergeTargetId) {
          const target = merged.get(mergeTargetId);
          if (target) {
            const next = {
              ...target,
              ...incoming,
              id: mergeTargetId,
              streaming: false,
              ts: Math.min(target.ts, incoming.ts),
            };
            if (
              next.role !== target.role ||
              next.content !== target.content ||
              next.ts !== target.ts ||
              Boolean(next.streaming) !== Boolean(target.streaming)
            ) {
              changed = true;
            }
            merged.set(mergeTargetId, {
              ...next,
            });
            continue;
          }
        }

        changed = true;
        merged.set(incoming.id, incoming);
      }
      if (!changed) {
        return s;
      }
      return {
        messages: [...merged.values()].sort((a, b) => a.ts - b.ts),
      };
    }),
  applyAssistantDelta: (delta, done, envelopeId, ts) =>
    set((s) => {
      const msgs = [...s.messages];
      let streamingIndex = -1;
      for (let i = msgs.length - 1; i >= 0; i -= 1) {
        if (msgs[i].role === 'assistant' && msgs[i].streaming) {
          streamingIndex = i;
          break;
        }
      }

      if (streamingIndex === -1) {
        if (!delta && done) {
          return { isStreaming: false };
        }
        // Race guard: if history sync already inserted this assistant reply,
        // merge this delta/final into the latest assistant bubble instead of duplicating.
        const maxRecentGapMs = 8000;
        const deltaNormalized = normalizeTextForCompare(delta);
        for (let i = msgs.length - 1; i >= 0; i -= 1) {
          const candidate = msgs[i];
          if (candidate.role !== 'assistant' || candidate.streaming) continue;
          if (Math.abs(ts - candidate.ts) > maxRecentGapMs) break;
          const candidateNormalized = normalizeTextForCompare(candidate.content);
          const related =
            !delta ||
            candidateNormalized === deltaNormalized ||
            candidate.content.startsWith(delta) ||
            delta.startsWith(candidate.content) ||
            candidate.content.endsWith(delta) ||
            delta.endsWith(candidate.content);
          if (!related) continue;
          msgs[i] = {
            ...candidate,
            content: mergeAssistantContent(candidate.content, delta),
            streaming: !done,
          };
          return { messages: msgs, isStreaming: !done };
        }
        msgs.push({
          id: envelopeId,
          role: 'assistant',
          content: delta,
          ts,
          streaming: !done,
        });
        return { messages: msgs, isStreaming: !done };
      }

      const current = msgs[streamingIndex];
      let nextContent = current.content;
      if (delta.length > 0) {
        if (delta === current.content) {
          nextContent = current.content;
        } else if (delta.startsWith(current.content)) {
          nextContent = delta;
        } else if (current.content.endsWith(delta)) {
          nextContent = current.content;
        } else {
          nextContent = current.content + delta;
        }
      }
      msgs[streamingIndex] = { ...current, content: nextContent, streaming: !done };
      return { messages: msgs, isStreaming: !done };
    }),
  updateLastAssistant: (delta, done) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        let nextContent = last.content;
        if (delta.length > 0) {
          if (delta === last.content) {
            nextContent = last.content;
          } else if (delta.startsWith(last.content)) {
            // Gateway may emit cumulative text on each delta frame.
            nextContent = delta;
          } else if (last.content.endsWith(delta)) {
            nextContent = last.content;
          } else {
            nextContent = last.content + delta;
          }
        }
        msgs[msgs.length - 1] = { ...last, content: nextContent, streaming: !done };
      }
      return { messages: msgs, isStreaming: !done };
    }),
  setStreaming: (v) => set({ isStreaming: v }),
  clear: () => set({ messages: [], isStreaming: false }),
}));

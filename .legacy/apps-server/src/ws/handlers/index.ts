import type {
  Envelope,
  ChatDeltaPayload,
  ChatHistoryEntry,
  ChatHistoryPart,
  ChatHistoryOkPayload,
  ChatHistorySyncPayload,
} from '@intentos/protocol';
import type { WsSession } from '../server.js';
import { sendEnvelope } from '../server.js';
import type { AppContext } from '../../context.js';
import { nanoid } from 'nanoid';
import { checkIdempotency, recordIdempotency, hashPayload } from '../../intent/idempotency.js';
import { createIntent } from '../../intent/service.js';
import { getEvents, getStreamHead } from '../../intent/event-store.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

function extractHistoryEntries(historyPayload: unknown): Array<Record<string, unknown>> {
  const payload = historyPayload && typeof historyPayload === 'object'
    ? (historyPayload as Record<string, unknown>)
    : null;

  const source =
    (Array.isArray(payload?.messages) ? payload?.messages : null) ??
    (Array.isArray(payload?.items) ? payload?.items : null) ??
    (Array.isArray(payload?.history) ? payload?.history : null) ??
    (Array.isArray(historyPayload) ? historyPayload : []);

  return source.map((entry) =>
    (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : { raw: entry }),
  );
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getTextFromContentPart(part: unknown): string {
  if (!part || typeof part !== 'object') return '';
  const obj = part as Record<string, unknown>;
  if (typeof obj.text === 'string') return obj.text;
  return '';
}

function normalizeContentPart(part: unknown): ChatHistoryPart[] {
  if (!part || typeof part !== 'object') return [];
  const partObj = part as Record<string, unknown>;
  const type = asString(partObj.type);

  if (type === 'text') {
    const text = asString(partObj.text);
    return text ? [{ type: 'text', text }] : [];
  }

  if (type === 'thinking') {
    return [];
  }

  if (type === 'toolCall') {
    const id = asString(partObj.id) || asString(partObj.toolCallId);
    const name = asString(partObj.name);
    if (!id || !name) return [];
    const argumentsJson =
      partObj.arguments != null
        ? safeStringify(partObj.arguments)
        : (asString(partObj.partialJson) || undefined);
    return [{ type: 'toolCall', id, name, argumentsJson }];
  }

  if (type === 'toolResult') {
    const text = getTextFromContentPart(partObj) || safeStringify(partObj.result ?? partObj);
    if (!text) return [];
    return [{
      type: 'toolResult',
      toolCallId: asString(partObj.toolCallId) || undefined,
      toolName: asString(partObj.toolName) || undefined,
      text,
      isError: typeof partObj.isError === 'boolean' ? partObj.isError : undefined,
    }];
  }

  const text = getTextFromContentPart(partObj);
  return text ? [{ type: 'text', text }] : [];
}

function normalizeHistoryEntry(entry: Record<string, unknown>): ChatHistoryEntry {
  const rawRole = asString(entry.role);
  const role: ChatHistoryEntry['role'] =
    rawRole === 'user'
      ? 'user'
      : (rawRole === 'toolResult' ? 'toolResult' : 'assistant');
  const timestamp = typeof entry.timestamp === 'number' ? entry.timestamp : Date.now();
  const stopReason = asString(entry.stopReason) || undefined;
  const content = Array.isArray(entry.content) ? entry.content : [];
  let parts: ChatHistoryPart[] = [];

  parts = content.flatMap((part) => normalizeContentPart(part));

  if (role === 'toolResult') {
    const toolTextFromParts = parts
      .filter((part): part is Extract<ChatHistoryPart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();
    const fallbackToolText =
      asString(entry.message).trim()
      || safeStringify(entry.result ?? entry.content ?? null);
    const text = toolTextFromParts || fallbackToolText;
    parts = text
      ? [{
        type: 'toolResult',
        toolCallId: asString(entry.toolCallId) || undefined,
        toolName: asString(entry.toolName) || undefined,
        text,
        isError: typeof entry.isError === 'boolean' ? entry.isError : undefined,
      }]
      : [];
  } else {
    if (parts.length === 0) {
      const fallback = asString(entry.message) || safeStringify(entry.content ?? null);
      if (fallback) {
        parts = [{ type: 'text', text: fallback }];
      }
    }
  }

  const textSignature = asString(entry.textSignature);
  const rawToolCallId = asString(entry.toolCallId);
  const idSeed = `${role}|${timestamp}|${stopReason ?? ''}|${rawToolCallId}|${textSignature}|${safeStringify(parts)}`;
  return {
    id: `hist:${stableHash(idSeed)}`,
    role,
    timestamp,
    stopReason,
    parts,
  };
}

function normalizeHistoryEntries(historyPayload: unknown): ChatHistoryEntry[] {
  return extractHistoryEntries(historyPayload).map((entry) => normalizeHistoryEntry(entry));
}

function pickRecentHistory(historyPayload: unknown): ChatHistoryEntry[] {
  return normalizeHistoryEntries(historyPayload).slice(-10);
}

function historyEntrySignature(entry: ChatHistoryEntry): string {
  return entry.id;
}

function safeStringify(value: unknown, space?: number): string {
  try {
    return JSON.stringify(value, null, space);
  } catch {
    return '[unserializable]';
  }
}

export function createMessageHandler(ctx: AppContext) {
  return (session: WsSession, envelope: Envelope) => {
    const { type, payload } = envelope;
    const p = payload as Record<string, unknown>;

    switch (type) {
      case 'intent/create': {
        if (envelope.reqId && envelope.clientId) {
          const hash = hashPayload(payload);
          const check = checkIdempotency(ctx.database, session.scopeId, envelope.clientId, envelope.reqId, hash);
          if (check.hit) {
            if (check.match) {
              sendEnvelope(session.ws, {
                id: nanoid(), version: 1, kind: 'ack', type: 'intent/create_ack',
                ts: Date.now(), reqId: envelope.reqId, clientSeq: envelope.clientSeq,
                payload: check.ackPayload,
              });
            } else {
              sendEnvelope(session.ws, {
                id: nanoid(), version: 1, kind: 'ack', type: 'intent/create_ack',
                ts: Date.now(), reqId: envelope.reqId, clientSeq: envelope.clientSeq,
                payload: { accepted: false, reason: 'IDEMPOTENCY_MISMATCH' },
              });
            }
            return;
          }
        }

        const message = p.message as string;
        if (!message) {
          sendEnvelope(session.ws, {
            id: nanoid(), version: 1, kind: 'ack', type: 'intent/create_ack',
            ts: Date.now(), reqId: envelope.reqId, clientSeq: envelope.clientSeq,
            payload: { accepted: false, reason: 'message is required' },
          });
          return;
        }

        const { intentId, runId } = createIntent(ctx.database, session, message, ctx.agentAdapter, 'user');
        const ackPayload = { accepted: true, intentId, runId };

        if (envelope.reqId && envelope.clientId) {
          recordIdempotency(ctx.database, session.scopeId, envelope.clientId, envelope.reqId, type, ackPayload, hashPayload(payload));
        }

        sendEnvelope(session.ws, {
          id: nanoid(), version: 1, kind: 'ack', type: 'intent/create_ack',
          ts: Date.now(), reqId: envelope.reqId, clientSeq: envelope.clientSeq,
          sessionId: session.sessionId,
          payload: ackPayload,
        });
        break;
      }

      case 'stream/subscribe': {
        const streams = p.streams as string[];
        if (!streams?.length) return;

        for (const streamId of streams) {
          session.subscribedStreams.add(streamId);

          const cursor = (p.cursor as { items?: Array<{ s: string; q: number }> })?.items;
          const cursorItem = cursor?.find((c) => c.s === streamId);
          const afterSeq = cursorItem?.q ?? 0;

          const evts = getEvents(ctx.database, session.scopeId, streamId, afterSeq);
          const headSeq = getStreamHead(ctx.database, session.scopeId, streamId);

          if (streamId === 'global' && afterSeq === 0) {
            const summaries = ctx.database.sqlite
              .prepare('SELECT * FROM intent_summary WHERE scope_id = ?')
              .all(session.scopeId);

            sendEnvelope(session.ws, {
              id: nanoid(), version: 1, kind: 'notify', type: 'global/snapshot',
              ts: Date.now(),
              payload: {
                v: 1,
                snapshotId: nanoid(),
                intents: summaries,
                atSeq: headSeq,
                headSeq,
              },
            });
          }

          for (const event of evts) {
            sendEnvelope(session.ws, {
              id: nanoid(),
              version: 1,
              kind: 'evt',
              type: event.type,
              ts: event.ts,
              scopeId: session.scopeId,
              streamId,
              serverSeq: event.serverSeq,
              payload: JSON.parse(event.payload),
            });
          }
        }

        sendEnvelope(session.ws, {
          id: nanoid(), version: 1, kind: 'ack', type: 'stream/subscribe_ok',
          ts: Date.now(), reqId: envelope.reqId,
          payload: { accepted: true },
        });
        break;
      }

      case 'stream/unsubscribe': {
        const streams = p.streams as string[];
        if (streams) {
          for (const s of streams) session.subscribedStreams.delete(s);
        }
        break;
      }

      case 'chat/send': {
        const runId = nanoid();
        const contextId =
          typeof p.contextId === 'string' && p.contextId.length > 0 ? p.contextId : 'global';
        const message = p.message as string;
        if (!message) {
          const deltaPayload: ChatDeltaPayload = {
            delta: '消息不能为空。',
            done: true,
            contextId,
            runId,
          };
          sendEnvelope(session.ws, {
            id: nanoid(), version: 1, kind: 'notify', type: 'chat/delta',
            ts: Date.now(),
            payload: deltaPayload,
          });
          return;
        }
        let hasStreamedChatDelta = false;
        const seenHistorySignatures = new Set<string>();
        const chatStartTs = Date.now();
        const traceEnabled = env.CHAT_TRACE_LOGS;
        const traceId = `${session.id}-${chatStartTs.toString(36)}`;
        if (traceEnabled) {
          logger.info(
            `[chat-trace ${traceId}] start context=${contextId} message.raw=${safeStringify(message)}`,
          );
        }

        void ctx.chatService.streamAssistantReply({
          session,
          message,
          contextId,
          runId,
          onDelta: (delta) => {
            if (!delta) return;
            hasStreamedChatDelta = true;
            if (traceEnabled) {
              logger.debug(
                `[chat-trace ${traceId}] onDelta.raw ${safeStringify(delta)}`,
              );
            }
            const deltaPayload: ChatDeltaPayload = {
              delta,
              done: false,
              contextId,
              runId,
            };
            sendEnvelope(session.ws, {
              id: nanoid(), version: 1, kind: 'notify', type: 'chat/delta',
              ts: Date.now(),
              payload: deltaPayload,
            });
          },
          onFinal: (finalText) => {
            if (traceEnabled) {
              logger.debug(
                `[chat-trace ${traceId}] onFinal raw=${safeStringify(finalText)}`,
              );
            }
            const deltaPayload: ChatDeltaPayload = {
              // Final payload always carries the complete text and is used by
              // client to guarantee the streaming bubble ends in exact state.
              delta: finalText,
              done: true,
              contextId,
              runId,
            };
            sendEnvelope(session.ws, {
              id: nanoid(), version: 1, kind: 'notify', type: 'chat/delta',
              ts: Date.now(),
              payload: deltaPayload,
            });
          },
          onHistory: (historyPayload) => {
            const recent = pickRecentHistory(historyPayload);
            if (traceEnabled) {
              logger.debug(
                `[chat-trace ${traceId}] onHistory.raw ${safeStringify(historyPayload)}`,
              );
            }
            const missing = recent
              .filter((entry) => entry.timestamp >= chatStartTs)
              .filter((entry) => {
                const signature = historyEntrySignature(entry);
                if (seenHistorySignatures.has(signature)) {
                  return false;
                }
                seenHistorySignatures.add(signature);
                return true;
              });
            if (traceEnabled) {
              logger.debug(
                `[chat-trace ${traceId}] onHistory recent=${recent.length} missing=${missing.length}`,
              );
            }

            if (missing.length > 0) {
              const historySyncPayload: ChatHistorySyncPayload = {
                contextId,
                entries: missing,
              };
              if (traceEnabled) {
                logger.debug(
                  `[chat-trace ${traceId}] emit chat/history_sync.raw ${safeStringify(historySyncPayload)}`,
                );
              }
              sendEnvelope(session.ws, {
                id: nanoid(), version: 1, kind: 'notify', type: 'chat/history_sync',
                ts: Date.now(),
                payload: historySyncPayload,
              });
            }
          },
          onGatewayFrame: traceEnabled
            ? (rawFrame) => {
              logger.debug(
                `[chat-trace ${traceId}] gateway.frame.raw ${rawFrame}`,
              );
            }
            : undefined,
          onError: (error) => {
            logger.error({ err: error, contextId }, 'OpenClaw chat stream failed');
            const deltaPayload: ChatDeltaPayload = {
              delta: hasStreamedChatDelta
                ? `\n\n[OpenClaw error] ${error.message}`
                : `[OpenClaw error] ${error.message}`,
              done: true,
              contextId,
              runId,
            };
            sendEnvelope(session.ws, {
              id: nanoid(), version: 1, kind: 'notify', type: 'chat/delta',
              ts: Date.now(),
              payload: deltaPayload,
            });
          },
        }).catch((error) => {
          logger.error({ err: error }, 'Failed to start OpenClaw chat stream');
        });
        break;
      }

      case 'chat/history': {
        const requestedLimit = Number(p.limit);
        const limit = Number.isFinite(requestedLimit)
          ? Math.max(1, Math.min(200, Math.floor(requestedLimit)))
          : 20;
        const traceEnabled = env.CHAT_TRACE_LOGS;
        const traceId = `${session.id}-history-${Date.now().toString(36)}`;

        void ctx.chatService.fetchHistory({ session, limit }).then((historyPayload) => {
          if (traceEnabled) {
            logger.debug(
              `[chat-trace ${traceId}] chat/history.raw ${safeStringify(historyPayload)}`,
            );
          }
          const entries = normalizeHistoryEntries(historyPayload).slice(-limit);
          const historyOkPayload: ChatHistoryOkPayload = {
            accepted: true,
            contextId: typeof p.contextId === 'string' && p.contextId.length > 0 ? p.contextId : 'global',
            limit,
            entries,
          };
          sendEnvelope(session.ws, {
            id: nanoid(), version: 1, kind: 'ack', type: 'chat/history_ok',
            ts: Date.now(), reqId: envelope.reqId, clientSeq: envelope.clientSeq,
            payload: historyOkPayload,
          });
        }).catch((error) => {
          logger.error({ err: error }, 'Failed to fetch OpenClaw chat history');
          const historyOkPayload: ChatHistoryOkPayload = {
            accepted: false,
            reason: (error as Error).message,
            limit,
            entries: [],
          };
          sendEnvelope(session.ws, {
            id: nanoid(), version: 1, kind: 'ack', type: 'chat/history_ok',
            ts: Date.now(), reqId: envelope.reqId, clientSeq: envelope.clientSeq,
            payload: historyOkPayload,
          });
        });
        break;
      }

      case 'boot/start': {
        void ctx.bootService.handleStart(session, envelope);
        break;
      }

      case 'suggestion/list': {
        sendEnvelope(session.ws, {
          id: nanoid(), version: 1, kind: 'ack', type: 'suggestion/list_ok',
          ts: Date.now(), reqId: envelope.reqId,
          payload: {
            suggestions: [
              { id: '1', title: 'Schedule a meeting', description: 'Set up a meeting with your team', category: 'Productivity', templateMessage: 'Schedule a team meeting for next week' },
              { id: '2', title: 'Research a topic', description: 'Deep dive into any subject', category: 'Research', templateMessage: 'Research the latest AI developments' },
              { id: '3', title: 'Draft an email', description: 'Write a professional email', category: 'Communication', templateMessage: 'Draft a follow-up email to the client' },
              { id: '4', title: 'Analyze data', description: 'Process and analyze datasets', category: 'Analytics', templateMessage: 'Analyze the Q4 sales report' },
            ],
          },
        });
        break;
      }

      default:
        logger.warn(`Unhandled message type: ${type}`);
    }
  };
}

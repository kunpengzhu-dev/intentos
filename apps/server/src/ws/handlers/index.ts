import type { Envelope } from '@intentos/protocol';
import type { WsSession } from '../server.js';
import { sendEnvelope } from '../server.js';
import type { AppContext } from '../../context.js';
import { nanoid } from 'nanoid';
import { checkIdempotency, recordIdempotency, hashPayload } from '../../intent/idempotency.js';
import { createIntent } from '../../intent/service.js';
import { getEvents, getStreamHead } from '../../intent/event-store.js';
import { logger } from '../../config/logger.js';

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

        const { intentId, runId } = createIntent(ctx.database, session, message, 'user');
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
        const message = p.message as string;
        sendEnvelope(session.ws, {
          id: nanoid(), version: 1, kind: 'notify', type: 'chat/delta',
          ts: Date.now(),
          payload: {
            delta: `I received your message: "${message}". This is a mock response from the IntentOS assistant.`,
            done: true,
            contextId: p.contextId ?? 'global',
          },
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

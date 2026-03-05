import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import type { Envelope } from '@intentos/protocol';
import { logger } from '../config/logger.js';
import type { AppContext } from '../context.js';

export type WsSession = {
  id: string;
  ws: WebSocket;
  clientId: string;
  scopeId: string;
  sessionId: string;
  subscribedStreams: Set<string>;
};

const sessions = new Map<string, WsSession>();

export function getSessions() { return sessions; }

export function broadcastToStream(streamId: string, envelope: Envelope, excludeSessionId?: string) {
  for (const session of sessions.values()) {
    if (session.subscribedStreams.has(streamId) && session.id !== excludeSessionId) {
      sendEnvelope(session.ws, envelope);
    }
  }
}

export function sendEnvelope(ws: WebSocket, envelope: Envelope) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(envelope));
  }
}

export function registerWebSocket(app: FastifyInstance, ctx: AppContext) {
  app.get('/ws', { websocket: true }, (socket, _req) => {
    const sessionId = nanoid();
    logger.info(`WS connected: ${sessionId}`);

    let session: WsSession | null = null;

    socket.on('message', (raw) => {
      try {
        const envelope = JSON.parse(raw.toString()) as Envelope;

        if (!session && envelope.type !== 'auth/handshake') {
          sendEnvelope(socket as unknown as WebSocket, {
            id: nanoid(),
            version: 1,
            kind: 'ack',
            type: envelope.type,
            ts: Date.now(),
            payload: { accepted: false, reason: 'HANDSHAKE_REQUIRED' },
          });
          return;
        }

        if (envelope.type === 'auth/handshake') {
          const clientId = (envelope.payload as Record<string, unknown>)?.deviceId as string || nanoid();
          const scopeId = nanoid();
          session = {
            id: sessionId,
            ws: socket as unknown as WebSocket,
            clientId,
            scopeId,
            sessionId,
            subscribedStreams: new Set(),
          };
          sessions.set(sessionId, session);

          sendEnvelope(socket as unknown as WebSocket, {
            id: nanoid(),
            version: 1,
            kind: 'ack',
            type: 'auth/handshake_ok',
            ts: Date.now(),
            sessionId,
            payload: {
              sessionId,
              clientId,
              scopeId,
              accepted: true,
            },
          });
          return;
        }

        if (envelope.kind !== 'cmd') {
          logger.warn(`Rejected non-cmd message: kind=${envelope.kind}`);
          return;
        }

        ctx.handleMessage(session!, envelope);
      } catch (err) {
        logger.error('WS message error:', err);
      }
    });

    socket.on('close', () => {
      if (session) {
        sessions.delete(sessionId);
        logger.info(`WS disconnected: ${sessionId}`);
      }
    });
  });
}

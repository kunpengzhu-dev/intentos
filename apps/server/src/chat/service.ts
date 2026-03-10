import { dirname, join } from 'path';
import { fetchOpenClawGatewayHistory, streamOpenClawGatewayChat } from '@intentos/adapter-openclaw';
import type { WsSession } from '../ws/server.js';
import type { Env } from '../config/env.js';
import { logger } from '../config/logger.js';

type StreamAssistantReplyOptions = {
  session: WsSession;
  message: string;
  contextId: string;
  onDelta: (delta: string) => void;
  onFinal: (finalText: string) => void;
  onHistory?: (historyPayload: unknown) => void;
  onGatewayFrame?: (rawFrame: string) => void;
  onError: (error: Error) => void;
};

export class ChatService {
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;
  private readonly sessionKey: string;
  private readonly timeoutMs: number;
  private readonly identityFilePath: string;

  constructor(env: Env) {
    this.gatewayUrl = env.OPENCLAW_GATEWAY_URL;
    this.gatewayToken = env.OPENCLAW_GATEWAY_TOKEN?.trim() || env.OPENCLAW_API_KEY?.trim() || '';
    this.sessionKey = env.OPENCLAW_CHAT_SESSION_KEY;
    this.timeoutMs = env.OPENCLAW_CHAT_TIMEOUT_MS;
    this.identityFilePath = join(dirname(env.DATABASE_URL), 'openclaw-device.json');
  }

  async streamAssistantReply(options: StreamAssistantReplyOptions): Promise<void> {
    if (!this.gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL is not configured');
    }
    if (!this.gatewayToken) {
      throw new Error('OPENCLAW_GATEWAY_TOKEN (or OPENCLAW_API_KEY) is not configured');
    }

    const sessionKey = this.sessionKey;

    logger.info(`Streaming OpenClaw chat via gateway for sessionKey=${sessionKey}`);

    try {
      await streamOpenClawGatewayChat({
        wsUrl: this.gatewayUrl,
        token: this.gatewayToken,
        timeoutMs: this.timeoutMs,
        origin: options.session.clientOrigin,
        sessionKey,
        message: options.message,
        identityFilePath: this.identityFilePath,
        onDelta: options.onDelta,
        onFinal: options.onFinal,
        onHistory: options.onHistory,
        onGatewayFrame: options.onGatewayFrame,
      });
    } catch (error) {
      options.onError(error as Error);
      throw error;
    }
  }

  async fetchHistory(options: { session: WsSession; limit: number }): Promise<unknown> {
    if (!this.gatewayUrl) {
      throw new Error('OPENCLAW_GATEWAY_URL is not configured');
    }
    if (!this.gatewayToken) {
      throw new Error('OPENCLAW_GATEWAY_TOKEN (or OPENCLAW_API_KEY) is not configured');
    }

    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(200, Math.floor(options.limit))) : 20;

    return fetchOpenClawGatewayHistory({
      wsUrl: this.gatewayUrl,
      token: this.gatewayToken,
      timeoutMs: this.timeoutMs,
      origin: options.session.clientOrigin,
      sessionKey: this.sessionKey,
      identityFilePath: this.identityFilePath,
      limit,
    });
  }
}

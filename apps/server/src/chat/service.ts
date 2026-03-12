import { dirname, join } from 'path';
import {
  fetchOpenClawGatewayHistory,
  streamOpenClawGatewayChat,
} from '../adapters/openclaw/gateway-chat.js';
import type { WsSession } from '../ws/server.js';
import type { Env } from '../config/env.js';
import { logger } from '../config/logger.js';

export type OpenClawGatewayConfigSource = 'env' | 'auto';

export type OpenClawGatewayConfig = {
  url: string;
  token: string;
  connectionPlatform: string;
  source: OpenClawGatewayConfigSource;
  updatedAt: string;
};

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

function inferConnectionPlatform(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      if (process.platform === 'darwin') return 'local:mac';
      if (process.platform === 'win32') return 'local:windows';
      return 'remote:linux';
    }
    if (host === '::1') {
      return process.platform === 'win32' ? 'local:windows(wsl)' : 'remote:linux';
    }
    return 'remote:linux';
  } catch {
    return 'remote:linux';
  }
}

export class ChatService {
  private gatewayUrl: string;
  private gatewayToken: string;
  private gatewayConnectionPlatform: string;
  private gatewaySource: OpenClawGatewayConfigSource;
  private gatewayUpdatedAt: string;
  private readonly sessionKey: string;
  private readonly timeoutMs: number;
  private readonly identityFilePath: string;

  constructor(env: Env) {
    this.gatewayUrl = env.OPENCLAW_GATEWAY_URL;
    this.gatewayToken = env.OPENCLAW_GATEWAY_TOKEN?.trim() || env.OPENCLAW_API_KEY?.trim() || '';
    this.gatewayConnectionPlatform = inferConnectionPlatform(this.gatewayUrl);
    this.gatewaySource = 'env';
    this.gatewayUpdatedAt = new Date().toISOString();
    this.sessionKey = env.OPENCLAW_CHAT_SESSION_KEY;
    this.timeoutMs = env.OPENCLAW_CHAT_TIMEOUT_MS;
    this.identityFilePath = join(dirname(env.DATABASE_URL), 'openclaw-device.json');
  }

  configureGateway(config: OpenClawGatewayConfig): void {
    const url = config.url.trim();
    const token = config.token.trim();
    const connectionPlatform = config.connectionPlatform.trim();
    if (!url) {
      throw new Error('Gateway url cannot be empty');
    }
    if (!token) {
      throw new Error('Gateway token cannot be empty');
    }
    if (!connectionPlatform) {
      throw new Error('Gateway connectionPlatform cannot be empty');
    }

    this.gatewayUrl = url;
    this.gatewayToken = token;
    this.gatewayConnectionPlatform = connectionPlatform;
    this.gatewaySource = config.source;
    this.gatewayUpdatedAt = config.updatedAt;

    logger.info(
      `OpenClaw gateway configured: platform=${this.gatewayConnectionPlatform} source=${this.gatewaySource} url=${this.gatewayUrl}`,
    );
  }

  getGatewayConfig(): Omit<OpenClawGatewayConfig, 'token'> {
    return {
      url: this.gatewayUrl,
      connectionPlatform: this.gatewayConnectionPlatform,
      source: this.gatewaySource,
      updatedAt: this.gatewayUpdatedAt,
    };
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

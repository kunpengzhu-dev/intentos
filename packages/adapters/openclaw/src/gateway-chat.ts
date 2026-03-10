import { createHash, randomUUID, webcrypto } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import WebSocket from 'ws';

// OpenClaw gateway websocket chat bridge used by server chat service.
type DeviceIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKeyPkcs8: string;
  createdAtMs: number;
};

type StreamChatOptions = {
  wsUrl: string;
  token?: string;
  timeoutMs: number;
  origin?: string;
  sessionKey: string;
  message: string;
  identityFilePath: string;
  onDelta: (delta: string) => void;
  onFinal: (finalText: string) => void;
  onHistory?: (historyPayload: unknown) => void;
  onGatewayFrame?: (rawFrame: string) => void;
};

type PendingReq = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
};

function assertCryptoKeyPair(
  key: webcrypto.CryptoKey | webcrypto.CryptoKeyPair,
): asserts key is webcrypto.CryptoKeyPair {
  if (!('publicKey' in key) || !('privateKey' in key)) {
    throw new Error('Expected CryptoKeyPair for Ed25519 identity generation');
  }
}

function b64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(value: string): Uint8Array {
  const b64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4 || 4)) % 4);
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

function buildDeviceSignPayloadV2({
  deviceId,
  clientId,
  clientMode,
  role,
  scopes,
  signedAtMs,
  token,
  nonce,
}: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
}) {
  return [
    'v2',
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token,
    nonce,
  ].join('|');
}

async function signPayloadV2(privateKeyPkcs8B64u: string, payloadText: string): Promise<string> {
  const privateKey = await webcrypto.subtle.importKey(
    'pkcs8',
    b64urlDecode(privateKeyPkcs8B64u),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await webcrypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(payloadText)),
  );
  return b64urlEncode(signature);
}

async function loadOrCreateDeviceIdentity(identityFilePath: string): Promise<DeviceIdentity> {
  try {
    if (existsSync(identityFilePath)) {
      const parsed = JSON.parse(readFileSync(identityFilePath, 'utf8')) as DeviceIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed?.deviceId === 'string' &&
        typeof parsed?.publicKey === 'string' &&
        typeof parsed?.privateKeyPkcs8 === 'string'
      ) {
        return parsed;
      }
    }
  } catch {
    // fall through to regeneration
  }

  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  );
  assertCryptoKeyPair(keyPair);
  const publicRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));
  const privatePkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', keyPair.privateKey));

  const identity: DeviceIdentity = {
    version: 1,
    deviceId: sha256Hex(publicRaw),
    publicKey: b64urlEncode(publicRaw),
    privateKeyPkcs8: b64urlEncode(privatePkcs8),
    createdAtMs: Date.now(),
  };

  mkdirSync(dirname(identityFilePath), { recursive: true });
  writeFileSync(identityFilePath, JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}

function stringifyPayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function extractTextFromMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (!message || typeof message !== 'object') {
    return '';
  }

  const messageObj = message as Record<string, unknown>;
  if (typeof messageObj.text === 'string') {
    return messageObj.text;
  }
  if (typeof messageObj.content === 'string') {
    return messageObj.content;
  }
  if (Array.isArray(messageObj.content)) {
    const text = messageObj.content
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const part = item as Record<string, unknown>;
        if (part.type === 'text' && typeof part.text === 'string') {
          return part.text;
        }
        if (typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter((item) => item.length > 0)
      .join('');
    if (text) {
      return text;
    }
  }
  if (Array.isArray(messageObj.parts)) {
    const text = messageObj.parts
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const part = item as Record<string, unknown>;
        return typeof part.text === 'string' ? part.text : '';
      })
      .filter((item) => item.length > 0)
      .join('');
    if (text) {
      return text;
    }
  }

  return '';
}

function extractFinalTextFromChatPayload(payload: Record<string, unknown>): string {
  const text = extractTextFromMessage(payload.message);
  if (text) {
    return text;
  }
  return stringifyPayload(payload);
}

function extractAssistantTextFromAgentPayload(payload: Record<string, unknown>): string {
  const stream = typeof payload.stream === 'string' ? payload.stream : '';
  if (stream !== 'assistant') return '';
  const data = payload.data;
  if (!data || typeof data !== 'object') return '';
  const dataObj = data as Record<string, unknown>;
  if (typeof dataObj.text === 'string') return dataObj.text;
  if (typeof dataObj.delta === 'string') return dataObj.delta;
  return '';
}

export async function streamOpenClawGatewayChat(options: StreamChatOptions): Promise<void> {
  const identity = await loadOrCreateDeviceIdentity(options.identityFilePath);
  const timeoutMs = options.timeoutMs;
  const token = options.token?.trim() ?? '';
  const clientId = 'webchat-ui';
  const clientMode = 'webchat';
  const role = 'operator';
  const scopes = ['operator.read', 'operator.write', 'operator.pairing'];

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(
      options.wsUrl,
      options.origin ? { origin: options.origin } : undefined,
    );
    let reqSeq = 1;
    let connectNonce = '';
    let connected = false;
    let connecting = false;
    let closed = false;
    const pending = new Map<string, PendingReq>();
    let historySyncPromise: Promise<void> | null = null;
    let historySyncedForThisTurn = false;
    let historyReadyForThisTurn = false;
    let bufferedLatestText = '';
    let hasAgentAssistantStream = false;

    const closeAndFinish = (error?: Error) => {
      if (closed) return;
      closed = true;
      for (const pendingReq of pending.values()) {
        pendingReq.reject(error ?? new Error('socket closed'));
      }
      pending.clear();
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timeout = setTimeout(() => {
      closeAndFinish(new Error('OpenClaw chat timed out'));
    }, timeoutMs);

    const sendReq = (method: string, params: Record<string, unknown>): Promise<unknown> => {
      if (ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('OpenClaw gateway socket is not open'));
      }
      const id = `r_${reqSeq++}`;
      ws.send(JSON.stringify({ type: 'req', id, method, params }));
      return new Promise((resolveReq, rejectReq) => {
        pending.set(id, { resolve: resolveReq, reject: rejectReq });
      });
    };

    const fetchHistoryOnce = async () => {
      try {
        const historyPayload = await sendReq('chat.history', {
          sessionKey: options.sessionKey,
          limit: 10,
        });
        options.onHistory?.(historyPayload);
      } catch (error) {
        const message = (error as Error).message || '';
        const limitRejected =
          message.includes("unexpected property 'limit'") ||
          message.includes('unexpected property "limit"');
        if (!limitRejected) return;
        try {
          const historyPayload = await sendReq('chat.history', {
            sessionKey: options.sessionKey,
          });
          options.onHistory?.(historyPayload);
        } catch {
          // ignore chat.history error
        }
      }
    };

    const emitAssistantText = (fullText: string) => {
      if (!fullText) return;
      if (historyReadyForThisTurn) {
        options.onDelta(fullText);
        return;
      }
      bufferedLatestText = fullText;
    };

    const flushBufferedAssistantText = () => {
      if (!bufferedLatestText) return;
      options.onDelta(bufferedLatestText);
      bufferedLatestText = '';
    };

    const ensureHistorySynced = async (): Promise<void> => {
      if (!historySyncPromise) {
        historySyncPromise = (async () => {
          await fetchHistoryOnce();
        })().finally(() => {
          historyReadyForThisTurn = true;
          flushBufferedAssistantText();
        });
      }
      await historySyncPromise;
    };

    const doConnectRequest = async () => {
      const signedAt = Date.now();
      const signText = buildDeviceSignPayloadV2({
        deviceId: identity.deviceId,
        clientId,
        clientMode,
        role,
        scopes,
        signedAtMs: signedAt,
        token,
        nonce: connectNonce,
      });
      const signature = await signPayloadV2(identity.privateKeyPkcs8, signText);

      const params: Record<string, unknown> = {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: clientId,
          version: '0.2.0',
          platform: process.platform,
          mode: clientMode,
          instanceId: randomUUID(),
        },
        role,
        scopes,
        caps: [],
        commands: [],
        permissions: {},
        locale: 'zh-CN',
        userAgent: 'intentos-server/0.0.0',
        device: {
          id: identity.deviceId,
          publicKey: identity.publicKey,
          signature,
          signedAt,
          nonce: connectNonce,
        },
      };

      if (token) {
        params.auth = { token };
      }

      const response = await sendReq('connect', params) as { type?: string };
      if (response?.type !== 'hello-ok') {
        throw new Error('OpenClaw gateway connect failed');
      }
      connected = true;
      const chatSendBaseParams = {
        sessionKey: options.sessionKey,
        message: options.message,
        deliver: false,
        idempotencyKey: randomUUID(),
      };
      await sendReq('chat.send', chatSendBaseParams);
    };

    const startConnectOnce = () => {
      if (closed || connected || connecting || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      connecting = true;
      void doConnectRequest()
        .catch((error) => {
          clearTimeout(timeout);
          closeAndFinish(error as Error);
        })
        .finally(() => {
          connecting = false;
        });
    };

    ws.onopen = () => {
      setTimeout(() => {
        startConnectOnce();
      }, 800);
    };

    ws.onmessage = (event) => {
      if (closed) return;
      const rawFrame = event.data.toString();
      options.onGatewayFrame?.(rawFrame);

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawFrame) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data.type === 'res') {
        const id = data.id as string;
        const pendingReq = pending.get(id);
        if (!pendingReq) return;
        pending.delete(id);
        if (data.ok) {
          pendingReq.resolve(data.payload);
        } else {
          const errorObj = data.error as Record<string, unknown> | undefined;
          const message = (errorObj?.message as string) || (errorObj?.code as string) || 'OpenClaw request failed';
          pendingReq.reject(new Error(message));
        }
        return;
      }

      if (data.type === 'event') {
        const eventName = data.event as string;
        if (eventName === 'connect.challenge') {
          const payload = data.payload as Record<string, unknown> | undefined;
          connectNonce = (payload?.nonce as string) ?? '';
          startConnectOnce();
          return;
        }

        if (eventName === 'agent') {
          const payload = (data.payload ?? {}) as Record<string, unknown>;
          const assistantText = extractAssistantTextFromAgentPayload(payload);
          if (!assistantText) {
            return;
          }
          hasAgentAssistantStream = true;
          emitAssistantText(assistantText);
          if (!historySyncedForThisTurn) {
            historySyncedForThisTurn = true;
            void ensureHistorySynced();
          }
          return;
        }

        if (eventName === 'chat') {
          const payload = (data.payload ?? {}) as Record<string, unknown>;
          const state = payload.state as string;
          if (state === 'delta') {
            const deltaText = extractTextFromMessage(payload.message);
            if (deltaText && !hasAgentAssistantStream) {
              emitAssistantText(deltaText);
            }
            if (!historySyncedForThisTurn) {
              historySyncedForThisTurn = true;
              void ensureHistorySynced();
            }
            return;
          }
          if (state === 'final') {
            const finalText = extractFinalTextFromChatPayload(payload);
            void (async () => {
              try {
                if (!historySyncedForThisTurn) {
                  historySyncedForThisTurn = true;
                  await ensureHistorySynced();
                } else if (!historyReadyForThisTurn) {
                  await ensureHistorySynced();
                }
                await fetchHistoryOnce();
                flushBufferedAssistantText();
                options.onFinal(finalText);
              } finally {
                clearTimeout(timeout);
                closeAndFinish();
              }
            })();
            return;
          }
          if (state === 'error') {
            const errorMessage = (payload.errorMessage as string) || 'OpenClaw chat error';
            clearTimeout(timeout);
            closeAndFinish(new Error(errorMessage));
          }
        }

      }
    };

    ws.onerror = () => {
      // wait for close / timeout for final reason
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (closed) return;
      const reason = event.reason ? `: ${event.reason.toString()}` : '';
      closeAndFinish(new Error(`OpenClaw socket closed (${event.code})${reason}`));
    };
  });
}

type FetchHistoryOptions = {
  wsUrl: string;
  token?: string;
  timeoutMs: number;
  origin?: string;
  sessionKey: string;
  identityFilePath: string;
  limit: number;
};

export async function fetchOpenClawGatewayHistory(options: FetchHistoryOptions): Promise<unknown> {
  const identity = await loadOrCreateDeviceIdentity(options.identityFilePath);
  const token = options.token?.trim() ?? '';
  const timeoutMs = options.timeoutMs;
  const clientId = 'webchat-ui';
  const clientMode = 'webchat';
  const role = 'operator';
  const scopes = ['operator.read', 'operator.write', 'operator.pairing'];
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit)) : 20;
  let historyPayload: unknown = [];

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(
      options.wsUrl,
      options.origin ? { origin: options.origin } : undefined,
    );
    let reqSeq = 1;
    let connectNonce = '';
    let connected = false;
    let connecting = false;
    let closed = false;
    const pending = new Map<string, PendingReq>();

    const closeAndFinish = (error?: Error) => {
      if (closed) return;
      closed = true;
      for (const pendingReq of pending.values()) {
        pendingReq.reject(error ?? new Error('socket closed'));
      }
      pending.clear();
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timeout = setTimeout(() => {
      closeAndFinish(new Error('OpenClaw history request timed out'));
    }, timeoutMs);

    const sendReq = (method: string, params: Record<string, unknown>): Promise<unknown> => {
      if (ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('OpenClaw gateway socket is not open'));
      }
      const id = `r_${reqSeq++}`;
      ws.send(JSON.stringify({ type: 'req', id, method, params }));
      return new Promise((resolveReq, rejectReq) => {
        pending.set(id, { resolve: resolveReq, reject: rejectReq });
      });
    };

    const doConnectAndFetchHistory = async () => {
      const signedAt = Date.now();
      const signText = buildDeviceSignPayloadV2({
        deviceId: identity.deviceId,
        clientId,
        clientMode,
        role,
        scopes,
        signedAtMs: signedAt,
        token,
        nonce: connectNonce,
      });
      const signature = await signPayloadV2(identity.privateKeyPkcs8, signText);

      const params: Record<string, unknown> = {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: clientId,
          version: '0.2.0',
          platform: process.platform,
          mode: clientMode,
          instanceId: randomUUID(),
        },
        role,
        scopes,
        caps: [],
        commands: [],
        permissions: {},
        locale: 'zh-CN',
        userAgent: 'intentos-server/0.0.0',
        device: {
          id: identity.deviceId,
          publicKey: identity.publicKey,
          signature,
          signedAt,
          nonce: connectNonce,
        },
      };

      if (token) {
        params.auth = { token };
      }

      const response = await sendReq('connect', params) as { type?: string };
      if (response?.type !== 'hello-ok') {
        throw new Error('OpenClaw gateway connect failed');
      }
      connected = true;

      try {
        historyPayload = await sendReq('chat.history', {
          sessionKey: options.sessionKey,
          limit,
        });
      } catch (error) {
        const message = (error as Error).message || '';
        const limitRejected =
          message.includes("unexpected property 'limit'") ||
          message.includes('unexpected property "limit"');
        if (!limitRejected) {
          throw error;
        }
        historyPayload = await sendReq('chat.history', {
          sessionKey: options.sessionKey,
        });
      }
    };

    const startConnectAndFetchHistoryOnce = () => {
      if (closed || connected || connecting || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      connecting = true;
      void doConnectAndFetchHistory()
        .then(() => {
          clearTimeout(timeout);
          closeAndFinish();
        })
        .catch((error) => {
          clearTimeout(timeout);
          closeAndFinish(error as Error);
        })
        .finally(() => {
          connecting = false;
        });
    };

    ws.onopen = () => {
      setTimeout(() => {
        startConnectAndFetchHistoryOnce();
      }, 800);
    };

    ws.onmessage = (event) => {
      if (closed) return;
      const rawFrame = event.data.toString();

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawFrame) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data.type === 'res') {
        const id = data.id as string;
        const pendingReq = pending.get(id);
        if (!pendingReq) return;
        pending.delete(id);
        if (data.ok) {
          pendingReq.resolve(data.payload);
        } else {
          const errorObj = data.error as Record<string, unknown> | undefined;
          const message = (errorObj?.message as string) || (errorObj?.code as string) || 'OpenClaw request failed';
          pendingReq.reject(new Error(message));
        }
        return;
      }

      if (data.type === 'event' && data.event === 'connect.challenge') {
        const payload = data.payload as Record<string, unknown> | undefined;
        connectNonce = (payload?.nonce as string) ?? '';
        startConnectAndFetchHistoryOnce();
      }
    };

    ws.onerror = () => {
      // wait for close / timeout for final reason
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (closed) return;
      const reason = event.reason ? `: ${event.reason.toString()}` : '';
      closeAndFinish(new Error(`OpenClaw socket closed (${event.code})${reason}`));
    };
  });

  return historyPayload;
}

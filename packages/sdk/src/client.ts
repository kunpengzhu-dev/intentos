import { nanoid } from 'nanoid';
import type { Envelope, Cursor } from '@intentos/protocol';
import { PROTOCOL_VERSION, isReplayable } from '@intentos/protocol';

export type ConnectionState = 'disconnected' | 'connecting' | 'handshaking' | 'connected';

export type AIOSClientOptions = {
  url: string;
  deviceId?: string;
  onStateChange?: (state: ConnectionState) => void;
  onEnvelope?: (envelope: Envelope) => void;
  onError?: (error: Error) => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
};

export class AIOSClient {
  private ws: WebSocket | null = null;
  private options: Required<AIOSClientOptions>;
  private state: ConnectionState = 'disconnected';
  private clientId: string;
  private sessionId: string | null = null;
  private scopeId: string | null = null;
  private clientSeq = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private cursor: Cursor = { v: 1, items: [] };
  private subscribedStreams = new Set<string>();
  private listeners = new Map<string, Set<(envelope: Envelope) => void>>();
  private pendingAcks = new Map<
    string,
    { resolve: (env: Envelope) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  private streamSeqs = new Map<string, number>();
  private gapRetries = new Map<string, number>();

  constructor(options: AIOSClientOptions) {
    this.clientId = options.deviceId || this.loadClientId();
    this.options = {
      deviceId: this.clientId,
      onStateChange: () => {},
      onEnvelope: () => {},
      onError: () => {},
      reconnect: true,
      reconnectInterval: 2000,
      maxReconnectAttempts: 10,
      ...options,
    };
  }

  private loadClientId(): string {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('intentos:clientId');
      if (stored) return stored;
      const id = nanoid();
      localStorage.setItem('intentos:clientId', id);
      return id;
    }
    return nanoid();
  }

  get connectionState() {
    return this.state;
  }
  get currentScopeId() {
    return this.scopeId;
  }
  get currentSessionId() {
    return this.sessionId;
  }

  connect() {
    if (this.state !== 'disconnected') return;
    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.options.url);

      this.ws.onopen = () => {
        this.setState('handshaking');
        this.sendRaw({
          id: nanoid(),
          version: PROTOCOL_VERSION,
          kind: 'cmd',
          type: 'auth/handshake',
          ts: Date.now(),
          payload: { deviceId: this.clientId },
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data as string) as Envelope;
          this.handleMessage(envelope);
        } catch (err) {
          this.options.onError(err as Error);
        }
      };

      this.ws.onclose = () => {
        this.setState('disconnected');
        this.sessionId = null;
        if (this.options.reconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.options.onError(new Error('WebSocket error'));
      };
    } catch (err) {
      this.setState('disconnected');
      this.options.onError(err as Error);
    }
  }

  disconnect() {
    this.options.reconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.setState('disconnected');
  }

  private setState(state: ConnectionState) {
    this.state = state;
    this.options.onStateChange(state);
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.options.reconnectInterval * Math.min(this.reconnectAttempts, 5));
  }

  private handleMessage(envelope: Envelope) {
    if (envelope.kind === 'cmd') return;

    if (envelope.type === 'auth/handshake_ok') {
      const p = envelope.payload as { sessionId: string; clientId: string; scopeId: string };
      this.sessionId = p.sessionId;
      this.clientId = p.clientId;
      this.scopeId = p.scopeId;
      this.reconnectAttempts = 0;
      this.setState('connected');

      if (this.subscribedStreams.size > 0) {
        this.subscribe([...this.subscribedStreams]);
      }
      return;
    }

    if (envelope.type === 'auth/handshake_failed') {
      this.options.onError(new Error('Handshake failed'));
      this.disconnect();
      return;
    }

    if (envelope.kind === 'ack' && envelope.reqId) {
      const pending = this.pendingAcks.get(envelope.reqId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingAcks.delete(envelope.reqId);
        pending.resolve(envelope);
      }
    }

    if (
      envelope.kind === 'evt' &&
      isReplayable(envelope.type) &&
      envelope.streamId &&
      envelope.serverSeq != null
    ) {
      const lastSeq = this.streamSeqs.get(envelope.streamId) ?? 0;
      const expected = lastSeq + 1;

      if (envelope.serverSeq === expected) {
        this.streamSeqs.set(envelope.streamId, envelope.serverSeq);
        this.updateCursor(envelope.streamId, envelope.serverSeq);
        this.gapRetries.delete(envelope.streamId);
      } else if (envelope.serverSeq > expected) {
        const retries = this.gapRetries.get(envelope.streamId) ?? 0;
        if (retries < 3) {
          this.gapRetries.set(envelope.streamId, retries + 1);
          this.subscribe([envelope.streamId]);
        } else {
          this.streamSeqs.delete(envelope.streamId);
          this.gapRetries.delete(envelope.streamId);
          this.removeCursorItem(envelope.streamId);
          this.subscribe([envelope.streamId]);
        }
        return;
      } else {
        return;
      }
    }

    this.options.onEnvelope(envelope);
    this.emit(envelope.type, envelope);

    const ns = envelope.type.split('/')[0];
    if (ns) this.emit(`${ns}/*`, envelope);
  }

  private updateCursor(streamId: string, seq: number) {
    const existing = this.cursor.items.findIndex((i) => i.s === streamId);
    if (existing >= 0) {
      this.cursor.items[existing] = { s: streamId, q: seq, t: Date.now() };
    } else {
      this.cursor.items.push({ s: streamId, q: seq, t: Date.now() });
    }
    this.cursor.items = this.cursor.items
      .sort((a, b) => b.t - a.t)
      .filter((item, index) => item.s === 'global' || index < 20);
  }

  private removeCursorItem(streamId: string) {
    this.cursor.items = this.cursor.items.filter((i) => i.s !== streamId);
  }

  // --- Public API ---

  send(type: string, payload: unknown): Promise<Envelope> {
    return new Promise((resolve, reject) => {
      const reqId = nanoid();
      const seq = ++this.clientSeq;

      const envelope: Envelope = {
        id: nanoid(),
        version: PROTOCOL_VERSION,
        kind: 'cmd',
        type,
        ts: Date.now(),
        clientId: this.clientId,
        clientSeq: seq,
        sessionId: this.sessionId ?? undefined,
        scopeId: this.scopeId ?? undefined,
        reqId,
        payload,
      };

      const timer = setTimeout(() => {
        this.pendingAcks.delete(reqId);
        reject(new Error(`ACK timeout for ${type}`));
      }, 10000);

      this.pendingAcks.set(reqId, { resolve, reject, timer });
      this.sendRaw(envelope);
    });
  }

  sendFire(type: string, payload: unknown) {
    const seq = ++this.clientSeq;
    this.sendRaw({
      id: nanoid(),
      version: PROTOCOL_VERSION,
      kind: 'cmd',
      type,
      ts: Date.now(),
      clientId: this.clientId,
      clientSeq: seq,
      sessionId: this.sessionId ?? undefined,
      scopeId: this.scopeId ?? undefined,
      reqId: nanoid(),
      payload,
    });
  }

  subscribe(streams: string[]) {
    for (const s of streams) this.subscribedStreams.add(s);
    this.sendFire('stream/subscribe', { streams, cursor: this.cursor });
  }

  unsubscribe(streams: string[]) {
    for (const s of streams) this.subscribedStreams.delete(s);
    this.sendFire('stream/unsubscribe', { streams });
  }

  on(type: string, handler: (envelope: Envelope) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
    return () => {
      this.listeners.get(type)?.delete(handler);
    };
  }

  off(type: string, handler: (envelope: Envelope) => void) {
    this.listeners.get(type)?.delete(handler);
  }

  getCursor(): Cursor {
    return { ...this.cursor, items: [...this.cursor.items] };
  }

  private emit(type: string, envelope: Envelope) {
    this.listeners.get(type)?.forEach((fn) => fn(envelope));
  }

  private sendRaw(envelope: Envelope) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
  }
}

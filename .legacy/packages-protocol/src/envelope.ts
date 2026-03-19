export type Envelope<T = unknown> = {
  id: string;
  version: number;
  kind: 'cmd' | 'ack' | 'evt' | 'notify';
  type: string;
  ts: number;

  debugActor?: 'client' | 'server';
  scopeId?: string;
  clientId?: string;
  sessionId?: string;

  streamId?: string;
  serverSeq?: number;
  clientSeq?: number;

  traceId?: string;
  reqId?: string;

  payload: T;
};

export type EnvelopeKind = Envelope['kind'];

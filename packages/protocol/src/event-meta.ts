export type EventMetaEntry = {
  replayable: boolean;
  stream: 'global' | 'run' | null;
  since: number;
};

export const EVENT_META: Record<string, EventMetaEntry> = {
  'auth/handshake': { replayable: false, stream: null, since: 1 },
  'auth/handshake_ok': { replayable: false, stream: null, since: 1 },
  'auth/handshake_failed': { replayable: false, stream: null, since: 1 },

  'boot/start': { replayable: false, stream: null, since: 1 },
  'boot/step.updated': { replayable: false, stream: null, since: 1 },
  'boot/completed': { replayable: false, stream: null, since: 1 },
  'boot/failed': { replayable: false, stream: null, since: 1 },

  'intent/create': { replayable: false, stream: null, since: 1 },
  'intent/create_ack': { replayable: false, stream: null, since: 1 },
  'intent/created': { replayable: true, stream: 'global', since: 1 },
  'intent/status_changed': { replayable: true, stream: 'global', since: 1 },
  'intent/suggested': { replayable: false, stream: null, since: 1 },
  'intent/cancel': { replayable: false, stream: null, since: 1 },
  'intent/cancel_ack': { replayable: false, stream: null, since: 1 },
  'intent/retry': { replayable: false, stream: null, since: 1 },
  'intent/retry_ack': { replayable: false, stream: null, since: 1 },

  'run/snapshot': { replayable: false, stream: null, since: 1 },
  'run/started': { replayable: true, stream: 'run', since: 1 },
  'run/step_upserted': { replayable: true, stream: 'run', since: 1 },
  'run/progress': { replayable: false, stream: null, since: 1 },
  'run/needs_approval': { replayable: true, stream: 'run', since: 1 },
  'run/approve': { replayable: false, stream: null, since: 1 },
  'run/approve_ack': { replayable: false, stream: null, since: 1 },
  'run/approval_recorded': { replayable: true, stream: 'run', since: 1 },
  'run/completed': { replayable: true, stream: 'run', since: 1 },
  'run/failed': { replayable: true, stream: 'run', since: 1 },
  'run/cancelled': { replayable: true, stream: 'run', since: 1 },

  'chat/send': { replayable: false, stream: null, since: 1 },
  'chat/delta': { replayable: false, stream: null, since: 1 },

  'suggestion/list': { replayable: false, stream: null, since: 1 },
  'suggestion/list_ok': { replayable: false, stream: null, since: 1 },

  'stream/subscribe': { replayable: false, stream: null, since: 1 },
  'stream/subscribe_ok': { replayable: false, stream: null, since: 1 },
  'stream/unsubscribe': { replayable: false, stream: null, since: 1 },

  'global/snapshot': { replayable: false, stream: null, since: 1 },
} as const;

export function isReplayable(type: string): boolean {
  return EVENT_META[type]?.replayable === true;
}

export function getStream(type: string): 'global' | 'run' | null {
  return EVENT_META[type]?.stream ?? null;
}

export function isKnownEventType(type: string): boolean {
  return type in EVENT_META;
}

export function getEventMeta(type: string): EventMetaEntry | undefined {
  return EVENT_META[type];
}

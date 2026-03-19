import type { Envelope, EnvelopeKind } from './envelope.js';
import { isKnownEventType, isReplayable } from './event-meta.js';
import { isValidStreamId } from './stream-id.js';

export type Direction = 'c2s' | 's2c';

const ALLOWED_KINDS: Record<Direction, readonly EnvelopeKind[]> = {
  c2s: ['cmd'],
  s2c: ['ack', 'evt', 'notify'],
};

export type EnvelopeError = {
  field: string;
  message: string;
};

export function validateEnvelope(
  envelope: Envelope,
  direction: Direction,
): EnvelopeError[] {
  const errors: EnvelopeError[] = [];

  if (!ALLOWED_KINDS[direction].includes(envelope.kind)) {
    errors.push({
      field: 'kind',
      message: `kind="${envelope.kind}" not allowed for direction="${direction}"`,
    });
  }

  if (!isKnownEventType(envelope.type)) {
    errors.push({
      field: 'type',
      message: `unknown event type "${envelope.type}"`,
    });
  }

  if (envelope.kind === 'cmd' && envelope.type !== 'auth/handshake') {
    if (!envelope.clientId) {
      errors.push({ field: 'clientId', message: 'CMD requires clientId' });
    }
    if (envelope.clientSeq == null) {
      errors.push({ field: 'clientSeq', message: 'CMD requires clientSeq' });
    }
    if (!envelope.reqId) {
      errors.push({ field: 'reqId', message: 'CMD requires reqId' });
    }
  }

  if (envelope.kind === 'evt' && isReplayable(envelope.type)) {
    if (!envelope.streamId) {
      errors.push({ field: 'streamId', message: 'replayable EVT requires streamId' });
    } else if (!isValidStreamId(envelope.streamId)) {
      errors.push({ field: 'streamId', message: `invalid streamId format: "${envelope.streamId}"` });
    }
    if (envelope.serverSeq == null) {
      errors.push({ field: 'serverSeq', message: 'replayable EVT requires serverSeq' });
    }
  }

  if (envelope.kind === 'notify') {
    if (envelope.streamId != null) {
      errors.push({ field: 'streamId', message: 'NOTIFY must not carry streamId' });
    }
    if (envelope.serverSeq != null) {
      errors.push({ field: 'serverSeq', message: 'NOTIFY must not carry serverSeq' });
    }
  }

  return errors;
}

export function assertEnvelope(
  envelope: Envelope,
  direction: Direction,
): void {
  const errors = validateEnvelope(envelope, direction);
  if (errors.length > 0) {
    const messages = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`Invalid envelope: ${messages}`);
  }
}

export function isEventType(type: string): boolean {
  return isKnownEventType(type);
}

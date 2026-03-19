import { isReplayable, getStream } from '@intentos/protocol';
import type { AppDatabase } from '../db/index.js';
import { logger } from '../config/logger.js';

export function appendEvent(
  database: AppDatabase,
  scopeId: string,
  streamId: string,
  type: string,
  payload: unknown,
): number {
  if (!isReplayable(type)) {
    throw new Error(`Cannot append non-replayable event: ${type}`);
  }

  const expectedStream = getStream(type);
  if (expectedStream === 'global' && streamId !== 'global') {
    throw new Error(`Event ${type} must go to global stream, got ${streamId}`);
  }
  if (expectedStream === 'run' && !streamId.startsWith('run:')) {
    throw new Error(`Event ${type} must go to run stream, got ${streamId}`);
  }

  const result = database.sqlite.transaction(() => {
    const head = database.sqlite
      .prepare('SELECT last_seq FROM stream_head WHERE scope_id = ? AND stream_id = ?')
      .get(scopeId, streamId) as { last_seq: number } | undefined;

    const nextSeq = (head?.last_seq ?? 0) + 1;

    if (head) {
      database.sqlite
        .prepare('UPDATE stream_head SET last_seq = ? WHERE scope_id = ? AND stream_id = ?')
        .run(nextSeq, scopeId, streamId);
    } else {
      database.sqlite
        .prepare('INSERT INTO stream_head (scope_id, stream_id, last_seq) VALUES (?, ?, ?)')
        .run(scopeId, streamId, nextSeq);
    }

    database.sqlite
      .prepare('INSERT INTO events (scope_id, stream_id, server_seq, type, payload, ts) VALUES (?, ?, ?, ?, ?, ?)')
      .run(scopeId, streamId, nextSeq, type, JSON.stringify(payload), Date.now());

    return nextSeq;
  }).immediate();

  logger.debug(`Event appended: ${type} -> ${streamId}@${result}`);
  return result as number;
}

export function getEvents(
  database: AppDatabase,
  scopeId: string,
  streamId: string,
  afterSeq: number = 0,
): Array<{ serverSeq: number; type: string; payload: string; ts: number }> {
  return database.sqlite
    .prepare(
      'SELECT server_seq as serverSeq, type, payload, ts FROM events WHERE scope_id = ? AND stream_id = ? AND server_seq > ? ORDER BY server_seq ASC',
    )
    .all(scopeId, streamId, afterSeq) as Array<{ serverSeq: number; type: string; payload: string; ts: number }>;
}

export function getStreamHead(
  database: AppDatabase,
  scopeId: string,
  streamId: string,
): number {
  const head = database.sqlite
    .prepare('SELECT last_seq FROM stream_head WHERE scope_id = ? AND stream_id = ?')
    .get(scopeId, streamId) as { last_seq: number } | undefined;
  return head?.last_seq ?? 0;
}

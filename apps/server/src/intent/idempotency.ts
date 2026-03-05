import { createHash } from 'crypto';
import type { AppDatabase } from '../db/index.js';

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export type IdempotencyResult =
  | { hit: false }
  | { hit: true; match: true; ackPayload: unknown }
  | { hit: true; match: false };

export function checkIdempotency(
  database: AppDatabase,
  scopeId: string,
  clientId: string,
  reqId: string,
  payloadHash: string,
): IdempotencyResult {
  const row = database.sqlite
    .prepare('SELECT ack_payload, payload_hash FROM idempotency WHERE scope_id = ? AND client_id = ? AND req_id = ?')
    .get(scopeId, clientId, reqId) as { ack_payload: string; payload_hash: string } | undefined;

  if (!row) return { hit: false };
  if (row.payload_hash === payloadHash) {
    return { hit: true, match: true, ackPayload: JSON.parse(row.ack_payload) };
  }
  return { hit: true, match: false };
}

export function recordIdempotency(
  database: AppDatabase,
  scopeId: string,
  clientId: string,
  reqId: string,
  type: string,
  ackPayload: unknown,
  payloadHash: string,
): void {
  database.sqlite
    .prepare('INSERT OR IGNORE INTO idempotency (scope_id, client_id, req_id, type, ack_payload, payload_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(scopeId, clientId, reqId, type, JSON.stringify(ackPayload), payloadHash, Date.now());
}

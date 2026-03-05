import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const intents = sqliteTable('intents', {
  scopeId: text('scope_id').notNull(),
  id: text('id').notNull().primaryKey(),
  title: text('title').notNull(),
  originalMessage: text('original_message').notNull(),
  status: text('status').notNull().default('active'),
  currentRunId: text('current_run_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const runs = sqliteTable('runs', {
  scopeId: text('scope_id').notNull(),
  id: text('id').notNull().primaryKey(),
  intentId: text('intent_id').notNull(),
  status: text('status').notNull().default('queued'),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
});

export const events = sqliteTable('events', {
  scopeId: text('scope_id').notNull(),
  streamId: text('stream_id').notNull(),
  serverSeq: integer('server_seq').notNull(),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  ts: integer('ts').notNull(),
});

export const streamHead = sqliteTable('stream_head', {
  scopeId: text('scope_id').notNull(),
  streamId: text('stream_id').notNull(),
  lastSeq: integer('last_seq').notNull().default(0),
});

export const idempotency = sqliteTable('idempotency', {
  scopeId: text('scope_id').notNull(),
  clientId: text('client_id').notNull(),
  reqId: text('req_id').notNull(),
  type: text('type').notNull(),
  ackPayload: text('ack_payload').notNull(),
  payloadHash: text('payload_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const intentSummary = sqliteTable('intent_summary', {
  scopeId: text('scope_id').notNull(),
  intentId: text('intent_id').notNull().primaryKey(),
  title: text('title').notNull(),
  summary: text('summary'),
  status: text('status').notNull(),
  currentRunId: text('current_run_id'),
  updatedAt: integer('updated_at').notNull(),
  needsAttention: integer('needs_attention', { mode: 'boolean' }).notNull().default(false),
  progress: real('progress'),
  artifactCount: integer('artifact_count'),
});

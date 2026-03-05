import Database, { type Database as SqliteDatabase } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { env } from '../config/env.js';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export type AppDatabase = {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SqliteDatabase;
};

export function createDatabase(): AppDatabase {
  mkdirSync(dirname(env.DATABASE_URL), { recursive: true });
  const sqlite = new Database(env.DATABASE_URL);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS intents (
      scope_id TEXT NOT NULL,
      id TEXT NOT NULL PRIMARY KEY,
      title TEXT NOT NULL,
      original_message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_run_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      scope_id TEXT NOT NULL,
      id TEXT NOT NULL PRIMARY KEY,
      intent_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      started_at INTEGER,
      completed_at INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      scope_id TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      server_seq INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_stream ON events(scope_id, stream_id, server_seq);
    CREATE TABLE IF NOT EXISTS stream_head (
      scope_id TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scope_id, stream_id)
    );
    CREATE TABLE IF NOT EXISTS idempotency (
      scope_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      req_id TEXT NOT NULL,
      type TEXT NOT NULL,
      ack_payload TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (scope_id, client_id, req_id)
    );
    CREATE TABLE IF NOT EXISTS intent_summary (
      scope_id TEXT NOT NULL,
      intent_id TEXT NOT NULL PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL,
      current_run_id TEXT,
      updated_at INTEGER NOT NULL,
      needs_attention INTEGER NOT NULL DEFAULT 0,
      progress REAL,
      artifact_count INTEGER
    );
  `);

  return { db: drizzle(sqlite, { schema }), sqlite };
}

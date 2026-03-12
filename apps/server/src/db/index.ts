import { logger } from '../config/logger.js';

type SqlRow = Record<string, unknown>;

type PreparedStatement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => SqlRow | undefined;
  all: (...params: unknown[]) => SqlRow[];
};

export type SqliteLike = {
  pragma: (command: string) => void;
  exec: (sql: string) => void;
  prepare: (sql: string) => PreparedStatement;
  transaction: <T>(fn: () => T) => (() => T) & { immediate: () => T };
};

export type AppDatabase = {
  sqlite: SqliteLike;
  mode: 'memory';
};

type IntentRow = {
  scope_id: string;
  id: string;
  title: string;
  original_message: string;
  status: string;
  current_run_id: string | null;
  created_at: number;
  updated_at: number;
};

type RunRow = {
  scope_id: string;
  id: string;
  intent_id: string;
  status: string;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
  created_at: number;
};

type EventRow = {
  scope_id: string;
  stream_id: string;
  server_seq: number;
  type: string;
  payload: string;
  ts: number;
};

type ArtifactRow = {
  id: string;
  scope_id: string;
  intent_id: string;
  run_id: string;
  kind: string;
  title: string;
  content: string | null;
  url: string | null;
  preview_url: string | null;
  download_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  local_path: string | null;
  created_at: number;
};

type StreamHeadRow = {
  scope_id: string;
  stream_id: string;
  last_seq: number;
};

type IdempotencyRow = {
  scope_id: string;
  client_id: string;
  req_id: string;
  type: string;
  ack_payload: string;
  payload_hash: string;
  created_at: number;
};

type IntentSummaryRow = {
  scope_id: string;
  intent_id: string;
  title: string;
  summary: string | null;
  status: string;
  current_run_id: string | null;
  updated_at: number;
  needs_attention: number;
  progress: number | null;
  artifact_count: number | null;
};

const SCHEMA_SQL = `
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
  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT NOT NULL PRIMARY KEY,
    scope_id TEXT NOT NULL,
    intent_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    url TEXT,
    preview_url TEXT,
    download_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,
    local_path TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(scope_id, run_id, created_at);
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
`;

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().replace(/;$/, '').toLowerCase();
}

function cloneRow<T extends SqlRow>(row: T): T {
  return { ...row };
}

class InMemorySqlite implements SqliteLike {
  private readonly intents = new Map<string, IntentRow>();
  private readonly runs = new Map<string, RunRow>();
  private readonly events: EventRow[] = [];
  private readonly artifacts = new Map<string, ArtifactRow>();
  private readonly streamHead = new Map<string, StreamHeadRow>();
  private readonly idempotency = new Map<string, IdempotencyRow>();
  private readonly intentSummary = new Map<string, IntentSummaryRow>();

  pragma(_command: string): void {
    void _command;
  }

  exec(_sql: string): void {
    void _sql;
  }

  transaction<T>(fn: () => T): (() => T) & { immediate: () => T } {
    const runner = (() => fn()) as (() => T) & { immediate: () => T };
    runner.immediate = () => fn();
    return runner;
  }

  prepare(sql: string): PreparedStatement {
    const query = normalizeSql(sql);
    return {
      run: (...params: unknown[]) => this.runStatement(query, params),
      get: (...params: unknown[]) => this.getStatement(query, params),
      all: (...params: unknown[]) => this.allStatement(query, params),
    };
  }

  private streamHeadKey(scopeId: string, streamId: string): string {
    return `${scopeId}|${streamId}`;
  }

  private idempotencyKey(scopeId: string, clientId: string, reqId: string): string {
    return `${scopeId}|${clientId}|${reqId}`;
  }

  private runStatement(query: string, params: unknown[]): { changes: number } {
    if (query === 'insert into intents (scope_id, id, title, original_message, status, current_run_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)') {
      const [scopeId, id, title, originalMessage, status, currentRunId, createdAt, updatedAt] = params as [
        string,
        string,
        string,
        string,
        string,
        string | null,
        number,
        number,
      ];
      this.intents.set(id, {
        scope_id: scopeId,
        id,
        title,
        original_message: originalMessage,
        status,
        current_run_id: currentRunId ?? null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { changes: 1 };
    }

    if (query === 'insert into runs (scope_id, id, intent_id, status, created_at) values (?, ?, ?, ?, ?)') {
      const [scopeId, id, intentId, status, createdAt] = params as [string, string, string, string, number];
      this.runs.set(id, {
        scope_id: scopeId,
        id,
        intent_id: intentId,
        status,
        started_at: null,
        completed_at: null,
        error: null,
        created_at: createdAt,
      });
      return { changes: 1 };
    }

    if (query === 'insert or replace into intent_summary (scope_id, intent_id, title, status, current_run_id, updated_at, needs_attention) values (?, ?, ?, ?, ?, ?, ?)') {
      const [scopeId, intentId, title, status, currentRunId, updatedAt, needsAttention] = params as [
        string,
        string,
        string,
        string,
        string | null,
        number,
        number,
      ];
      this.intentSummary.set(intentId, {
        scope_id: scopeId,
        intent_id: intentId,
        title,
        summary: null,
        status,
        current_run_id: currentRunId ?? null,
        updated_at: updatedAt,
        needs_attention: Number(needsAttention ?? 0),
        progress: null,
        artifact_count: null,
      });
      return { changes: 1 };
    }

    if (query === 'update runs set status = ?, started_at = ? where id = ?') {
      const [status, startedAt, id] = params as [string, number, string];
      const row = this.runs.get(id);
      if (!row) return { changes: 0 };
      row.status = status;
      row.started_at = startedAt;
      return { changes: 1 };
    }

    if (query === 'update runs set status = ?, completed_at = ? where id = ?') {
      const [status, completedAt, id] = params as [string, number, string];
      const row = this.runs.get(id);
      if (!row) return { changes: 0 };
      row.status = status;
      row.completed_at = completedAt;
      return { changes: 1 };
    }

    if (query === 'update intents set status = ?, updated_at = ? where id = ?') {
      const [status, updatedAt, id] = params as [string, number, string];
      const row = this.intents.get(id);
      if (!row) return { changes: 0 };
      row.status = status;
      row.updated_at = updatedAt;
      return { changes: 1 };
    }

    if (query === 'update intent_summary set status = ?, updated_at = ?, artifact_count = ? where intent_id = ?') {
      const [status, updatedAt, artifactCount, intentId] = params as [string, number, number | null, string];
      const row = this.intentSummary.get(intentId);
      if (!row) return { changes: 0 };
      row.status = status;
      row.updated_at = updatedAt;
      row.artifact_count = artifactCount ?? null;
      return { changes: 1 };
    }

    if (query === 'update intent_summary set status = ?, updated_at = ?, needs_attention = ? where intent_id = ?') {
      const [status, updatedAt, needsAttention, intentId] = params as [string, number, number, string];
      const row = this.intentSummary.get(intentId);
      if (!row) return { changes: 0 };
      row.status = status;
      row.updated_at = updatedAt;
      row.needs_attention = Number(needsAttention ?? 0);
      return { changes: 1 };
    }

    if (query === 'insert or ignore into idempotency (scope_id, client_id, req_id, type, ack_payload, payload_hash, created_at) values (?, ?, ?, ?, ?, ?, ?)') {
      const [scopeId, clientId, reqId, type, ackPayload, payloadHash, createdAt] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        number,
      ];
      const key = this.idempotencyKey(scopeId, clientId, reqId);
      if (this.idempotency.has(key)) return { changes: 0 };
      this.idempotency.set(key, {
        scope_id: scopeId,
        client_id: clientId,
        req_id: reqId,
        type,
        ack_payload: ackPayload,
        payload_hash: payloadHash,
        created_at: createdAt,
      });
      return { changes: 1 };
    }

    if (query === 'update stream_head set last_seq = ? where scope_id = ? and stream_id = ?') {
      const [lastSeq, scopeId, streamId] = params as [number, string, string];
      const key = this.streamHeadKey(scopeId, streamId);
      const row = this.streamHead.get(key);
      if (!row) return { changes: 0 };
      row.last_seq = lastSeq;
      return { changes: 1 };
    }

    if (query === 'insert into stream_head (scope_id, stream_id, last_seq) values (?, ?, ?)') {
      const [scopeId, streamId, lastSeq] = params as [string, string, number];
      const key = this.streamHeadKey(scopeId, streamId);
      this.streamHead.set(key, { scope_id: scopeId, stream_id: streamId, last_seq: lastSeq });
      return { changes: 1 };
    }

    if (query === 'insert into events (scope_id, stream_id, server_seq, type, payload, ts) values (?, ?, ?, ?, ?, ?)') {
      const [scopeId, streamId, serverSeq, type, payload, ts] = params as [string, string, number, string, string, number];
      this.events.push({
        scope_id: scopeId,
        stream_id: streamId,
        server_seq: serverSeq,
        type,
        payload,
        ts,
      });
      return { changes: 1 };
    }

    if (query.startsWith('insert into artifacts (')) {
      const [
        id,
        scopeId,
        intentId,
        runId,
        kind,
        title,
        content,
        url,
        previewUrl,
        downloadUrl,
        fileName,
        fileSize,
        mimeType,
        localPath,
        createdAt,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        number | null,
        string | null,
        string | null,
        number,
      ];

      this.artifacts.set(id, {
        id,
        scope_id: scopeId,
        intent_id: intentId,
        run_id: runId,
        kind,
        title,
        content: content ?? null,
        url: url ?? null,
        preview_url: previewUrl ?? null,
        download_url: downloadUrl ?? null,
        file_name: fileName ?? null,
        file_size: fileSize ?? null,
        mime_type: mimeType ?? null,
        local_path: localPath ?? null,
        created_at: createdAt,
      });
      return { changes: 1 };
    }

    throw new Error(`Unsupported in-memory SQL run query: ${query}`);
  }

  private getStatement(query: string, params: unknown[]): SqlRow | undefined {
    if (query === 'select title from intents where id = ?') {
      const [intentId] = params as [string];
      const row = this.intents.get(intentId);
      return row ? { title: row.title } : undefined;
    }

    if (query === 'select last_seq from stream_head where scope_id = ? and stream_id = ?') {
      const [scopeId, streamId] = params as [string, string];
      const row = this.streamHead.get(this.streamHeadKey(scopeId, streamId));
      return row ? { last_seq: row.last_seq } : undefined;
    }

    if (query === 'select ack_payload, payload_hash from idempotency where scope_id = ? and client_id = ? and req_id = ?') {
      const [scopeId, clientId, reqId] = params as [string, string, string];
      const row = this.idempotency.get(this.idempotencyKey(scopeId, clientId, reqId));
      if (!row) return undefined;
      return {
        ack_payload: row.ack_payload,
        payload_hash: row.payload_hash,
      };
    }

    if (query === 'select * from artifacts where id = ? limit 1') {
      const [artifactId] = params as [string];
      const row = this.artifacts.get(artifactId);
      return row ? cloneRow(row) : undefined;
    }

    throw new Error(`Unsupported in-memory SQL get query: ${query}`);
  }

  private allStatement(query: string, params: unknown[]): SqlRow[] {
    if (query === 'select * from intents') {
      return Array.from(this.intents.values(), (row) => cloneRow(row));
    }

    if (query === 'select * from intent_summary where scope_id = ?') {
      const [scopeId] = params as [string];
      return Array.from(this.intentSummary.values())
        .filter((row) => row.scope_id === scopeId)
        .map((row) => cloneRow(row));
    }

    if (query === 'select * from events where stream_id = ? order by server_seq asc') {
      const [streamId] = params as [string];
      return this.events
        .filter((row) => row.stream_id === streamId)
        .sort((a, b) => a.server_seq - b.server_seq)
        .map((row) => cloneRow(row));
    }

    if (query === 'select server_seq as serverseq, type, payload, ts from events where scope_id = ? and stream_id = ? and server_seq > ? order by server_seq asc') {
      const [scopeId, streamId, afterSeq] = params as [string, string, number];
      return this.events
        .filter((row) => row.scope_id === scopeId && row.stream_id === streamId && row.server_seq > afterSeq)
        .sort((a, b) => a.server_seq - b.server_seq)
        .map((row) => ({
          serverSeq: row.server_seq,
          type: row.type,
          payload: row.payload,
          ts: row.ts,
        }));
    }

    throw new Error(`Unsupported in-memory SQL all query: ${query}`);
  }
}

export function createDatabase(): AppDatabase {
  if (process.env.INTENTOS_FORCE_MEMORY_DB === '1' || process.env.INTENTOS_DB_MODE === 'memory') {
    logger.warn('INTENTOS_FORCE_MEMORY_DB is enabled. Using in-memory DB.');
  }
  const memory = new InMemorySqlite();
  memory.exec(SCHEMA_SQL);
  return {
    sqlite: memory,
    mode: 'memory',
  };
}

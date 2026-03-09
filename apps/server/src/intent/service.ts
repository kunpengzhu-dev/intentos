import { nanoid } from 'nanoid';
import { IntentStatus, RunStatus } from '@intentos/protocol';
import type { Envelope } from '@intentos/protocol';
import type { AppDatabase } from '../db/index.js';
import { appendEvent } from './event-store.js';
import { broadcastToStream, sendEnvelope } from '../ws/server.js';
import type { WsSession } from '../ws/server.js';
import { logger } from '../config/logger.js';
import type { AgentAdapter } from '../agent/index.js';

export function createIntent(
  database: AppDatabase,
  session: WsSession,
  message: string,
  adapter: AgentAdapter,
  _source: 'user' | 'agent',
) {
  const intentId = nanoid();
  const runId = nanoid();
  const now = Date.now();

  database.sqlite
    .prepare('INSERT INTO intents (scope_id, id, title, original_message, status, current_run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(session.scopeId, intentId, message.slice(0, 100), message, IntentStatus.Active, runId, now, now);

  database.sqlite
    .prepare('INSERT INTO runs (scope_id, id, intent_id, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(session.scopeId, runId, intentId, RunStatus.Queued, now);

  const createdPayload = {
    intentId,
    title: message.slice(0, 100),
    status: IntentStatus.Active,
    currentRunId: runId,
    createdAt: now,
    source: _source,
  };
  const seq = appendEvent(database, session.scopeId, 'global', 'intent/created', createdPayload);

  const createdEvt: Envelope = {
    id: nanoid(),
    version: 1,
    kind: 'evt',
    type: 'intent/created',
    ts: now,
    scopeId: session.scopeId,
    streamId: 'global',
    serverSeq: seq,
    payload: createdPayload,
  };
  broadcastToStream('global', createdEvt);

  database.sqlite
    .prepare('INSERT OR REPLACE INTO intent_summary (scope_id, intent_id, title, status, current_run_id, updated_at, needs_attention) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(session.scopeId, intentId, message.slice(0, 100), IntentStatus.Active, runId, now, 0);

  void startRunWithAdapter(database, session, adapter, intentId, runId, message);

  return { intentId, runId };
}

async function startRunWithAdapter(
  database: AppDatabase,
  session: WsSession,
  adapter: AgentAdapter,
  intentId: string,
  runId: string,
  task: string,
) {
  const streamId = `run:${runId}`;
  const now = Date.now();

  database.sqlite
    .prepare('UPDATE runs SET status = ?, started_at = ? WHERE id = ?')
    .run(RunStatus.Running, now, runId);

  const startedPayload = { intentId, runId, startedAt: now };
  const seq = appendEvent(database, session.scopeId, streamId, 'run/started', startedPayload);

  const startedEvt: Envelope = {
    id: nanoid(),
    version: 1,
    kind: 'evt',
    type: 'run/started',
    ts: now,
    scopeId: session.scopeId,
    streamId,
    serverSeq: seq,
    payload: startedPayload,
  };
  broadcastToStream(streamId, startedEvt);

  try {
    await adapter.executeTask(
      { intentId, runId, task },
      {
        onStepUpdate: (update) => {
          const stepPayload = {
            intentId,
            runId,
            step: {
              id: update.stepId || nanoid(),
              runId,
              kind: update.kind,
              title: update.title,
              status: update.status,
              progress: update.progress,
              startedAt: Date.now(),
              endedAt: update.status === 'done' || update.status === 'failed' ? Date.now() : undefined,
              data: update.data,
            },
          };
          const stepSeq = appendEvent(database, session.scopeId, streamId, 'run/step_upserted', stepPayload);
          broadcastToStream(streamId, {
            id: nanoid(),
            version: 1,
            kind: 'evt',
            type: 'run/step_upserted',
            ts: Date.now(),
            scopeId: session.scopeId,
            streamId,
            serverSeq: stepSeq,
            payload: stepPayload,
          });
        },
        onNeedsApproval: (approval) => {
          const approvalPayload = {
            intentId,
            runId,
            approval: {
              id: approval.id,
              kind: approval.kind,
              title: approval.title,
              description: approval.description,
              blocking: approval.blocking,
            },
          };
          const approvalSeq = appendEvent(database, session.scopeId, streamId, 'run/needs_approval', approvalPayload);
          broadcastToStream(streamId, {
            id: nanoid(),
            version: 1,
            kind: 'evt',
            type: 'run/needs_approval',
            ts: Date.now(),
            scopeId: session.scopeId,
            streamId,
            serverSeq: approvalSeq,
            payload: approvalPayload,
          });
        },
        onProgress: (progress, message) => {
          sendEnvelope(session.ws, {
            id: nanoid(),
            version: 1,
            kind: 'notify',
            type: 'run/progress',
            ts: Date.now(),
            payload: { intentId, runId, progress, message },
          });
        },
        onComplete: () => {
          completeRun(database, session, intentId, runId, streamId);
        },
        onError: (error) => {
          failRun(database, session, intentId, runId, streamId, error.message);
        },
      },
    );
  } catch (error) {
    logger.error({ err: error, intentId, runId }, 'Adapter execution failed');
    failRun(database, session, intentId, runId, streamId, 'Agent execution failed.');
  }
}

function completeRun(
  database: AppDatabase,
  session: WsSession,
  intentId: string,
  runId: string,
  streamId: string,
) {
  const now = Date.now();

  database.sqlite
    .prepare('UPDATE runs SET status = ?, completed_at = ? WHERE id = ?')
    .run(RunStatus.Completed, now, runId);

  database.sqlite
    .prepare('UPDATE intents SET status = ?, updated_at = ? WHERE id = ?')
    .run(IntentStatus.Completed, now, intentId);

  const intentRow = database.sqlite
    .prepare('SELECT title FROM intents WHERE id = ?')
    .get(intentId) as { title: string } | undefined;
  const intentTitle = intentRow?.title ?? 'Unknown';

  const completedPayload = {
    intentId,
    runId,
    artifacts: [{
      id: nanoid(),
      intentId,
      runId,
      kind: 'text',
      title: 'Result',
      content: 'Task completed successfully. This is a mock result.',
      createdAt: now,
    }],
  };

  const completedSeq = appendEvent(database, session.scopeId, streamId, 'run/completed', completedPayload);

  broadcastToStream(streamId, {
    id: nanoid(),
    version: 1,
    kind: 'evt',
    type: 'run/completed',
    ts: now,
    scopeId: session.scopeId,
    streamId,
    serverSeq: completedSeq,
    payload: completedPayload,
  });

  const statusPayload = {
    intentId,
    title: intentTitle,
    status: IntentStatus.Completed,
    currentRunId: runId,
    updatedAt: now,
    needsAttention: false,
    artifactCount: 1,
  };

  const globalSeq = appendEvent(database, session.scopeId, 'global', 'intent/status_changed', statusPayload);

  broadcastToStream('global', {
    id: nanoid(),
    version: 1,
    kind: 'evt',
    type: 'intent/status_changed',
    ts: now,
    scopeId: session.scopeId,
    streamId: 'global',
    serverSeq: globalSeq,
    payload: statusPayload,
  });

  database.sqlite
    .prepare('UPDATE intent_summary SET status = ?, updated_at = ?, artifact_count = ? WHERE intent_id = ?')
    .run(IntentStatus.Completed, now, 1, intentId);

  logger.info(`Intent ${intentId} completed`);
}

function failRun(
  database: AppDatabase,
  session: WsSession,
  intentId: string,
  runId: string,
  streamId: string,
  reason: string,
) {
  const now = Date.now();

  database.sqlite
    .prepare('UPDATE runs SET status = ?, completed_at = ? WHERE id = ?')
    .run(RunStatus.Failed, now, runId);
  database.sqlite
    .prepare('UPDATE intents SET status = ?, updated_at = ? WHERE id = ?')
    .run(IntentStatus.Failed, now, intentId);
  database.sqlite
    .prepare('UPDATE intent_summary SET status = ?, updated_at = ?, needs_attention = ? WHERE intent_id = ?')
    .run(IntentStatus.Failed, now, 1, intentId);

  const failedPayload = { intentId, runId, error: { code: 'AGENT_FAILED', message: reason } };
  const runSeq = appendEvent(database, session.scopeId, streamId, 'run/failed', failedPayload);
  broadcastToStream(streamId, {
    id: nanoid(),
    version: 1,
    kind: 'evt',
    type: 'run/failed',
    ts: now,
    scopeId: session.scopeId,
    streamId,
    serverSeq: runSeq,
    payload: failedPayload,
  });

  const intentRow = database.sqlite
    .prepare('SELECT title FROM intents WHERE id = ?')
    .get(intentId) as { title: string } | undefined;
  const statusPayload = {
    intentId,
    title: intentRow?.title ?? 'Unknown',
    status: IntentStatus.Failed,
    currentRunId: runId,
    updatedAt: now,
    needsAttention: true,
    artifactCount: 0,
  };
  const globalSeq = appendEvent(database, session.scopeId, 'global', 'intent/status_changed', statusPayload);
  broadcastToStream('global', {
    id: nanoid(),
    version: 1,
    kind: 'evt',
    type: 'intent/status_changed',
    ts: now,
    scopeId: session.scopeId,
    streamId: 'global',
    serverSeq: globalSeq,
    payload: statusPayload,
  });
}

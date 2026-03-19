import type {
  BootCompletedPayload,
  BootFailedPayload,
  BootStartAckPayload,
  BootStepUpdatedPayload,
  Envelope,
} from '@intentos/protocol';
import { nanoid } from 'nanoid';
import type { WsSession } from '../ws/server.js';
import { getSessions, sendEnvelope } from '../ws/server.js';
import type { BootProvider, ActiveBootSession, BootStepsPayload } from './types.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

function resolveBootCallbackBaseUrl(): string {
  return env.BOOT_CALLBACK_BASE_URL && env.BOOT_CALLBACK_BASE_URL.trim().length > 0
    ? env.BOOT_CALLBACK_BASE_URL
    : `http://localhost:${env.PORT}`;
}

export class BootService {
  private readonly activeBootsBySession = new Map<string, ActiveBootSession>();
  private readonly activeBootsByToken = new Map<string, ActiveBootSession>();

  constructor(private readonly provider: BootProvider) {}

  async handleStart(session: WsSession, envelope: Envelope): Promise<void> {
    const existing = this.activeBootsBySession.get(session.id);

    if (existing?.status === 'started') {
      this.sendStartAck(session, envelope.reqId, envelope.clientSeq, {
        status: 'already_started',
        steps: existing.steps,
      });
      return;
    }

    if (existing?.status === 'starting') {
      return;
    }

    const callbackToken = nanoid();
    const active: ActiveBootSession = {
      sessionId: session.id,
      callbackToken,
      status: 'starting',
      steps: [],
      stepStates: {},
      startReqId: envelope.reqId,
      startClientSeq: envelope.clientSeq,
    };

    this.activeBootsBySession.set(session.id, active);
    this.activeBootsByToken.set(callbackToken, active);
    logger.info(`Boot started: sessionId=${session.id}`);

    if (!this.provider.run) {
      return;
    }

    try {
      await this.provider.run({
        sessionId: session.id,
        callbackToken,
        callbackBaseUrl: resolveBootCallbackBaseUrl(),
      });
    } catch (error) {
      this.emitFailed(session, {
        reason: error instanceof Error ? error.message : 'Boot script failed',
        failedAt: new Date().toISOString(),
      });
    }
  }

  handleStepsCallback(callbackToken: string, payload: BootStepsPayload): boolean {
    const active = this.activeBootsByToken.get(callbackToken);
    if (!active) {
      return false;
    }

    const session = this.resolveSession(active.sessionId);
    if (!session) {
      return false;
    }

    const steps = [...payload.steps];
    const ids = new Set<string>();

    for (const step of steps) {
      if (ids.has(step.id)) {
        return false;
      }
      ids.add(step.id);
    }

    if (active.status === 'started') {
      // Idempotent accept for repeated /steps callbacks from the same token.
      if (areSameSteps(active.steps, steps)) {
        return true;
      }
      return false;
    }

    if (active.status !== 'starting') {
      return false;
    }

    active.steps = steps;
    active.stepStates = Object.fromEntries(steps.map((step) => [step.id, 'pending']));
    active.status = 'started';

    this.sendStartAck(session, active.startReqId, active.startClientSeq, {
      status: 'started',
      steps,
    });
    return true;
  }

  handleStepCallback(callbackToken: string, payload: BootStepUpdatedPayload): boolean {
    const active = this.activeBootsByToken.get(callbackToken);
    if (!active || active.status !== 'started') {
      return false;
    }

    const session = this.resolveSession(active.sessionId);
    if (!session) {
      return false;
    }

    return this.emitStepUpdated(session, payload);
  }

  handleCompletedCallback(callbackToken: string, payload: BootCompletedPayload): boolean {
    const active = this.activeBootsByToken.get(callbackToken);
    if (!active || active.status !== 'started') {
      return false;
    }

    const session = this.resolveSession(active.sessionId);
    if (!session) {
      return false;
    }

    return this.emitCompleted(session, payload);
  }

  handleFailedCallback(callbackToken: string, payload: BootFailedPayload): boolean {
    const active = this.activeBootsByToken.get(callbackToken);
    if (!active || (active.status !== 'started' && active.status !== 'starting')) {
      return false;
    }

    const session = this.resolveSession(active.sessionId);
    if (!session) {
      return false;
    }

    return this.emitFailed(session, payload);
  }

  hasActiveCallbackToken(callbackToken: string): boolean {
    return this.activeBootsByToken.has(callbackToken);
  }

  private sendStartAck(
    session: WsSession,
    reqId: string | undefined,
    clientSeq: number | undefined,
    payload: BootStartAckPayload,
  ) {
    sendEnvelope(session.ws, {
      id: nanoid(),
      version: 1,
      kind: 'ack',
      type: 'boot/start',
      ts: Date.now(),
      reqId,
      clientSeq,
      sessionId: session.sessionId,
      payload,
    });
  }

  private emitStepUpdated(session: WsSession, payload: BootStepUpdatedPayload): boolean {
    const active = this.activeBootsBySession.get(session.id);
    if (!active || active.status !== 'started') {
      return false;
    }

    if (!active.steps.some((step) => step.id === payload.stepId)) {
      return false;
    }

    active.stepStates[payload.stepId] = payload.state;
    if (payload.state === 'failed') {
      active.status = 'failed';
    }

    sendEnvelope(session.ws, {
      id: nanoid(),
      version: 1,
      kind: 'notify',
      type: 'boot/step.updated',
      ts: Date.now(),
      payload,
    });
    return true;
  }

  private emitCompleted(session: WsSession, payload: BootCompletedPayload): boolean {
    const active = this.activeBootsBySession.get(session.id);
    if (!active || active.status !== 'started') {
      return false;
    }

    const allDone = active.steps.every((step) => active.stepStates[step.id] === 'ok');
    if (!allDone) {
      return false;
    }

    active.status = 'completed';
    this.activeBootsByToken.delete(active.callbackToken);

    sendEnvelope(session.ws, {
      id: nanoid(),
      version: 1,
      kind: 'notify',
      type: 'boot/completed',
      ts: Date.now(),
      payload,
    });
    return true;
  }

  private emitFailed(session: WsSession, payload: BootFailedPayload): boolean {
    const active = this.activeBootsBySession.get(session.id);
    if (!active || (active.status !== 'started' && active.status !== 'starting')) {
      return false;
    }

    if (active.status === 'started' && payload.stepId && !active.steps.some((step) => step.id === payload.stepId)) {
      return false;
    }

    if (active.status === 'starting') {
      this.sendStartAck(session, active.startReqId, active.startClientSeq, {
        status: 'started',
        steps: [],
      });
    }

    active.status = 'failed';
    this.activeBootsByToken.delete(active.callbackToken);

    sendEnvelope(session.ws, {
      id: nanoid(),
      version: 1,
      kind: 'notify',
      type: 'boot/failed',
      ts: Date.now(),
      payload,
    });
    return true;
  }

  private resolveSession(sessionId: string): WsSession | null {
    return getSessions().get(sessionId) ?? null;
  }
}

function areSameSteps(
  left: ActiveBootSession['steps'],
  right: ActiveBootSession['steps'],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) {
      return false;
    }
    if (a.id !== b.id || a.label !== b.label || (a.weight ?? 1) !== (b.weight ?? 1)) {
      return false;
    }
  }
  return true;
}

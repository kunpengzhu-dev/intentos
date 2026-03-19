import type { BootStartAckPayload, BootStepUpdatedPayload } from '@intentos/protocol';

export type BootSessionStatus = 'starting' | 'started' | 'completed' | 'failed';

export type BootStepsPayload = {
  steps: BootStartAckPayload['steps'];
};

export type ActiveBootSession = {
  sessionId: string;
  callbackToken: string;
  status: BootSessionStatus;
  steps: BootStartAckPayload['steps'];
  stepStates: Record<string, BootStepUpdatedPayload['state']>;
  startReqId?: string;
  startClientSeq?: number;
};

export type BootProvider = {
  run?: (args: {
    sessionId: string;
    callbackToken: string;
    callbackBaseUrl: string;
  }) => Promise<void> | void;
};

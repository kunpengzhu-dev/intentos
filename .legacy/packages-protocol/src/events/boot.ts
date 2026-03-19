export type BootStep = {
  id: string;
  label: string;
  weight?: number;
};

export type BootStepState = 'pending' | 'running' | 'ok' | 'failed';

export type BootStartPayload = Record<string, never>;

export type BootStartAckPayload = {
  status: 'started' | 'already_started';
  steps: BootStep[];
};

export type BootStepUpdatedPayload = {
  stepId: string;
  state: BootStepState;
  message?: string;
  error?: string;
  updatedAt: string;
};

export type BootCompletedPayload = {
  completedAt: string;
};

export type BootFailedPayload = {
  stepId?: string;
  reason: string;
  failedAt: string;
};

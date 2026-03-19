export const IntentStatus = {
  Active: 'active',
  WaitingForUser: 'waiting',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'cancelled',
  Desynced: 'desynced',
} as const;
export type IntentStatus = (typeof IntentStatus)[keyof typeof IntentStatus];

export const RunStatus = {
  Queued: 'queued',
  Running: 'running',
  WaitingForUser: 'waiting_for_user',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'cancelled',
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const PROTOCOL_VERSION = 1;

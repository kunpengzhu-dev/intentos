import { IntentStatus, RunStatus } from '@intentos/protocol';

type IntentStatusValue = (typeof IntentStatus)[keyof typeof IntentStatus];
type RunStatusValue = (typeof RunStatus)[keyof typeof RunStatus];

export function canCancel(status: IntentStatusValue): boolean {
  return status === IntentStatus.Active || status === IntentStatus.WaitingForUser;
}

export function canRetry(intentStatus: IntentStatusValue, latestRunStatus?: RunStatusValue): boolean {
  if (intentStatus !== IntentStatus.Failed) return false;
  if (latestRunStatus && latestRunStatus !== RunStatus.Failed) return false;
  return true;
}

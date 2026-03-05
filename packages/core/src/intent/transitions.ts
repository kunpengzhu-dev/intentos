import { IntentStatus } from '@intentos/protocol';

type IntentStatusValue = (typeof IntentStatus)[keyof typeof IntentStatus];

const VALID_TRANSITIONS: Record<string, IntentStatusValue[]> = {
  [IntentStatus.Active]: [IntentStatus.WaitingForUser, IntentStatus.Completed, IntentStatus.Failed, IntentStatus.Cancelled],
  [IntentStatus.WaitingForUser]: [IntentStatus.Active, IntentStatus.Cancelled],
  [IntentStatus.Failed]: [IntentStatus.Active],
  [IntentStatus.Completed]: [],
  [IntentStatus.Cancelled]: [],
};

export function isValidIntentTransition(from: IntentStatusValue, to: IntentStatusValue): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

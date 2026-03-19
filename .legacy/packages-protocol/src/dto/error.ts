export type IntentError = {
  code: string;
  message: string;
  category: 'transient' | 'permanent' | 'user_action_required';
  retryable: boolean;
  details?: unknown;
};
